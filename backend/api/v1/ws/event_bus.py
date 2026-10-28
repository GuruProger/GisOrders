import asyncio
import json
import logging
import uuid
from typing import Optional

from fastapi import WebSocket
from redis.asyncio import Redis

from core.config import settings
from core.redis import create_redis_client

from .manager import ConnectionManager, manager

logger = logging.getLogger(__name__)

DEFAULT_CHANNEL = "gisorders:ws:events"

# id() уникален только внутри процесса, поэтому origin помечается токеном
# процесса: иначе другой воркер мог бы случайно исключить своего клиента.
PROCESS_TOKEN = uuid.uuid4().hex


class EventBus:
	"""
	Рассылка WebSocket-событий внутри процесса и между воркерами.

	Без REDIS_URL событие доставляется только локальным подключениям.
	С Redis событие публикуется в общий канал, а каждый воркер подписан на него
	и раздаёт событие своим клиентам. Это позволяет запускать несколько
	процессов uvicorn без потери сообщений.
	"""
	
	def __init__(
			self,
			manager: ConnectionManager,
			*,
			redis_client: Optional[Redis] = None,
			redis_url: str | None = None,
			channel: str = DEFAULT_CHANNEL,
	) -> None:
		self._manager = manager
		self._redis = redis_client if redis_client is not None else create_redis_client(redis_url)
		self._channel = channel
		self._pubsub = None
		self._listener_task: asyncio.Task | None = None
		self._started = False
		self._redis_available = self._redis is not None
	
	async def start(self) -> None:
		"""Подписывается на канал Redis (если он настроен)."""
		if self._started:
			return
		
		self._started = True
		if self._redis is None:
			return
		
		try:
			self._pubsub = self._redis.pubsub()
			await self._pubsub.subscribe(self._channel)
			self._listener_task = asyncio.create_task(
				self._listen(),
				name="websocket-event-bus",
			)
		except Exception:
			logger.warning(
				"Redis pub/sub unavailable, WebSocket events stay in-process",
				exc_info=True,
			)
			self._redis_available = False
			self._pubsub = None
	
	async def stop(self) -> None:
		self._started = False
		
		if self._listener_task is not None:
			self._listener_task.cancel()
			try:
				await self._listener_task
			except asyncio.CancelledError:
				pass
			self._listener_task = None
		
		if self._pubsub is not None:
			try:
				await self._pubsub.aclose()
			except Exception:
				logger.debug("Failed to close Redis pub/sub", exc_info=True)
			self._pubsub = None
	
	async def publish(
			self,
			chat_id: int,
			event: dict,
			exclude: WebSocket | None = None,
	) -> None:
		"""Публикует событие чата всем воркерам (или локально как fallback)."""
		payload = {
			"chat_id": chat_id,
			"event": event,
			# Не отправляем событие обратно его автору в этом же процессе
			"origin_process": PROCESS_TOKEN if exclude is not None else None,
			"origin_connection": id(exclude) if exclude is not None else None,
		}
		
		if self._started and self._redis_available and self._redis is not None:
			try:
				await self._redis.publish(
					self._channel,
					json.dumps(payload, ensure_ascii=False),
				)
				return
			except Exception:
				logger.warning(
					"Redis publish failed, falling back to local WebSocket delivery",
					exc_info=True,
				)
		
		await self._dispatch(payload)
	
	async def _listen(self) -> None:
		if self._pubsub is None:
			return
		
		try:
			async for message in self._pubsub.listen():
				if message.get("type") != "message":
					continue
				
				data = message.get("data")
				if isinstance(data, bytes):
					data = data.decode("utf-8")
				
				try:
					payload = json.loads(data)
				except (TypeError, ValueError):
					logger.warning("Ignoring malformed WebSocket event from Redis")
					continue
				
				await self._dispatch(payload)
		except asyncio.CancelledError:
			raise
		except Exception:
			logger.exception("Redis WebSocket event listener stopped")
	
	async def _dispatch(self, payload: dict) -> None:
		chat_id = payload.get("chat_id")
		event = payload.get("event")
		
		if not isinstance(chat_id, int) or not isinstance(event, dict):
			logger.warning("Ignoring WebSocket event with invalid payload")
			return
		
		exclude_origin = None
		if payload.get("origin_process") == PROCESS_TOKEN:
			exclude_origin = payload.get("origin_connection")
		
		await self._manager.broadcast(
			chat_id,
			event,
			exclude_origin=exclude_origin,
		)


event_bus = EventBus(manager=manager, redis_url=settings.redis_url)
