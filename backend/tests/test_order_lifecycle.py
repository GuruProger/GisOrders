import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from api.v1.chat.models import Chat
from api.v1.orders.models import OrderProposal, ProposalStatus
from conftest import make_user, auth_headers

ORDER_API = "/api/v1/orders/{order_id}"
PROPOSALS_API = "/api/v1/orders/{order_id}/proposals"
PROPOSAL_API = "/api/v1/orders/proposals/{proposal_id}"
ACCEPT_API = "/api/v1/orders/{order_id}/proposals/{proposal_id}/accept"
CLOSE_ORDER_API = "/api/v1/orders/{order_id}/close"
AVAILABLE_API = "/api/v1/orders/available"
CLOSE_CHAT_API = "/api/v1/chats/{chat_id}/close"


async def propose(client, order_id: int, executor) -> dict:
	"""Отправляет отклик от имени исполнителя."""
	resp = await client.post(
		PROPOSALS_API.format(order_id=order_id),
		json={"proposed_price": 5000.0, "message": f"Отклик исполнителя {executor.id}"},
		headers=auth_headers(executor.id),
	)
	assert resp.status_code in (200, 201), resp.text
	return resp.json()


async def accept(client, order_id: int, proposal_id: int, headers) -> object:
	return await client.post(
		ACCEPT_API.format(order_id=order_id, proposal_id=proposal_id),
		headers=headers,
	)


async def get_order(client, order_id: int, headers) -> dict:
	resp = await client.get(ORDER_API.format(order_id=order_id), headers=headers)
	assert resp.status_code == 200, resp.text
	return resp.json()


async def get_proposal_statuses(client, order_id: int, headers) -> dict[int, str]:
	resp = await client.get(
		PROPOSALS_API.format(order_id=order_id),
		headers=headers,
	)
	assert resp.status_code == 200, resp.text
	return {item["id"]: item["status"] for item in resp.json()}


async def get_chat_by_proposal(db, proposal_id: int) -> Chat:
	stmt = (
		select(Chat)
		.where(Chat.proposal_id == proposal_id)
		.execution_options(populate_existing=True)
	)
	chat = (await db.execute(stmt)).scalar_one_or_none()
	assert chat is not None, "У отклика должен быть чат"
	return chat


async def refresh_chat(db, chat_id: int) -> Chat:
	stmt = (
		select(Chat)
		.where(Chat.id == chat_id)
		.execution_options(populate_existing=True)
	)
	return (await db.execute(stmt)).scalar_one_or_none()


async def refresh_proposal(db, proposal_id: int) -> OrderProposal | None:
	stmt = (
		select(OrderProposal)
		.where(OrderProposal.id == proposal_id)
		.execution_options(populate_existing=True)
	)
	return (await db.execute(stmt)).scalar_one_or_none()


@pytest.mark.asyncio
async def test_accept_assigns_order_and_rejects_other_proposals(
		client, db, order, customer, executor, cust_headers, current_user_override
):
	"""Принятие отклика фиксирует исполнителя и закрывает остальные отклики и чаты."""
	second = await make_user(db, email="second@test.com", username="second")
	
	accepted = await propose(client, order.id, executor)
	current_user_override.switch_to(second)
	rejected = await propose(client, order.id, second)
	
	current_user_override.switch_to(customer)
	resp = await accept(client, order.id, accepted["id"], cust_headers)
	
	assert resp.status_code == 200, resp.text
	assert resp.json()["status"] == "accepted"
	
	body = await get_order(client, order.id, cust_headers)
	assert body["status"] == "assigned"
	assert body["accepted_proposal_id"] == accepted["id"]
	assert body["closed_at"] is None
	
	statuses = await get_proposal_statuses(client, order.id, cust_headers)
	assert statuses == {
		accepted["id"]: "accepted",
		rejected["id"]: "rejected",
	}
	
	accepted_chat = await get_chat_by_proposal(db, accepted["id"])
	rejected_chat = await get_chat_by_proposal(db, rejected["id"])
	assert accepted_chat.is_active is True, "Чат выбранного исполнителя должен остаться открытым"
	assert rejected_chat.is_active is False, "Чат отклонённого исполнителя должен закрыться"


@pytest.mark.asyncio
async def test_assigned_order_disappears_from_available(
		client, db, order, customer, executor, cust_headers, current_user_override
):
	"""После выбора исполнителя заказ больше не показывается другим исполнителям."""
	stranger = await make_user(db, email="stranger@test.com", username="stranger")
	proposal = await propose(client, order.id, executor)
	
	current_user_override.switch_to(customer)
	assert (await accept(client, order.id, proposal["id"], cust_headers)).status_code == 200
	
	current_user_override.switch_to(stranger)
	resp = await client.get(
		AVAILABLE_API,
		params={"user_lat": 55.7558, "user_lon": 37.6173, "radius_km": 10},
		headers=auth_headers(stranger.id),
	)
	assert resp.status_code == 200, resp.text
	assert order.id not in {item["id"] for item in resp.json()}


@pytest.mark.asyncio
async def test_only_customer_can_accept_proposal(
		client, db, order, executor, exec_headers, current_user_override
):
	"""Исполнитель не может принять собственный отклик."""
	proposal = await propose(client, order.id, executor)
	
	resp = await accept(client, order.id, proposal["id"], exec_headers)
	
	assert resp.status_code == 403, (
		f"Принимать отклик может только заказчик. "
		f"Получено {resp.status_code}: {resp.text}"
	)


@pytest.mark.asyncio
async def test_second_accept_is_rejected(
		client, db, order, customer, executor, cust_headers, current_user_override
):
	"""Повторный accept после выбора исполнителя возвращает конфликт."""
	proposal = await propose(client, order.id, executor)
	current_user_override.switch_to(customer)
	
	assert (await accept(client, order.id, proposal["id"], cust_headers)).status_code == 200
	second = await accept(client, order.id, proposal["id"], cust_headers)
	
	assert second.status_code == 409, (
		f"Повторный accept должен отклоняться. "
		f"Получено {second.status_code}: {second.text}"
	)


@pytest.mark.asyncio
async def test_proposal_from_another_order_is_not_accepted(
		client, db, order, customer, executor, cust_headers, current_user_override
):
	"""Нельзя принять отклик, который относится к другому заказу."""
	from conftest import make_order
	
	other_order = await make_order(db, customer_id=customer.id, title="Другой заказ")
	proposal = await propose(client, other_order.id, executor)
	current_user_override.switch_to(customer)
	
	resp = await accept(client, order.id, proposal["id"], cust_headers)
	
	assert resp.status_code == 404, (
		f"Отклик чужого заказа не должен приниматься. "
		f"Получено {resp.status_code}: {resp.text}"
	)


@pytest.mark.asyncio
async def test_accepted_proposal_cannot_be_edited_or_deleted(
		client, db, order, customer, executor, cust_headers, exec_headers, current_user_override
):
	"""Принятый отклик заморожен: его нельзя редактировать или отозвать."""
	proposal = await propose(client, order.id, executor)
	current_user_override.switch_to(customer)
	assert (await accept(client, order.id, proposal["id"], cust_headers)).status_code == 200
	
	current_user_override.switch_to(executor)
	patch = await client.patch(
		PROPOSAL_API.format(proposal_id=proposal["id"]),
		json={"proposed_price": 100.0},
		headers=exec_headers,
	)
	delete = await client.delete(
		PROPOSAL_API.format(proposal_id=proposal["id"]),
		headers=exec_headers,
	)
	
	assert patch.status_code == 409, (
		f"Принятый отклик нельзя редактировать. Получено {patch.status_code}: {patch.text}"
	)
	assert delete.status_code == 409, (
		f"Принятый отклик нельзя удалить. Получено {delete.status_code}: {delete.text}"
	)
	
	after = await refresh_proposal(db, proposal["id"])
	assert after is not None
	assert after.status == ProposalStatus.ACCEPTED


@pytest.mark.asyncio
async def test_accepted_chat_cannot_be_closed(
		client, db, order, customer, executor, cust_headers, exec_headers, current_user_override
):
	"""Чат выбранного исполнителя закрывается только вместе с заказом."""
	proposal = await propose(client, order.id, executor)
	chat = await get_chat_by_proposal(db, proposal["id"])
	current_user_override.switch_to(customer)
	assert (await accept(client, order.id, proposal["id"], cust_headers)).status_code == 200
	
	resp = await client.post(
		CLOSE_CHAT_API.format(chat_id=chat.id),
		headers=exec_headers,
	)
	
	assert resp.status_code == 409, (
		f"Чат принятого отклика нельзя закрыть напрямую. "
		f"Получено {resp.status_code}: {resp.text}"
	)
	assert (await refresh_chat(db, chat.id)).is_active is True


@pytest.mark.asyncio
async def test_closing_open_order_rejects_proposals_and_closes_chats(
		client, db, order, customer, executor, cust_headers, current_user_override
):
	"""Закрытие заказа без выбора исполнителя отклоняет отклики и закрывает чаты."""
	second = await make_user(db, email="second@test.com", username="second")
	first_p = await propose(client, order.id, executor)
	current_user_override.switch_to(second)
	second_p = await propose(client, order.id, second)
	
	current_user_override.switch_to(customer)
	resp = await client.post(
		CLOSE_ORDER_API.format(order_id=order.id),
		headers=cust_headers,
	)
	
	assert resp.status_code == 200, resp.text
	body = resp.json()
	assert body["status"] == "closed"
	assert body["closed_at"] is not None
	assert body["accepted_proposal_id"] is None
	
	statuses = await get_proposal_statuses(client, order.id, cust_headers)
	assert set(statuses.values()) == {"rejected"}
	for proposal in (first_p, second_p):
		chat = await get_chat_by_proposal(db, proposal["id"])
		assert chat.is_active is False, "Все чаты закрытого заказа должны быть закрыты"


@pytest.mark.asyncio
async def test_closing_assigned_order_closes_winner_chat(
		client, db, order, customer, executor, cust_headers, current_user_override
):
	"""Закрытие заказа после выбора исполнителя закрывает его чат, статус отклика сохраняется."""
	proposal = await propose(client, order.id, executor)
	chat = await get_chat_by_proposal(db, proposal["id"])
	current_user_override.switch_to(customer)
	assert (await accept(client, order.id, proposal["id"], cust_headers)).status_code == 200
	
	resp = await client.post(
		CLOSE_ORDER_API.format(order_id=order.id),
		headers=cust_headers,
	)
	
	assert resp.status_code == 200, resp.text
	assert resp.json()["status"] == "closed"
	assert (await refresh_chat(db, chat.id)).is_active is False
	assert (await refresh_proposal(db, proposal["id"])).status == ProposalStatus.ACCEPTED


@pytest.mark.asyncio
async def test_assigned_order_cannot_be_deleted_or_edited(
		client, db, order, customer, executor, cust_headers, current_user_override
):
	"""Пока заказ закреплён за исполнителем, его нельзя удалить или изменить."""
	proposal = await propose(client, order.id, executor)
	current_user_override.switch_to(customer)
	assert (await accept(client, order.id, proposal["id"], cust_headers)).status_code == 200
	
	delete = await client.delete(
		ORDER_API.format(order_id=order.id),
		headers=cust_headers,
	)
	patch = await client.patch(
		ORDER_API.format(order_id=order.id),
		json={"title": "Новое название заказа"},
		headers=cust_headers,
	)
	
	assert delete.status_code == 409, (
		f"Назначенный заказ нельзя удалить. Получено {delete.status_code}: {delete.text}"
	)
	assert patch.status_code == 409, (
		f"Назначенный заказ нельзя редактировать. Получено {patch.status_code}: {patch.text}"
	)


@pytest.mark.asyncio
async def test_closed_order_can_be_deleted(
		client, order, customer, cust_headers, current_user_override
):
	"""Закрытый заказ удаляется - это способ убрать его из истории."""
	current_user_override.switch_to(customer)
	
	resp = await client.delete(
		ORDER_API.format(order_id=order.id),
		headers=cust_headers,
	)
	
	assert resp.status_code == 204, resp.text


@pytest.mark.asyncio
async def test_database_rejects_duplicate_proposal(db, order, executor):
	"""Уникальность (order_id, executor_id) защищает от гонки при создании откликов."""
	proposal = OrderProposal(
		proposed_price=5000.0,
		message="Первый отклик",
		order_id=order.id,
		executor_id=executor.id,
	)
	db.add(proposal)
	await db.flush()
	
	with pytest.raises(IntegrityError):
		async with db.begin_nested():
			db.add(OrderProposal(
				proposed_price=4000.0,
				message="Дубликат",
				order_id=order.id,
				executor_id=executor.id,
			))
			await db.flush()
