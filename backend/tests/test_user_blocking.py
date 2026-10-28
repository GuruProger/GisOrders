import pytest

from conftest import auth_headers

ME_API = "/api/v1/users/me"
LOGIN_API = "/api/v1/users/login/json"
BLOCK_API = "/api/v1/users/{user_id}/block"
UNBLOCK_API = "/api/v1/users/{user_id}/unblock"

PASSWORD = "test1234"


async def login(client, email: str):
	return await client.post(
		LOGIN_API,
		json={"email": email, "password": PASSWORD},
	)


@pytest.mark.asyncio
async def test_blocked_user_cannot_login(client, db, customer):
	"""Заблокированный пользователь не получает токен даже с верным паролем."""
	customer.is_active = False
	await db.flush()
	
	resp = await login(client, customer.email)
	
	assert resp.status_code == 403, (
		f"Вход заблокированного пользователя должен отклоняться. "
		f"Получено {resp.status_code}: {resp.text}"
	)
	assert resp.json()["error_code"] == "user_blocked"


@pytest.mark.asyncio
async def test_existing_token_of_blocked_user_is_rejected(client, db, customer):
	"""Ранее выданный access-токен перестаёт работать после блокировки."""
	customer.is_active = False
	await db.flush()
	
	resp = await client.get(ME_API, headers=auth_headers(customer.id))
	
	assert resp.status_code == 403, (
		f"Токен заблокированного пользователя должен отклоняться. "
		f"Получено {resp.status_code}: {resp.text}"
	)
	assert resp.json()["error_code"] == "user_blocked"


@pytest.mark.asyncio
async def test_admin_can_block_and_unblock_user(
		client, db, customer, executor, current_user_override
):
	"""Админ блокирует и разблокирует пользователя."""
	executor.is_admin = True
	await db.flush()
	current_user_override.switch_to(executor)
	
	blocked = await client.post(
		BLOCK_API.format(user_id=customer.id),
		headers=auth_headers(executor.id),
	)
	assert blocked.status_code == 200, blocked.text
	assert blocked.json()["is_active"] is False
	assert (await login(client, customer.email)).status_code == 403
	
	unblocked = await client.post(
		UNBLOCK_API.format(user_id=customer.id),
		headers=auth_headers(executor.id),
	)
	assert unblocked.status_code == 200, unblocked.text
	assert unblocked.json()["is_active"] is True
	assert (await login(client, customer.email)).status_code == 200


@pytest.mark.asyncio
async def test_non_admin_cannot_block_user(
		client, db, customer, executor, current_user_override
):
	"""Обычный пользователь не может блокировать других."""
	current_user_override.switch_to(executor)
	
	resp = await client.post(
		BLOCK_API.format(user_id=customer.id),
		headers=auth_headers(executor.id),
	)
	
	assert resp.status_code == 403, resp.text
	assert (await db.get(type(customer), customer.id)).is_active is True


@pytest.mark.asyncio
async def test_admin_cannot_block_self(
		client, db, executor, current_user_override
):
	"""Админ не может заблокировать собственный аккаунт."""
	executor.is_admin = True
	await db.flush()
	current_user_override.switch_to(executor)
	
	resp = await client.post(
		BLOCK_API.format(user_id=executor.id),
		headers=auth_headers(executor.id),
	)
	
	assert resp.status_code == 400, (
		f"Самоблокировка должна отклоняться. Получено {resp.status_code}: {resp.text}"
	)
