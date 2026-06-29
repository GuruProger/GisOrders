from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated, List
from core.database import db_helper
from core.security import get_current_active_user
from .models import Chat, Message
from .schemas import (
	ChatResponse, ChatCreate, ChatWithMessagesResponse,
	MessageResponse, MessageCreate
)
from .services import ChatService, MessageService
from ..users.models import User

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get(
	"/my",
	response_model=List[ChatResponse],
	summary="Мои чаты",
	description="Получение списка всех чатов текущего пользователя"
)
async def get_my_chats(
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		chats = await ChatService.get_user_chats(session, current_user.id)
		
		# Для каждого чата получаем последнее сообщение и счётчик непрочитанных
		result = []
		for chat in chats:
			# Получаем последнее сообщение
			last_message = None
			if chat.messages:
				last_msg = max(chat.messages, key=lambda m: m.created_at)
				last_message = last_msg.text
			
			# Получаем количество непрочитанных
			unread_count = await MessageService.get_unread_count(session, chat.id, current_user.id)
			
			chat_dict = ChatResponse(
				id=chat.id,
				order_id=chat.order_id,
				customer_id=chat.customer_id,
				executor_id=chat.executor_id,
				proposal_id=chat.proposal_id,
				is_active=chat.is_active,
				created_at=chat.created_at,
				updated_at=chat.updated_at,
				last_message=last_message,
				unread_count=unread_count
			)
			result.append(chat_dict)
		
		return result
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)


@router.get(
	"/{chat_id}",
	response_model=ChatWithMessagesResponse,
	summary="Информация о чате с сообщениями",
	description="Получение информации о чате и последних сообщений"
)
async def get_chat(
		chat_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
		limit: int = Query(50, ge=1, le=200, description="Количество сообщений"),
		offset: int = Query(0, ge=0, description="Смещение для пагинации")
):
	chat = await ChatService.get_chat_by_id(session, chat_id)
	if not chat:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Чат не найден"
		)
	
	# Проверяем, что пользователь является участником чата
	if chat.customer_id != current_user.id and chat.executor_id != current_user.id:
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="Недостаточно прав для просмотра этого чата"
		)
	
	# Получаем сообщения
	messages = await MessageService.get_chat_messages(session, chat_id, limit, offset)
	
	# Получаем количество непрочитанных
	unread_count = await MessageService.get_unread_count(session, chat_id, current_user.id)
	
	# Получаем последнее сообщение
	last_message = None
	if chat.messages:
		last_msg = max(chat.messages, key=lambda m: m.created_at)
		last_message = last_msg.text
	
	return ChatWithMessagesResponse(
		id=chat.id,
		order_id=chat.order_id,
		customer_id=chat.customer_id,
		executor_id=chat.executor_id,
		proposal_id=chat.proposal_id,
		is_active=chat.is_active,
		created_at=chat.created_at,
		updated_at=chat.updated_at,
		last_message=last_message,
		unread_count=unread_count,
		messages=[MessageResponse(
			id=m.id,
			text=m.text,
			chat_id=m.chat_id,
			sender_id=m.sender_id,
			is_read=m.is_read,
			created_at=m.created_at
		) for m in reversed(messages)]  # Переворачиваем, чтобы старые были первыми
	)


@router.post(
	"/{chat_id}/messages",
	response_model=MessageResponse,
	summary="Отправить сообщение",
	description="Отправка нового сообщения в чат"
)
async def send_message(
		chat_id: int,
		message_data: MessageCreate,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		message = await MessageService.create_message(
			session,
			chat_id,
			message_data,
			current_user.id
		)
		return MessageResponse(
			id=message.id,
			text=message.text,
			chat_id=message.chat_id,
			sender_id=message.sender_id,
			is_read=message.is_read,
			created_at=message.created_at
		)
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)


@router.post(
	"/{chat_id}/read",
	summary="Пометить сообщения как прочитанные",
	description="Помечает все сообщения в чате как прочитанные"
)
async def mark_as_read(
		chat_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	try:
		count = await MessageService.mark_messages_as_read(session, chat_id, current_user.id)
		return {"message": f"Отмечено {count} сообщений как прочитанных"}
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)


@router.get(
	"/unread/count",
	summary="Количество непрочитанных сообщений",
	description="Получение общего количества непрочитанных сообщений"
)
async def get_unread_count(
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	count = await MessageService.get_total_unread_count(session, current_user.id)
	return {"unread_count": count}
