import pytest

from core.config import settings

LOGIN_API = "/api/v1/users/login/json"
REGISTER_API = "/api/v1/users/register"


async def login(client, email: str, password: str):
	return await client.post(LOGIN_API, json={"email": email, "password": password})


@pytest.mark.asyncio
async def test_login_attempts_are_rate_limited(client, customer):
	"""Серия неудачных попыток входа блокирует дальнейшие попытки с этого IP."""
	for attempt in range(settings.login_rate_limit):
		resp = await login(client, customer.email, "WrongPassword1")
		assert resp.status_code == 401, (
			f"Попытка {attempt + 1} должна отклоняться как неверный пароль, "
			f"получено {resp.status_code}: {resp.text}"
		)
	
	blocked = await login(client, customer.email, "test1234")
	
	assert blocked.status_code == 429, (
		f"После {settings.login_rate_limit} попыток должен срабатывать лимит. "
		f"Получено {blocked.status_code}: {blocked.text}"
	)
	assert blocked.json()["error_code"] == "rate_limited"
	assert "Retry-After" in blocked.headers


@pytest.mark.asyncio
async def test_login_limit_is_scoped_per_email(client, customer, executor):
	"""Лимит одного аккаунта не блокирует вход другого с того же IP."""
	for _ in range(settings.login_rate_limit):
		await login(client, customer.email, "WrongPassword1")
	
	resp = await login(client, executor.email, "test1234")
	
	assert resp.status_code == 200, (
		f"Другой аккаунт не должен страдать от лимита. "
		f"Получено {resp.status_code}: {resp.text}"
	)


@pytest.mark.asyncio
async def test_registration_is_rate_limited(client):
	"""Массовая регистрация с одного IP ограничена."""
	for index in range(settings.register_rate_limit):
		resp = await client.post(
			REGISTER_API,
			json={
				"email": f"bulk{index}@test.com",
				"username": f"bulk{index}",
				"password": "Password123",
			},
		)
		assert resp.status_code == 200, resp.text
	
	resp = await client.post(
		REGISTER_API,
		json={
			"email": "overflow@test.com",
			"username": "overflow",
			"password": "Password123",
		},
	)
	
	assert resp.status_code == 429, (
		f"После {settings.register_rate_limit} регистраций должен срабатывать лимит. "
		f"Получено {resp.status_code}: {resp.text}"
	)
