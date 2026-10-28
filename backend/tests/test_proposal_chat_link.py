import pytest
from conftest import auth_headers, make_user
from sqlalchemy import select

from api.v1.chat.models import Chat, Message
from api.v1.orders.models import OrderProposal

PROPOSAL_BODY = {"proposed_price": 5000.0, "message": "Готов выполнить работу"}

PROPOSALS_API = "/api/v1/orders/{order_id}/proposals"
DELETE_PROPOSAL_API = "/api/v1/orders/proposals/{proposal_id}"
CLOSE_CHAT_API = "/api/v1/chats/{chat_id}/close"
SEND_MESSAGE_API = "/api/v1/chats/{chat_id}/messages"


async def create_proposal_via_api(client, order_id, headers) -> int:
	"""Создаёт отклик через API и возвращает его id."""
	resp = await client.post(
		PROPOSALS_API.format(order_id=order_id),
		json=PROPOSAL_BODY,
		headers=headers,
	)
	assert resp.status_code in (200, 201), resp.text
	return resp.json()["id"]


async def get_chat_by_proposal_id(db, proposal_id) -> Chat | None:
	"""Достаёт чат, привязанный к отклику."""
	stmt = select(Chat).where(Chat.proposal_id == proposal_id)
	return (await db.execute(stmt)).scalar_one_or_none()


async def refresh_chat(db, chat_id: int) -> Chat | None:
	"""Сбрасывает кеш сессии и получает свежую версию чата из БД."""
	# expire_all - синхронный метод
	db.expire_all()
	stmt = select(Chat).where(Chat.id == chat_id)
	result = await db.execute(stmt)
	return result.scalar_one_or_none()


async def refresh_proposal(db, proposal_id: int) -> OrderProposal | None:
	"""Сбрасывает кеш сессии и получает свежую версию отклика из БД."""
	db.expire_all()
	stmt = select(OrderProposal).where(OrderProposal.id == proposal_id)
	result = await db.execute(stmt)
	return result.scalar_one_or_none()


@pytest.mark.asyncio
async def test_creating_proposal_creates_chat(
		client, db, order, executor, exec_headers, current_user_override
):
	"""Создание отклика автоматически создаёт активный чат между участниками."""
	proposal_id = await create_proposal_via_api(client, order.id, exec_headers)
	
	chat = await get_chat_by_proposal_id(db, proposal_id)
	assert chat is not None
	assert chat.is_active is True
	assert chat.order_id == order.id
	assert chat.customer_id == order.customer_id
	assert chat.executor_id == executor.id


@pytest.mark.asyncio
async def test_first_chat_message_is_proposal_message(
		client, db, order, executor, exec_headers, current_user_override
):
	"""Первым сообщением в чате становится текст отклика."""
	proposal_id = await create_proposal_via_api(client, order.id, exec_headers)
	chat = await get_chat_by_proposal_id(db, proposal_id)
	
	stmt = (
		select(Message)
		.where(Message.chat_id == chat.id)
		.order_by(Message.created_at)
	)
	messages = (await db.execute(stmt)).scalars().all()
	
	assert len(messages) == 1
	assert messages[0].text == PROPOSAL_BODY["message"]
	assert messages[0].sender_id == executor.id
	assert messages[0].is_read is False


@pytest.mark.asyncio
async def test_deleting_proposal_closes_chat(
		client, db, order, exec_headers, current_user_override
):
	"""Удаление отклика закрывает чат (soft delete), но не удаляет его физически."""
	proposal_id = await create_proposal_via_api(client, order.id, exec_headers)
	chat = await get_chat_by_proposal_id(db, proposal_id)
	
	del_resp = await client.delete(
		DELETE_PROPOSAL_API.format(proposal_id=proposal_id),
		headers=exec_headers,
	)
	assert del_resp.status_code in (200, 204), del_resp.text
	
	chat_after = await refresh_chat(db, chat.id)
	assert chat_after is not None, "Чат не должен удаляться физически"
	assert chat_after.is_active is False
	
	proposal_after = await refresh_proposal(db, proposal_id)
	assert proposal_after is None, "Отклик должен быть удалён физически"


@pytest.mark.asyncio
async def test_closing_chat_cancels_proposal(
		client, db, order, exec_headers, current_user_override
):
	"""Закрытие чата удаляет связанный отклик."""
	proposal_id = await create_proposal_via_api(client, order.id, exec_headers)
	chat = await get_chat_by_proposal_id(db, proposal_id)
	
	close_resp = await client.post(
		CLOSE_CHAT_API.format(chat_id=chat.id),
		headers=exec_headers,
	)
	assert close_resp.status_code == 200, close_resp.text
	
	chat_after = await refresh_chat(db, chat.id)
	assert chat_after.is_active is False
	
	proposal_after = await refresh_proposal(db, proposal_id)
	assert proposal_after is None, "Отклик должен быть удалён после закрытия чата"


@pytest.mark.asyncio
async def test_customer_can_close_chat(
		client, db, order, customer, exec_headers, cust_headers, current_user_override
):
	"""Заказчик тоже может закрыть чат, не только исполнитель."""
	proposal_id = await create_proposal_via_api(client, order.id, exec_headers)
	chat = await get_chat_by_proposal_id(db, proposal_id)
	
	current_user_override.switch_to(customer)
	
	close_resp = await client.post(
		CLOSE_CHAT_API.format(chat_id=chat.id),
		headers=cust_headers,
	)
	assert close_resp.status_code == 200, close_resp.text
	
	chat_after = await refresh_chat(db, chat.id)
	assert chat_after.is_active is False


@pytest.mark.asyncio
async def test_stranger_cannot_close_chat(
		client, db, order, exec_headers, current_user_override
):
	"""Посторонний пользователь не может закрыть чужой чат."""
	proposal_id = await create_proposal_via_api(client, order.id, exec_headers)
	chat = await get_chat_by_proposal_id(db, proposal_id)
	
	stranger = await make_user(
		db, email="stranger@test.com", username="stranger"
	)
	current_user_override.switch_to(stranger)
	
	close_resp = await client.post(
		CLOSE_CHAT_API.format(chat_id=chat.id),
		headers=auth_headers(stranger.id),
	)
	assert close_resp.status_code == 403, (
		f"Посторонний не должен закрывать чат. "
		f"Получено {close_resp.status_code}: {close_resp.text}"
	)
	
	chat_after = await refresh_chat(db, chat.id)
	assert chat_after.is_active is True


@pytest.mark.asyncio
async def test_cannot_send_message_to_closed_chat(
		client, db, order, exec_headers, current_user_override
):
	"""В закрытый чат нельзя отправить новое сообщение."""
	proposal_id = await create_proposal_via_api(client, order.id, exec_headers)
	chat = await get_chat_by_proposal_id(db, proposal_id)
	
	close_resp = await client.post(
		CLOSE_CHAT_API.format(chat_id=chat.id),
		headers=exec_headers,
	)
	assert close_resp.status_code == 200
	
	message_resp = await client.post(
		SEND_MESSAGE_API.format(chat_id=chat.id),
		json={"text": "Попытка написать в закрытый чат"},
		headers=exec_headers,
	)
	assert message_resp.status_code == 409, (
		f"Сообщение в закрытый чат не должно отправляться. "
		f"Получено {message_resp.status_code}: {message_resp.text}"
	)


@pytest.mark.asyncio
async def test_closing_already_closed_chat_returns_error(
		client, db, order, exec_headers, current_user_override
):
	"""Повторное закрытие уже закрытого чата возвращает ошибку."""
	proposal_id = await create_proposal_via_api(client, order.id, exec_headers)
	chat = await get_chat_by_proposal_id(db, proposal_id)
	
	first_close = await client.post(
		CLOSE_CHAT_API.format(chat_id=chat.id),
		headers=exec_headers,
	)
	assert first_close.status_code == 200
	
	second_close = await client.post(
		CLOSE_CHAT_API.format(chat_id=chat.id),
		headers=exec_headers,
	)
	assert second_close.status_code == 409, (
		f"Повторное закрытие должно вернуть ошибку. "
		f"Получено {second_close.status_code}: {second_close.text}"
	)
