import pytest

ORDER_API = "/api/v1/orders/{order_id}"


@pytest.mark.asyncio
async def test_owner_can_update_order_coordinates(
		client, order, customer, cust_headers, current_user_override
):
	"""Владелец может переместить заказ, передав новую пару координат."""
	current_user_override.switch_to(customer)
	
	resp = await client.patch(
		ORDER_API.format(order_id=order.id),
		json={"lat": 59.9343, "lon": 30.3351},
		headers=cust_headers,
	)
	
	assert resp.status_code == 200, resp.text
	body = resp.json()
	assert body["lat"] == pytest.approx(59.9343, abs=1e-6)
	assert body["lon"] == pytest.approx(30.3351, abs=1e-6)


@pytest.mark.asyncio
async def test_coordinate_update_requires_both_lat_and_lon(
		client, order, customer, cust_headers, current_user_override
):
	"""Нельзя обновить только широту или только долготу - точка задаётся парой."""
	current_user_override.switch_to(customer)
	
	resp = await client.patch(
		ORDER_API.format(order_id=order.id),
		json={"lat": 59.9343},
		headers=cust_headers,
	)
	
	assert resp.status_code == 422, (
		f"Неполная пара координат должна отклоняться. "
		f"Получено {resp.status_code}: {resp.text}"
	)
