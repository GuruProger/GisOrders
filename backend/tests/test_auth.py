import pytest

from conftest import auth_headers

ME_API = "/api/v1/users/me"


@pytest.mark.asyncio
async def test_bearer_token_created_by_test_helper_authenticates(client, customer):
	"""Токен из auth_headers должен проходить реальную проверку get_current_user."""
	resp = await client.get(ME_API, headers=auth_headers(customer.id))
	
	assert resp.status_code == 200, resp.text
	assert resp.json()["id"] == customer.id
