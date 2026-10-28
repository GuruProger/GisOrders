import json
import logging

import pytest

from core.logging import JsonFormatter


@pytest.mark.asyncio
async def test_request_id_is_generated_and_returned(client):
	resp = await client.get("/health")

	assert resp.status_code == 200, resp.text
	request_id = resp.headers["X-Request-ID"]
	assert len(request_id) == 32
	assert all(char in "0123456789abcdef" for char in request_id)


@pytest.mark.asyncio
async def test_client_request_id_is_preserved(client):
	resp = await client.get(
		"/health",
		headers={"X-Request-ID": "client-request-id-123"},
	)

	assert resp.headers["X-Request-ID"] == "client-request-id-123"


def test_json_formatter_includes_extra_fields():
	record = logging.LogRecord(
		name="app.test",
		level=logging.INFO,
		pathname=__file__,
		lineno=1,
		msg="request.completed",
		args=(),
		exc_info=None,
	)
	record.request_id = "abc123"
	record.status = 200

	payload = json.loads(JsonFormatter().format(record))

	assert payload["message"] == "request.completed"
	assert payload["level"] == "INFO"
	assert payload["request_id"] == "abc123"
	assert payload["status"] == 200
