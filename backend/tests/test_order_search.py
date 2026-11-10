import pytest
from conftest import make_order

AVAILABLE_API = "/api/v1/orders/available"


def params(**overrides) -> dict:
	base = {"user_lat": 55.7558, "user_lon": 37.6173, "radius_km": 10}
	base.update(overrides)
	return base


async def available_ids(client, headers, **overrides) -> set[int]:
	resp = await client.get(AVAILABLE_API, params=params(**overrides), headers=headers)
	assert resp.status_code == 200, resp.text
	return {order["id"] for order in resp.json()}


@pytest.mark.asyncio
async def test_search_matches_title_case_insensitive(client, db, customer, exec_headers, current_user_override):
	target = await make_order(db, customer_id=customer.id, title="Спилить сухую СОСНУ")
	other = await make_order(db, customer_id=customer.id, title="Покос травы")

	ids = await available_ids(client, exec_headers, search="сосну")

	assert target.id in ids
	assert other.id not in ids


@pytest.mark.asyncio
async def test_search_matches_description(client, db, customer, exec_headers, current_user_override):
	target = await make_order(db, customer_id=customer.id, title="Работа во дворе")
	target.description = "Нужно убрать аварийную ветку над крышей"
	await db.flush()
	other = await make_order(db, customer_id=customer.id, title="Другая работа")

	ids = await available_ids(client, exec_headers, search="аварийную ветку")

	assert target.id in ids
	assert other.id not in ids


@pytest.mark.asyncio
async def test_search_treats_percent_as_literal(client, db, customer, exec_headers, current_user_override):
	with_percent = await make_order(db, customer_id=customer.id, title="Скидка 50% на спил")
	without = await make_order(db, customer_id=customer.id, title="Скидка 50 рублей на спил")

	ids = await available_ids(client, exec_headers, search="50%")

	assert with_percent.id in ids
	assert without.id not in ids


@pytest.mark.asyncio
async def test_blank_search_does_not_narrow_results(client, db, customer, exec_headers, current_user_override):
	order = await make_order(db, customer_id=customer.id, title="Любой заказ")

	ids = await available_ids(client, exec_headers, search="   ")

	assert order.id in ids
