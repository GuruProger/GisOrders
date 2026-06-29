from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload
from typing import Optional, Sequence
from .models import Chat, Message
from .schemas import ChatCreate, MessageCreate


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
			await session.commit()
			await session.refresh(chat)
			return chat
		except IntegrityError:
			await session.rollback()
			raise ValueError("Ошибка при создании чата")
	
	@staticmethod
	async def get_chat_by_id(session: AsyncSession, chat_id: int) -> Optional[Chat]:
		"""Получение чата по ID"""
		stmt = select(Chat).where(Chat.id == chat_id).options(
			selectinload(Chat.messages)  # ← ДОБАВИТЬ ЭТО для eager loading
		)
		result = await session.execute(stmt)
		return result.scalar_one_or_none()
	
	@staticmethod
	async def get_user_chats(session: AsyncSession, user_id: int) -> Sequence[Chat]:
		"""Получение всех чатов пользователя"""
		stmt = select(Chat).where(
			and_(
				Chat.is_active == True,
				(Chat.customer_id == user_id) | (Chat.executor_id == user_id)
			)
		).options(
			selectinload(Chat.messages)  # ← ДОБАВИТЬ ЭТО
		).order_by(desc(Chat.updated_at))
		
		result = await session.execute(stmt)
		return result.scalars().all()
	
	@staticmethod
	async def close_chat(session: AsyncSession, chat_id: int) -> Chat:
		"""Закрытие чата"""
		chat = await ChatService.get_chat_by_id(session, chat_id)
		if not chat:
			raise ValueError("Чат не найден")
		
		chat.is_active = False
		await session.commit()
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
			raise ValueError("Чат не найден")
		
		if chat.customer_id != sender_id and chat.executor_id != sender_id:
			raise ValueError("Вы не являетесь участником этого чата")
		
		if not chat.is_active:
			raise ValueError("Чат закрыт")
		
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
			await session.commit()
			await session.refresh(message)
			return message
		except IntegrityError:
			await session.rollback()
			raise ValueError("Ошибка при отправке сообщения")
	
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
	async def mark_messages_as_read(
			session: AsyncSession,
			chat_id: int,
			user_id: int
	) -> int:
		"""Пометить все сообщения в чате как прочитанные (кроме своих)"""
		chat = await ChatService.get_chat_by_id(session, chat_id)
		if not chat:
			raise ValueError("Чат не найден")
		
		# Определяем ID собеседника
		other_user_id = chat.executor_id if chat.customer_id == user_id else chat.customer_id
		
		stmt = (
			select(Message)
			.where(
				and_(
					Message.chat_id == chat_id,
					Message.sender_id == other_user_id,
					Message.is_read == False
				)
			)
		)
		result = await session.execute(stmt)
		messages = result.scalars().all()
		
		for message in messages:
			message.is_read = True
		
		await session.commit()
		return len(messages)
	
	@staticmethod
	async def get_unread_count(session: AsyncSession, chat_id: int, user_id: int) -> int:
		"""Получить количество непрочитанных сообщений для пользователя"""
		chat = await ChatService.get_chat_by_id(session, chat_id)
		if not chat:
			return 0
		
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
						(Chat.customer_id == user_id) | (Chat.executor_id == user_id)
					)
				)
			)
		)
		result = await session.execute(stmt)
		return result.scalar() or 0
