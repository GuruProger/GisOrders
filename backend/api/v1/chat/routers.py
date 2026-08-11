from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated, List
from core.database import db_helper
from core.security import get_current_active_user
from core.errors import NotFoundError, ForbiddenError
from .schemas import (
	ChatResponse, ChatCreate, ChatWithMessagesResponse,
	MessageResponse, MessageCreate
)
from .services import ChatService, MessageService
from ..users.models import User

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get(
	"/my",
	response_model=list[ChatResponse],
	summary="Мои чаты",
)
async def get_my_chats(
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	rows = await ChatService.get_user_chats(session, current_user.id)
	
	result = []
	for chat, last_message, unread_count in rows:
		result.append(ChatResponse(
			id=chat.id,
			order_id=chat.order_id,
			customer_id=chat.customer_id,
			executor_id=chat.executor_id,
			proposal_id=chat.proposal_id,
			is_active=chat.is_active,
			created_at=chat.created_at,
			updated_at=chat.updated_at,
			last_message=last_message,
			unread_count=unread_count or 0,
		))
	return result


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
		raise NotFoundError(
			"Чат не найден",
			resource="chat",
			resource_id=chat_id,
		)
	
	# Проверяем, что пользователь является участником чата
	if chat.customer_id != current_user.id and chat.executor_id != current_user.id:
		raise ForbiddenError(
			"Недостаточно прав для просмотра этого чата",
			code="chat_access_denied",
			resource="chat",
			resource_id=chat_id,
		)
	
	messages = await MessageService.get_chat_messages(session, chat_id, limit, offset)
	
	unread_count = await MessageService.get_unread_count(
		session,
		chat_id,
		current_user.id,
	)
	
	last_message = await MessageService.get_last_message_text(
		session,
		chat_id,
	)
	
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
	count = await MessageService.mark_messages_as_read(session, chat_id, current_user.id)
	return {"message": f"Отмечено {count} сообщений как прочитанных"}


@router.post(
	"/{chat_id}/close",
	response_model=ChatResponse,
	summary="Закрыть чат",
	description="Закрытие чата. Доступно только участникам чата. При закрытии чата связанный отклик автоматически отменяется."
)
async def close_chat(
		chat_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	chat = await ChatService.close_chat(session, chat_id, current_user.id)
	
	last_message = await MessageService.get_last_message_text(
		session,
		chat.id,
	)
	
	return ChatResponse(
		id=chat.id,
		order_id=chat.order_id,
		customer_id=chat.customer_id,
		executor_id=chat.executor_id,
		proposal_id=chat.proposal_id,
		is_active=chat.is_active,
		created_at=chat.created_at,
		updated_at=chat.updated_at,
		last_message=last_message,
		unread_count=0,  # После close_chat все прочитаны
	)
