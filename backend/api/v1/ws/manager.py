import asyncio
import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
	"""
	Активные WebSocket-подключения по чатам.
	
	Живёт в памяти процесса: при нескольких воркерах uvicorn события дойдут
	только до клиентов, подключённых к тому же процессу. Для горизонтального
	масштабирования нужен общий брокер (Redis pub/sub).
	"""
	
	def __init__(self) -> None:
		self._connections: dict[int, set[WebSocket]] = defaultdict(set)
		self._lock = asyncio.Lock()
	
	async def connect(self, chat_id: int, websocket: WebSocket) -> None:
		async with self._lock:
			self._connections[chat_id].add(websocket)
	
	async def disconnect(self, chat_id: int, websocket: WebSocket) -> None:
		async with self._lock:
			connections = self._connections.get(chat_id)
			if not connections:
				return
			connections.discard(websocket)
			if not connections:
				self._connections.pop(chat_id, None)
	
	async def broadcast(
			self,
			chat_id: int,
			event: dict,
			exclude: WebSocket | None = None,
	) -> None:
		async with self._lock:
			targets = [
				ws for ws in self._connections.get(chat_id, ()) if ws is not exclude
			]
		
		dead: list[WebSocket] = []
		for websocket in targets:
			try:
				await websocket.send_json(event)
			except Exception:
				# Клиент мог отвалиться между проверкой и отправкой
				dead.append(websocket)
		
		for websocket in dead:
			await self.disconnect(chat_id, websocket)
	
	def reset(self) -> None:
		"""Сбрасывает состояние (используется в тестах)."""
		self._connections.clear()


manager = ConnectionManager()
