import pytest
from conftest import make_order

from api.v1.orders.normalization import normalize_tree_type

AVAILABLE_API = "/api/v1/orders/available"


def test_normalize_tree_type_trims_lowercases_and_collapses_spaces():
	assert normalize_tree_type("  Сосна   Обыкновенная ") == "сосна обыкновенная"


def test_normalize_tree_type_replaces_yo():
	assert normalize_tree_type("Берёза") == "береза"


@pytest.mark.asyncio
async def test_created_order_stores_normalized_tree_type(
		client, db, customer, cust_headers, current_user_override
):
	payload = {
		"title": "Спилить сухую сосну",
		"description": "Дерево во дворе, доступ свободный",
		"min_price": 1000,
		"max_price": 5000,
		"deadline": "2030-01-01T10:00:00Z",
		"address": "Москва, тестовый адрес",
		"tree_type": "  Сосна  ",
		"tree_height": 12,
		"tree_diameter": 35,
		"lat": 55.7558,
		"lon": 37.6173,
	}

	resp = await client.post("/api/v1/orders/", json=payload, headers=cust_headers)
	assert resp.status_code == 200, resp.text

	assert resp.json()["tree_type"] == "сосна"


@pytest.mark.asyncio
async def test_filter_matches_normalized_tree_type(
		client, db, customer, exec_headers, current_user_override
):
	order = await make_order(db, customer_id=customer.id)
	order.tree_type = "береза"
	await db.flush()

	resp = await client.get(
		AVAILABLE_API,
		params={"user_lat": 55.7558, "user_lon": 37.6173, "radius_km": 10, "tree_type": "Берёза"},
		headers=exec_headers,
	)
	assert resp.status_code == 200, resp.text

	assert [item["id"] for item in resp.json()] == [order.id]


async def get_available_tree_type_ids(client, headers, tree_type: str) -> list[int]:
	resp = await client.get(
		AVAILABLE_API,
		params={"user_lat": 55.7558, "user_lon": 37.6173, "radius_km": 10, "tree_type": tree_type},
		headers=headers,
	)
	assert resp.status_code == 200, resp.text
	return [item["id"] for item in resp.json()]


@pytest.mark.asyncio
async def test_filter_matches_legacy_uppercase_yo_row(
		client, db, customer, exec_headers, current_user_override
):
	"""Строка, записанная до нормализации как «Ёлка», находится фильтром «елка»."""
	order = await make_order(db, customer_id=customer.id)
	order.tree_type = "Ёлка"
	await db.flush()

	assert await get_available_tree_type_ids(client, exec_headers, "елка") == [order.id]


@pytest.mark.asyncio
async def test_filter_trims_and_lowercases_legacy_row(
		client, db, customer, exec_headers, current_user_override
):
	"""В SQL фильтра есть trim и lower: «  Берёза  » находится фильтром «береза»."""
	order = await make_order(db, customer_id=customer.id)
	order.tree_type = "  Берёза  "
	await db.flush()

	assert await get_available_tree_type_ids(client, exec_headers, "береза") == [order.id]
