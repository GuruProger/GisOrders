import logging
from typing import Optional, Sequence

from sqlalchemy import Row, and_, desc, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.errors import ConflictError, ForbiddenError, NotFoundError

from ..orders.models import OrderProposal, ProposalStatus
from .models import Chat, Message
from .schemas import ChatCreate, MessageCreate

logger = logging.getLogger(__name__)


class ChatService:
	@staticmethod
	async def create_chat(session: AsyncSession, chat_data: ChatCreate) -> Chat:
		"""Создание нового чата"""
		stmt = select(Chat).where(
			and_(
				Chat.order_id == chat_data.order_id,
				Chat.executor_id == chat_data.executor_id
			)
		)
		result = await session.execute(stmt)
		existing_chat = result.scalar_one_or_none()
		
		if existing_chat:
			return existing_chat
		
		chat = Chat(
			order_id=chat_data.order_id,
			customer_id=chat_data.customer_id,
			executor_id=chat_data.executor_id,
			proposal_id=chat_data.proposal_id,
			is_active=True
		)
		
		session.add(chat)
		try:
			await session.flush()
			await session.refresh(chat)
			return chat
		except IntegrityError as e:
			logger.error("IntegrityError in create_chat", exc_info=e)
			raise ConflictError(
				"Не удалось создать чат",
				code="chat_creation_failed",
				resource="chat",
			)
	
	@staticmethod
	async def get_chat_by_id(session: AsyncSession, chat_id: int) -> Optional[Chat]:
		"""Получение чата по ID"""
		stmt = select(Chat).where(Chat.id == chat_id)
		result = await session.execute(stmt)
		return result.scalar_one_or_none()
	
	@staticmethod
	async def get_user_chats(session: AsyncSession, user_id: int) -> Sequence[Row[tuple[Chat, Optional[str], int]]]:
		"""Получение всех чатов пользователя с последним сообщением и счётчиком непрочитанных."""
		
		# Последнее сообщение для каждого чата
		last_message_subq = (
			select(Message.text)
			.where(Message.chat_id == Chat.id)
			.order_by(Message.created_at.desc(), Message.id.desc())
			.limit(1)
			.correlate(Chat)
			.scalar_subquery()
			.label("last_message")
		)
		
		# Количество непрочитанных сообщений от собеседника
		unread_count_subq = (
			select(func.count(Message.id))
			.where(
				Message.chat_id == Chat.id,
				Message.is_read == False,
				Message.sender_id != user_id
			)
			.correlate(Chat)
			.scalar_subquery()
			.label("unread_count")
		)
		
		stmt = (
			select(Chat, last_message_subq, unread_count_subq)
			.where(
				and_(
					Chat.is_active == True,
					(Chat.customer_id == user_id) | (Chat.executor_id == user_id)
				)
			)
			.order_by(desc(Chat.updated_at))
		)
		
		result = await session.execute(stmt)
		return result.all()  # Возвращает список кортежей (Chat, last_message, unread_count)
	
	@staticmethod
	async def close_chat(session: AsyncSession, chat_id: int, user_id: int) -> Chat:
		"""Закрытие чата. Доступно только участникам чата."""
		chat = await ChatService.get_chat_by_id(session, chat_id)
		if not chat:
			raise NotFoundError(
				"Чат не найден",
				resource="chat",
				resource_id=chat_id,
			)
		
		# Проверяем, что пользователь является участником чата
		if chat.customer_id != user_id and chat.executor_id != user_id:
			raise ForbiddenError(
				"Недостаточно прав для закрытия чата",
				code="chat_access_denied",
				resource="chat",
				resource_id=chat_id,
			)
		
		if not chat.is_active:
			raise ConflictError(
				"Чат уже закрыт",
				code="chat_already_closed",
				resource="chat",
				resource_id=chat_id,
			)
		
		# Если чат связан с откликом, удаляем этот отклик.
		# Исключение - принятый отклик: его чат закрывается вместе с заказом.
		if chat.proposal_id:
			stmt = select(OrderProposal).where(OrderProposal.id == chat.proposal_id)
			result = await session.execute(stmt)
			proposal = result.scalar_one_or_none()
			if proposal and proposal.status == ProposalStatus.ACCEPTED:
				raise ConflictError(
					"Чат выбранного исполнителя закрывается вместе с заказом",
					code="accepted_proposal_chat",
					resource="chat",
					resource_id=chat_id,
				)
			if proposal:
				await session.delete(proposal)
		
		# Помечаем все непрочитанные сообщения в прочитанными
		stmt_update = update(Message).where(
			and_(Message.chat_id == chat_id, Message.is_read == False)
		).values(is_read=True)
		await session.execute(stmt_update)
		
		chat.is_active = False
		await session.flush()
		await session.refresh(chat)
		return chat


class MessageService:
	@staticmethod
	async def create_message(session: AsyncSession,
	                         chat_id: int, message_data: MessageCreate, sender_id: int) -> Message:
		"""Создание нового сообщения"""
		# Проверяем, существует ли чат и является ли пользователь его участником
		chat = await ChatService.get_chat_by_id(session, chat_id)
		if not chat:
			raise NotFoundError(
				"Чат не найден",
				resource="chat",
				resource_id=chat_id,
			)
		
		if chat.customer_id != sender_id and chat.executor_id != sender_id:
			raise ForbiddenError(
				"Вы не являетесь участником этого чата",
				code="chat_access_denied",
				resource="chat",
				resource_id=chat_id,
			)
		
		if not chat.is_active:
			raise ConflictError(
				"Нельзя отправлять сообщения в закрытый чат",
				code="chat_closed",
				resource="chat",
				resource_id=chat_id,
			)
		
		message = Message(
			text=message_data.text,
			chat_id=chat_id,
			sender_id=sender_id,
			is_read=False
		)
		
		session.add(message)
		
		# Обновляем updated_at у чата
		chat.updated_at = func.now()
		
		try:
			await session.flush()
			await session.refresh(message)
			return message
		except IntegrityError as e:
			logger.error("IntegrityError in create_message", exc_info=e)
			raise ConflictError(
				"Не удалось отправить сообщение",
				code="message_creation_failed",
				resource="message",
			)
	
	@staticmethod
	async def get_chat_messages(
			session: AsyncSession,
			chat_id: int,
			limit: int = 100,
			offset: int = 0
	) -> Sequence[Message]:
		"""Получение сообщений чата с пагинацией"""
		stmt = select(Message).where(
			Message.chat_id == chat_id
		).order_by(desc(Message.created_at)).limit(limit).offset(offset)
		
		result = await session.execute(stmt)
		return result.scalars().all()
	
	@staticmethod
	async def get_last_message_text(
			session: AsyncSession,
			chat_id: int,
	) -> Optional[str]:
		"""Получить текст последнего сообщения в чате."""
		stmt = (
			select(Message.text)
			.where(Message.chat_id == chat_id)
			.order_by(Message.created_at.desc(), Message.id.desc())
			.limit(1)
		)
		result = await session.execute(stmt)
		return result.scalar_one_or_none()
	
	@staticmethod
	async def mark_messages_as_read(
			session: AsyncSession,
			chat_id: int,
			user_id: int,
	) -> int:
		"""Пометить все сообщения в чате как прочитанные (кроме своих)."""
		chat = await ChatService.get_chat_by_id(session, chat_id)
		
		if not chat:
			raise NotFoundError(
				"Чат не найден",
				resource="chat",
				resource_id=chat_id,
			)
		
		if chat.customer_id != user_id and chat.executor_id != user_id:
			raise ForbiddenError(
				"Недостаточно прав для пометки сообщений",
				code="chat_access_denied",
				resource="chat",
				resource_id=chat_id,
			)
		
		other_user_id = (
			chat.executor_id
			if chat.customer_id == user_id
			else chat.customer_id
		)
		
		stmt = (
			update(Message)
			.where(
				and_(
					Message.chat_id == chat_id,
					Message.sender_id == other_user_id,
					Message.is_read == False,
				)
			)
			.values(is_read=True)
		)
		
		result = await session.execute(stmt)
		await session.flush()
		
		return int(result.rowcount or 0)
	
	@staticmethod
	async def get_unread_count(session: AsyncSession, chat_id: int, user_id: int) -> int:
		"""Получить количество непрочитанных сообщений для пользователя"""
		chat = await ChatService.get_chat_by_id(session, chat_id)
		if not chat:
			raise NotFoundError(
				"Чат не найден",
				resource="chat",
				resource_id=chat_id,
			)
		
		# Проверяем участие пользователя
		if chat.customer_id != user_id and chat.executor_id != user_id:
			raise ForbiddenError(
				"Недостаточно прав для просмотра чата",
				code="chat_access_denied",
				resource="chat",
				resource_id=chat_id,
			)
		
		# Определяем ID собеседника
		other_user_id = chat.executor_id if chat.customer_id == user_id else chat.customer_id
		
		stmt = select(func.count(Message.id)).where(
			and_(
				Message.chat_id == chat_id,
				Message.sender_id == other_user_id,
				Message.is_read == False
			)
		)
		result = await session.execute(stmt)
		return result.scalar() or 0
	
	@staticmethod
	async def get_total_unread_count(session: AsyncSession, user_id: int) -> int:
		"""Получить общее количество непрочитанных сообщений во всех чатах"""
		stmt = select(func.count(Message.id)).where(
			and_(
				Message.is_read == False,
				Message.sender_id != user_id,
				Message.chat_id.in_(
					select(Chat.id).where(
						and_(
							Chat.is_active == True,
							(Chat.customer_id == user_id) | (Chat.executor_id == user_id)
						)
					)
				)
			)
		)
		result = await session.execute(stmt)
		return result.scalar() or 0
