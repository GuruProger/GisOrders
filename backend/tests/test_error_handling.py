import pytest
from httpx import ASGITransport, AsyncClient

from api.v1.chat.services import ChatService
from main import app


@pytest.mark.asyncio
async def test_unexpected_value_error_is_not_masked_as_400(
		db, customer, cust_headers, current_user_override, monkeypatch
):
	"""ValueError в коде — это баг, а не ошибка клиента: он должен давать 500."""
	
	async def broken(*args, **kwargs):
		raise ValueError("неожиданная ошибка внутри сервиса")
	
	monkeypatch.setattr(ChatService, "get_user_chats", broken)
	current_user_override.switch_to(customer)
	
	# raise_app_exceptions=False позволяет увидеть ответ обработчика 500,
	# а не исключение, всплывающее в тест
	transport = ASGITransport(app=app, raise_app_exceptions=False)
	async with AsyncClient(transport=transport, base_url="http://test") as client:
		resp = await client.get("/api/v1/chats/my", headers=cust_headers)
	
	assert resp.status_code == 500, (
		f"Неожиданный ValueError не должен превращаться в 400. "
		f"Получено {resp.status_code}: {resp.text}"
	)
	assert resp.json()["error_code"] == "internal_error"
