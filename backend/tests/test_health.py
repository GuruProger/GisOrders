import pytest

HEALTH_API = "/health"


@pytest.mark.asyncio
async def test_health_reports_database_status(client):
	resp = await client.get(HEALTH_API)
	
	assert resp.status_code == 200, resp.text
	assert resp.json() == {"status": "ok", "database": "ok"}


@pytest.mark.asyncio
async def test_health_returns_503_when_database_is_unavailable(client, monkeypatch):
	import main
	
	async def failing_check() -> None:
		raise RuntimeError("connection refused")
	
	monkeypatch.setattr(main, "check_database", failing_check)
	
	resp = await client.get(HEALTH_API)
	
	assert resp.status_code == 503, resp.text
	assert resp.json()["error_code"] == "database_unavailable"
