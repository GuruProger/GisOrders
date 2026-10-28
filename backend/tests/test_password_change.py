import pytest
from conftest import auth_headers

LOGIN_API = "/api/v1/users/login/json"
REFRESH_API = "/api/v1/users/refresh"
CHANGE_PASSWORD_API = "/api/v1/users/me/password"

PASSWORD = "test1234"
NEW_PASSWORD = "NewPassword123"


async def login(client, email: str, password: str):
	return await client.post(
		LOGIN_API,
		json={"email": email, "password": password},
	)


async def refresh(client, token: str):
	return await client.post(REFRESH_API, json={"refresh_token": token})


@pytest.mark.asyncio
async def test_password_change_revokes_all_refresh_tokens(client, customer):
	first = (await login(client, customer.email, PASSWORD)).json()
	second = (await login(client, customer.email, PASSWORD)).json()

	resp = await client.post(
		CHANGE_PASSWORD_API,
		json={
			"current_password": PASSWORD,
			"new_password": NEW_PASSWORD,
		},
		headers=auth_headers(customer.id),
	)

	assert resp.status_code == 204, resp.text
	assert (await refresh(client, first["refresh_token"])).status_code == 401
	assert (await refresh(client, second["refresh_token"])).status_code == 401


@pytest.mark.asyncio
async def test_password_change_updates_login_credentials(client, customer):
	resp = await client.post(
		CHANGE_PASSWORD_API,
		json={
			"current_password": PASSWORD,
			"new_password": NEW_PASSWORD,
		},
		headers=auth_headers(customer.id),
	)
	assert resp.status_code == 204, resp.text

	assert (await login(client, customer.email, PASSWORD)).status_code == 401
	assert (await login(client, customer.email, NEW_PASSWORD)).status_code == 200


@pytest.mark.asyncio
async def test_password_change_requires_current_password(client, customer):
	resp = await client.post(
		CHANGE_PASSWORD_API,
		json={
			"current_password": "WrongPassword1",
			"new_password": NEW_PASSWORD,
		},
		headers=auth_headers(customer.id),
	)

	assert resp.status_code == 401, resp.text
	assert resp.json()["error_code"] == "invalid_password"


@pytest.mark.asyncio
async def test_password_change_rejects_weak_password(client, customer):
	resp = await client.post(
		CHANGE_PASSWORD_API,
		json={
			"current_password": PASSWORD,
			"new_password": "weak",
		},
		headers=auth_headers(customer.id),
	)

	assert resp.status_code == 422, resp.text


@pytest.mark.asyncio
async def test_password_change_requires_authentication(client):
	resp = await client.post(
		CHANGE_PASSWORD_API,
		json={
			"current_password": PASSWORD,
			"new_password": NEW_PASSWORD,
		},
	)

	assert resp.status_code == 401, resp.text
