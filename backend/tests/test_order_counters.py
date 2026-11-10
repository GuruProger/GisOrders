import pytest
from conftest import make_order, make_proposal, make_user
from sqlalchemy import update

from api.v1.orders.models import OrderProposal, ProposalStatus

AVAILABLE_API = "/api/v1/orders/available"


def params(**overrides) -> dict:
	base = {"user_lat": 55.7558, "user_lon": 37.6173, "radius_km": 10}
	base.update(overrides)
	return base


@pytest.mark.asyncio
async def test_available_orders_report_pending_proposals_only(
	client, db, customer, executor, exec_headers, current_user_override
):
	order = await make_order(db, customer_id=customer.id)
	# Запрашивающий исполнитель не должен иметь своих откликов к заказу, иначе заказ
	# исключается из выборки фильтром "уже откликнувшихся". Отклики создаём от
	# других исполнителей: схема разрешает один отклик (order_id, executor_id).
	pending_executor = await make_user(db, email="exec2@test.com", username="executor2")
	rejected_executor = await make_user(db, email="exec3@test.com", username="executor3")
	pending = await make_proposal(db, order_id=order.id, executor_id=pending_executor.id)
	rejected = await make_proposal(db, order_id=order.id, executor_id=rejected_executor.id)
	await db.execute(
		update(OrderProposal).where(OrderProposal.id == rejected.id).values(status=ProposalStatus.REJECTED)
	)
	await db.flush()

	resp = await client.get(AVAILABLE_API, params=params(), headers=exec_headers)
	assert resp.status_code == 200, resp.text
	row = next(item for item in resp.json() if item["id"] == order.id)

	assert row["proposals_count"] == 1, f"учитывается только pending, id={pending.id}"


@pytest.mark.asyncio
async def test_order_detail_reports_proposals_count(client, db, customer, executor, cust_headers, current_user_override):
	order = await make_order(db, customer_id=customer.id)
	await make_proposal(db, order_id=order.id, executor_id=executor.id)

	resp = await client.get(f"/api/v1/orders/{order.id}", headers=cust_headers)
	assert resp.status_code == 200, resp.text

	assert resp.json()["proposals_count"] == 1


@pytest.mark.asyncio
async def test_total_count_header_matches_filtered_results(
	client, db, customer, exec_headers, current_user_override
):
	near = await make_order(db, customer_id=customer.id)
	far = await make_order(db, customer_id=customer.id, lat=59.9343, lon=30.3351)

	resp = await client.get(AVAILABLE_API, params=params(radius_km=10), headers=exec_headers)
	assert resp.status_code == 200, resp.text

	assert resp.headers["X-Total-Count"] == "1"
	assert [item["id"] for item in resp.json()] == [near.id]
	assert far.id not in {item["id"] for item in resp.json()}


@pytest.mark.asyncio
async def test_total_count_ignores_pagination(client, db, customer, exec_headers, current_user_override):
	for _ in range(3):
		await make_order(db, customer_id=customer.id)

	resp = await client.get(AVAILABLE_API, params=params(per_page=1), headers=exec_headers)
	assert resp.status_code == 200, resp.text

	assert resp.headers["X-Total-Count"] == "3"
	assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_total_count_header_is_exposed_to_browsers(client):
	resp = await client.get(
		"/health",
		headers={"Origin": "http://localhost:5173"},
	)
	exposed = resp.headers.get("access-control-expose-headers", "").lower()

	assert "x-total-count" in exposed
