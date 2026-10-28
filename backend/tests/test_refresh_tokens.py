import hashlib
from datetime import timedelta

import pytest
from sqlalchemy import select, update

from api.v1.users.models import RefreshToken
from core.time import utcnow

LOGIN_API = "/api/v1/users/login/json"
REFRESH_API = "/api/v1/users/refresh"
LOGOUT_API = "/api/v1/users/logout"
ME_API = "/api/v1/users/me"

PASSWORD = "test1234"


async def login(client, user) -> dict:
	resp = await client.post(
		LOGIN_API,
		json={"email": user.email, "password": PASSWORD},
	)
	assert resp.status_code == 200, resp.text
	return resp.json()


async def refresh(client, token: str):
	return await client.post(REFRESH_API, json={"refresh_token": token})


async def logout(client, token: str):
	return await client.post(LOGOUT_API, json={"refresh_token": token})


@pytest.mark.asyncio
async def test_login_returns_refresh_token_and_stores_only_hash(client, db, customer):
	"""Refresh-токен выдаётся один раз, в БД лежит только его SHA-256."""
	body = await login(client, customer)
	
	assert body["access_token"]
	assert body["refresh_token"]
	assert body["token_type"] == "bearer"
	
	records = (await db.execute(
		select(RefreshToken).where(RefreshToken.user_id == customer.id)
	)).scalars().all()
	assert len(records) == 1
	
	record = records[0]
	expected_hash = hashlib.sha256(body["refresh_token"].encode()).hexdigest()
	assert record.token_hash == expected_hash
	assert body["refresh_token"] not in record.token_hash


@pytest.mark.asyncio
async def test_refresh_rotates_token_and_returns_working_access(client, db, customer):
	"""Обмен refresh-токена выдаёт новую пару, старый refresh больше не нужен."""
	first = await login(client, customer)
	
	resp = await refresh(client, first["refresh_token"])
	
	assert resp.status_code == 200, resp.text
	second = resp.json()
	assert second["refresh_token"] != first["refresh_token"]
	
	me = await client.get(ME_API, headers={"Authorization": f"Bearer {second['access_token']}"})
	assert me.status_code == 200, me.text
	assert me.json()["id"] == customer.id
	
	again = await refresh(client, second["refresh_token"])
	assert again.status_code == 200, again.text


@pytest.mark.asyncio
async def test_reusing_refresh_token_revokes_all_sessions(client, db, customer):
	"""Повторное использование старого refresh-токена трактуется как кража."""
	first = await login(client, customer)
	rotated = (await refresh(client, first["refresh_token"])).json()
	
	reuse = await refresh(client, first["refresh_token"])
	assert reuse.status_code == 401, reuse.text
	assert reuse.json()["error_code"] == "refresh_token_reuse"
	
	# Новая сессия тоже отозвана: неизвестно, кто из двоих настоящий владелец
	after = await refresh(client, rotated["refresh_token"])
	assert after.status_code == 401, after.text


@pytest.mark.asyncio
async def test_unknown_refresh_token_is_rejected(client):
	resp = await refresh(client, "definitely-not-a-valid-token")
	
	assert resp.status_code == 401, resp.text
	assert resp.json()["error_code"] == "refresh_token_invalid"


@pytest.mark.asyncio
async def test_expired_refresh_token_is_rejected(client, db, customer):
	body = await login(client, customer)
	
	await db.execute(
		update(RefreshToken)
		.where(RefreshToken.user_id == customer.id)
		.values(expires_at=utcnow() - timedelta(minutes=1))
	)
	await db.flush()
	
	resp = await refresh(client, body["refresh_token"])
	
	assert resp.status_code == 401, resp.text
	assert resp.json()["error_code"] == "refresh_token_expired"


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token(client, db, customer):
	body = await login(client, customer)
	
	resp = await logout(client, body["refresh_token"])
	assert resp.status_code == 204, resp.text
	
	after = await refresh(client, body["refresh_token"])
	assert after.status_code == 401, after.text


@pytest.mark.asyncio
async def test_blocked_user_cannot_refresh(client, db, customer):
	body = await login(client, customer)
	
	customer.is_active = False
	await db.flush()
	
	resp = await refresh(client, body["refresh_token"])
	
	assert resp.status_code == 403, resp.text
	assert resp.json()["error_code"] == "user_blocked"


@pytest.mark.asyncio
async def test_refresh_token_is_not_accepted_as_access_token(client, customer):
	"""Refresh-токен — opaque-строка, а не access JWT."""
	body = await login(client, customer)
	resp = await client.get(
		ME_API,
		headers={"Authorization": f"Bearer {body['refresh_token']}"},
	)
	assert resp.status_code == 401, resp.text
