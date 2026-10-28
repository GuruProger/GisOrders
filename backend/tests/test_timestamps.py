from datetime import datetime, timezone

import pytest

ORDERS_API = "/api/v1/orders/"


def order_payload(deadline: str) -> dict:
	return {
		"title": "Спилить берёзу",
		"description": "Тестовое описание заказа",
		"min_price": 1000,
		"max_price": 5000,
		"deadline": deadline,
		"address": "Москва, тестовый адрес",
		"tree_type": "Берёза",
		"tree_height": 12.0,
		"tree_diameter": 35.0,
		"lat": 55.7558,
		"lon": 37.6173,
	}


@pytest.mark.asyncio
async def test_naive_deadline_is_interpreted_as_utc(
		client, customer, cust_headers, current_user_override
):
	"""Datetime без таймзоны трактуется как UTC, а не как локальное время сервера."""
	current_user_override.switch_to(customer)
	
	resp = await client.post(
		ORDERS_API,
		json=order_payload("2030-01-01T12:00:00"),
		headers=cust_headers,
	)
	
	assert resp.status_code == 200, resp.text
	body = resp.json()
	
	deadline = datetime.fromisoformat(body["deadline"])
	assert deadline.tzinfo is not None, "Дедлайн должен возвращаться с таймзоной"
	assert deadline == datetime(2030, 1, 1, 12, tzinfo=timezone.utc)
	
	created_at = datetime.fromisoformat(body["created_at"])
	assert created_at.tzinfo is not None, "created_at должен возвращаться с таймзоной"


@pytest.mark.asyncio
async def test_aware_deadline_is_normalized_to_utc(
		client, customer, cust_headers, current_user_override
):
	"""Дедлайн с явным смещением сохраняется как тот же момент времени в UTC."""
	current_user_override.switch_to(customer)
	
	resp = await client.post(
		ORDERS_API,
		json=order_payload("2030-01-01T15:00:00+03:00"),
		headers=cust_headers,
	)
	
	assert resp.status_code == 200, resp.text
	
	deadline = datetime.fromisoformat(resp.json()["deadline"])
	assert deadline.tzinfo is not None
	assert deadline == datetime(2030, 1, 1, 12, tzinfo=timezone.utc)
