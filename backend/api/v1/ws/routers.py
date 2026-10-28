import asyncio
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import db_helper
from core.errors import (
	AppError,
	AuthenticationError,
	ForbiddenError,
	NotFoundError,
)

from ..chat.models import Chat
from ..chat.services import MessageService
from ..users.models import User
from .manager import manager
from .services import authenticate_websocket, get_chat_for_participant

logger = logging.getLogger(__name__)

router = APIRouter(tags=["realtime"])

# Коды закрытия в приватном диапазоне 4000-4999
CLOSE_AUTH_REQUIRED = 4401
CLOSE_FORBIDDEN = 4403
CLOSE_NOT_FOUND = 4404


def _close_code(exc: AppError) -> int:
	if isinstance(exc, AuthenticationError):
		return CLOSE_AUTH_REQUIRED
	if isinstance(exc, ForbiddenError):
		return CLOSE_FORBIDDEN
	if isinstance(exc, NotFoundError):
		return CLOSE_NOT_FOUND
	return CLOSE_AUTH_REQUIRED


async def _receive_auth_token(websocket: WebSocket) -> str | None:
	"""
	Ждёт первый кадр {"type": "auth", "token": "..."}.
	
	Браузерный WebSocket API не умеет ставить Authorization-заголовок,
	поэтому токен приходит первым сообщением, а не в handshake.
	"""
	try:
		frame = await asyncio.wait_for(
			websocket.receive_json(),
			timeout=settings.ws_auth_timeout_seconds,
		)
	except asyncio.TimeoutError:
		await websocket.close(code=CLOSE_AUTH_REQUIRED, reason="auth_timeout")
		return None
	except WebSocketDisconnect:
		return None
	except ValueError:
		await websocket.close(code=CLOSE_AUTH_REQUIRED, reason="auth_required")
		return None
	
	if not isinstance(frame, dict) or frame.get("type") != "auth":
		await websocket.close(code=CLOSE_AUTH_REQUIRED, reason="auth_required")
		return None
	
	token = frame.get("token")
	if not isinstance(token, str) or not token:
		await websocket.close(code=CLOSE_AUTH_REQUIRED, reason="auth_required")
		return None
	
	return token


async def _handle_event(
		event: dict,
		*,
		websocket: WebSocket,
		chat: Chat,
		user: User,
		session: AsyncSession,
) -> None:
	event_type = event.get("type")
	
	if event_type == "ping":
		await websocket.send_json({"type": "pong"})
		return
	
	if event_type == "typing":
		await manager.broadcast(
			chat.id,
			{
				"type": "typing",
				"chat_id": chat.id,
				"user_id": user.id,
				"is_typing": bool(event.get("is_typing", True)),
			},
			exclude=websocket,
		)
		return
	
	if event_type == "read":
		count = await MessageService.mark_messages_as_read(session, chat.id, user.id)
		await session.commit()
		await manager.broadcast(
			chat.id,
			{
				"type": "message.read",
				"chat_id": chat.id,
				"user_id": user.id,
				"count": count,
			},
			exclude=websocket,
		)
		return
	
	await websocket.send_json({
		"type": "error",
		"error_code": "unknown_event",
		"event_type": event_type,
	})


@router.websocket("/ws/chats/{chat_id}")
async def chat_events(
		websocket: WebSocket,
		chat_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
	"""
	Realtime-события чата.
	
	Клиент подключается, отправляет {"type": "auth", "token": "<access>"} и
	получает события message.created, message.read и typing. Отправка сообщений
	остаётся через REST.
	"""
	await websocket.accept()
	
	token = await _receive_auth_token(websocket)
	if token is None:
		return
	
	try:
		user = await authenticate_websocket(session, token)
		chat = await get_chat_for_participant(session, chat_id, user.id)
	except AppError as exc:
		await websocket.close(code=_close_code(exc), reason=exc.code)
		return
	
	await manager.connect(chat_id, websocket)
	
	try:
		await websocket.send_json({
			"type": "auth.ok",
			"chat_id": chat_id,
			"user_id": user.id,
		})
		
		while True:
			try:
				event = await websocket.receive_json()
			except ValueError:
				await websocket.send_json({
					"type": "error",
					"error_code": "invalid_json",
				})
				continue
			
			if not isinstance(event, dict):
				await websocket.send_json({
					"type": "error",
					"error_code": "invalid_event",
				})
				continue
			
			await _handle_event(
				event,
				websocket=websocket,
				chat=chat,
				user=user,
				session=session,
			)
	except WebSocketDisconnect:
		pass
	finally:
		await manager.disconnect(chat_id, websocket)
