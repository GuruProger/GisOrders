from contextlib import contextmanager
from datetime import datetime, timezone

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from api.v1.chat.models import Chat, Message
from api.v1.chat.services import MessageService
from api.v1.users.models import User
from core.auth import create_access_token
from core.database import db_helper
from main import app

WS_API = "/api/v1/ws/chats/{chat_id}"
SEND_API = "/api/v1/chats/{chat_id}/messages"
CHAT_ID = 10


def make_user(user_id: int, is_active: bool = True) -> User:
	return User(
		id=user_id,
		email=f"user{user_id}@test.com",
		username=f"user{user_id}",
		hashed_password="not-used",
		is_active=is_active,
		is_admin=False,
	)


def make_chat(customer_id: int = 1, executor_id: int = 2) -> Chat:
	return Chat(
		id=CHAT_ID,
		order_id=1,
		customer_id=customer_id,
		executor_id=executor_id,
		is_active=True,
	)


def token_for(user: User) -> dict[str, str]:
	token = create_access_token(data={"user_id": user.id})
	return {"Authorization": f"Bearer {token}"}


def auth_frame(user: User) -> dict:
	return {"type": "auth", "token": token_for(user)["Authorization"].split()[1]}


class FakeResult:
	def __init__(self, value):
		self._value = value
	
	def scalar_one_or_none(self):
		return self._value


class FakeSession:
	"""Подменяет БД в websocket-тестах: отдаёт заранее заданных пользователей и чаты."""
	
	def __init__(self, users: dict[int, User], chats: dict[int, Chat]):
		self._users = users
		self._chats = chats
		self.committed = False
	
	async def execute(self, stmt):
		entity = stmt.column_descriptions[0].get("entity")
		params = stmt.compile().params
		value = next(
			(param for param in params.values() if isinstance(param, int)),
			None,
		)
		
		if entity is User:
			return FakeResult(self._users.get(value))
		if entity is Chat:
			return FakeResult(self._chats.get(value))
		return FakeResult(None)
	
	async def commit(self):
		self.committed = True
	
	async def flush(self):
		pass


@contextmanager
def fake_db(users: dict[int, User], chats: dict[int, Chat]):
	async def _override_session():
		yield FakeSession(users, chats)
	
	app.dependency_overrides[db_helper.session_getter] = _override_session
	try:
		yield
	finally:
		app.dependency_overrides.pop(db_helper.session_getter, None)


@pytest.fixture(autouse=True)
def clean_manager():
	from api.v1.ws.manager import manager
	
	manager.reset()
	yield
	manager.reset()


@pytest.fixture
def ws_client():
	with TestClient(app) as client:
		yield client


def test_websocket_rejects_invalid_token(ws_client):
	users = {1: make_user(1)}
	chats = {CHAT_ID: make_chat()}
	
	with fake_db(users, chats):
		with pytest.raises(WebSocketDisconnect) as exc:
			with ws_client.websocket_connect(WS_API.format(chat_id=CHAT_ID)) as ws:
				ws.send_json({"type": "auth", "token": "definitely-not-a-jwt"})
				ws.receive_json()
	
	assert exc.value.code == 4401


def test_websocket_requires_auth_as_first_frame(ws_client):
	with fake_db({1: make_user(1)}, {CHAT_ID: make_chat()}):
		with pytest.raises(WebSocketDisconnect) as exc:
			with ws_client.websocket_connect(WS_API.format(chat_id=CHAT_ID)) as ws:
				ws.send_json({"type": "typing"})
				ws.receive_json()
	
	assert exc.value.code == 4401


def test_websocket_rejects_non_participant(ws_client):
	stranger = make_user(3)
	users = {3: stranger}
	chats = {CHAT_ID: make_chat(customer_id=1, executor_id=2)}
	
	with fake_db(users, chats):
		with pytest.raises(WebSocketDisconnect) as exc:
			with ws_client.websocket_connect(WS_API.format(chat_id=CHAT_ID)) as ws:
				ws.send_json(auth_frame(stranger))
				ws.receive_json()
	
	assert exc.value.code == 4403


def test_websocket_rejects_unknown_chat(ws_client):
	user = make_user(1)
	
	with fake_db({1: user}, {}):
		with pytest.raises(WebSocketDisconnect) as exc:
			with ws_client.websocket_connect(WS_API.format(chat_id=CHAT_ID)) as ws:
				ws.send_json(auth_frame(user))
				ws.receive_json()
	
	assert exc.value.code == 4404


def test_websocket_rejects_blocked_user(ws_client):
	blocked = make_user(1, is_active=False)
	
	with fake_db({1: blocked}, {CHAT_ID: make_chat()}):
		with pytest.raises(WebSocketDisconnect) as exc:
			with ws_client.websocket_connect(WS_API.format(chat_id=CHAT_ID)) as ws:
				ws.send_json(auth_frame(blocked))
				ws.receive_json()
	
	assert exc.value.code == 4403


def test_typing_is_broadcast_to_the_other_participant(ws_client):
	customer = make_user(1)
	executor = make_user(2)
	users = {1: customer, 2: executor}
	chats = {CHAT_ID: make_chat()}
	
	with fake_db(users, chats):
		with ws_client.websocket_connect(WS_API.format(chat_id=CHAT_ID)) as first:
			with ws_client.websocket_connect(WS_API.format(chat_id=CHAT_ID)) as second:
				first.send_json(auth_frame(customer))
				assert first.receive_json()["type"] == "auth.ok"
				
				second.send_json(auth_frame(executor))
				assert second.receive_json()["type"] == "auth.ok"
				
				first.send_json({"type": "typing", "is_typing": True})
				
				event = second.receive_json()
	
	assert event == {
		"type": "typing",
		"chat_id": CHAT_ID,
		"user_id": customer.id,
		"is_typing": True,
	}


def test_rest_message_is_pushed_to_the_other_participant(ws_client, monkeypatch):
	customer = make_user(1)
	executor = make_user(2)
	
	async def fake_create_message(session, chat_id, message_data, sender_id):
		return Message(
			id=77,
			chat_id=chat_id,
			sender_id=sender_id,
			text=message_data.text,
			is_read=False,
			created_at=datetime.now(timezone.utc),
		)
	
	monkeypatch.setattr(MessageService, "create_message", fake_create_message)
	
	with fake_db({1: customer, 2: executor}, {CHAT_ID: make_chat()}):
		with ws_client.websocket_connect(WS_API.format(chat_id=CHAT_ID)) as ws:
			ws.send_json(auth_frame(executor))
			assert ws.receive_json()["type"] == "auth.ok"
			
			resp = ws_client.post(
				SEND_API.format(chat_id=CHAT_ID),
				json={"text": "Здравствуйте"},
				headers=token_for(customer),
			)
			assert resp.status_code == 200, resp.text
			
			event = ws.receive_json()
	
	assert event["type"] == "message.created"
	assert event["message"]["id"] == 77
	assert event["message"]["text"] == "Здравствуйте"
	assert event["message"]["sender_id"] == customer.id


def test_read_event_is_broadcast(ws_client, monkeypatch):
	customer = make_user(1)
	executor = make_user(2)
	
	async def fake_mark_read(session, chat_id, user_id):
		return 5
	
	monkeypatch.setattr(MessageService, "mark_messages_as_read", fake_mark_read)
	
	with fake_db({1: customer, 2: executor}, {CHAT_ID: make_chat()}):
		with ws_client.websocket_connect(WS_API.format(chat_id=CHAT_ID)) as first:
			with ws_client.websocket_connect(WS_API.format(chat_id=CHAT_ID)) as second:
				first.send_json(auth_frame(customer))
				first.receive_json()
				second.send_json(auth_frame(executor))
				second.receive_json()
				
				first.send_json({"type": "read"})
				
				event = second.receive_json()
	
	assert event == {
		"type": "message.read",
		"chat_id": CHAT_ID,
		"user_id": customer.id,
		"count": 5,
	}
