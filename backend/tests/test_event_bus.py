import asyncio

import fakeredis.aioredis
import pytest

from api.v1.ws.event_bus import EventBus
from api.v1.ws.manager import ConnectionManager


class RecordingWebSocket:
	def __init__(self) -> None:
		self.events: list[dict] = []

	async def send_json(self, event: dict) -> None:
		self.events.append(event)


class BrokenRedis:
	"""Pub/sub недоступен: шина обязана продолжить работу локально."""

	def pubsub(self):
		raise ConnectionError("redis is down")

	async def publish(self, *args, **kwargs):
		raise ConnectionError("redis is down")


async def wait_for_events(websocket: RecordingWebSocket, attempts: int = 100) -> None:
	for _ in range(attempts):
		if websocket.events:
			return
		await asyncio.sleep(0.01)


@pytest.mark.asyncio
async def test_event_bus_without_redis_publishes_locally():
	manager = ConnectionManager()
	bus = EventBus(manager=manager)
	await bus.start()

	first = RecordingWebSocket()
	second = RecordingWebSocket()
	await manager.connect(chat_id=1, websocket=first)
	await manager.connect(chat_id=1, websocket=second)

	try:
		await bus.publish(1, {"type": "typing"})

		assert first.events == [{"type": "typing"}]
		assert second.events == [{"type": "typing"}]
	finally:
		await bus.stop()


@pytest.mark.asyncio
async def test_event_bus_can_exclude_the_sender_without_redis():
	manager = ConnectionManager()
	bus = EventBus(manager=manager)
	await bus.start()

	sender = RecordingWebSocket()
	other = RecordingWebSocket()
	await manager.connect(chat_id=1, websocket=sender)
	await manager.connect(chat_id=1, websocket=other)

	try:
		await bus.publish(1, {"type": "typing"}, exclude=sender)

		assert sender.events == []
		assert other.events == [{"type": "typing"}]
	finally:
		await bus.stop()


@pytest.mark.asyncio
async def test_event_bus_fans_out_between_workers_through_redis():
	"""Событие, опубликованное в одном процессе, доходит до клиента другого."""
	redis = fakeredis.aioredis.FakeRedis(decode_responses=True)

	first_manager = ConnectionManager()
	second_manager = ConnectionManager()
	channel = "gisorders:test:ws"

	first_bus = EventBus(
		manager=first_manager,
		redis_client=redis,
		channel=channel,
	)
	second_bus = EventBus(
		manager=second_manager,
		redis_client=redis,
		channel=channel,
	)

	first_socket = RecordingWebSocket()
	second_socket = RecordingWebSocket()
	await first_manager.connect(chat_id=7, websocket=first_socket)
	await second_manager.connect(chat_id=7, websocket=second_socket)

	await first_bus.start()
	await second_bus.start()
	# Даём pub/sub подпискам встать на место
	await asyncio.sleep(0.05)

	try:
		await first_bus.publish(7, {"type": "message.created", "id": 42})

		await wait_for_events(first_socket)
		await wait_for_events(second_socket)

		expected = {"type": "message.created", "id": 42}
		assert first_socket.events == [expected]
		assert second_socket.events == [expected]
	finally:
		await first_bus.stop()
		await second_bus.stop()
		await redis.aclose()


@pytest.mark.asyncio
async def test_event_bus_falls_back_to_local_delivery_when_redis_fails():
	manager = ConnectionManager()
	bus = EventBus(manager=manager, redis_client=BrokenRedis())
	await bus.start()

	socket = RecordingWebSocket()
	await manager.connect(chat_id=3, websocket=socket)

	try:
		await bus.publish(3, {"type": "pong"})

		assert socket.events == [{"type": "pong"}]
	finally:
		await bus.stop()
