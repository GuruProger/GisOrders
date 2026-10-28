import pytest

from conftest import make_order

AVAILABLE_API = "/api/v1/orders/available"


def available_params(**overrides) -> dict:
	params = {
		"user_lat": 55.7558,
		"user_lon": 37.6173,
		"radius_km": 10,
	}
	params.update(overrides)
	return params


async def get_available_ids(client, headers, **overrides) -> set[int]:
	resp = await client.get(
		AVAILABLE_API,
		params=available_params(**overrides),
		headers=headers,
	)
	assert resp.status_code == 200, resp.text
	return {order["id"] for order in resp.json()}


@pytest.mark.asyncio
async def test_geo_filter_is_applied_at_zero_coordinates(
		client, db, customer, exec_headers, current_user_override
):
	"""Координаты 0/0 - валидные (экватор, нулевой меридиан), фильтр должен работать."""
	near = await make_order(
		db, customer_id=customer.id, title="Нулевые координаты", lat=0.0, lon=0.0
	)
	far = await make_order(
		db, customer_id=customer.id, title="Москва", lat=55.7558, lon=37.6173
	)
	
	ids = await get_available_ids(
		client, exec_headers, user_lat=0.0, user_lon=0.0, radius_km=10
	)
	
	assert near.id in ids, "Заказ рядом с (0, 0) должен попасть в выдачу"
	assert far.id not in ids, "Заказ в Москве не должен попасть в радиус 10 км от (0, 0)"


@pytest.mark.asyncio
async def test_max_price_filters_by_order_budget_ceiling(
		client, db, customer, exec_headers, current_user_override
):
	"""Фильтр max_price сравнивает верхнюю границу бюджета заказа, а не нижнюю."""
	affordable = await make_order(
		db,
		customer_id=customer.id,
		title="Бюджет до 5000",
		min_price=1000.0,
		max_price=5000.0,
	)
	expensive = await make_order(
		db,
		customer_id=customer.id,
		title="Бюджет до 20000",
		min_price=1000.0,
		max_price=20000.0,
	)
	
	ids = await get_available_ids(client, exec_headers, max_price=6000)
	
	assert affordable.id in ids, "Заказ с потолком 5000 должен пройти фильтр max_price=6000"
	assert expensive.id not in ids, "Заказ с потолком 20000 не должен проходить фильтр max_price=6000"
