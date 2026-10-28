from sqlalchemy.ext.asyncio import AsyncSession

from core.errors import ForbiddenError, NotFoundError
from core.security import get_user_from_token
from ..chat.models import Chat
from ..chat.services import ChatService
from ..users.models import User


async def authenticate_websocket(session: AsyncSession, token: str) -> User:
	"""То же, что get_current_active_user, но для WebSocket-соединения."""
	user = await get_user_from_token(session, token)
	
	if not user.is_active:
		raise ForbiddenError(
			"Аккаунт заблокирован",
			code="user_blocked",
			resource="user",
			resource_id=user.id,
		)
	
	return user


async def get_chat_for_participant(
		session: AsyncSession,
		chat_id: int,
		user_id: int,
) -> Chat:
	"""Возвращает чат, только если пользователь его участник."""
	chat = await ChatService.get_chat_by_id(session, chat_id)
	
	if not chat:
		raise NotFoundError(
			"Чат не найден",
			resource="chat",
			resource_id=chat_id,
		)
	
	if chat.customer_id != user_id and chat.executor_id != user_id:
		raise ForbiddenError(
			"Вы не являетесь участником этого чата",
			code="chat_access_denied",
			resource="chat",
			resource_id=chat_id,
		)
	
	return chat
