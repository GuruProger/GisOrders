import pytest

PREFLIGHT_HEADERS = {
	"Origin": "http://evil.example",
	"Access-Control-Request-Method": "GET",
}


@pytest.mark.asyncio
async def test_cors_does_not_allow_credentials_with_wildcard(client):
	"""
	API использует Bearer-токены, поэтому credentialed CORS-запросы не нужны.

	Wildcard-origin вместе с Access-Control-Allow-Credentials: true позволяет
	любому сайту отправлять запросы с куками/HTTP-аутентификацией от имени
	пользователя, поэтому такой заголовок не должен выставляться.
	"""
	resp = await client.options("/api/v1/users/me", headers=PREFLIGHT_HEADERS)
	
	assert resp.status_code == 200, resp.text
	assert "access-control-allow-credentials" not in resp.headers, (
		f"Credentialed CORS запрещён при wildcard-origin. "
		f"Заголовки ответа: {dict(resp.headers)}"
	)
