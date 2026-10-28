import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("app.request")


class RequestIDMiddleware(BaseHTTPMiddleware):
	"""
	Добавляет X-Request-ID к каждому запросу и пишет структурированную строку
	о завершении запроса. ID из заголовка клиента сохраняется — так один
	и тот же идентификатор виден и в клиенте, и в логах сервера.
	"""
	
	async def dispatch(self, request: Request, call_next) -> Response:
		# Ограничиваем длину, чтобы клиент не мог раздуть заголовок и логи
		client_request_id = request.headers.get("X-Request-ID")
		request_id = (client_request_id or uuid.uuid4().hex)[:128]
		request.state.request_id = request_id
		started_at = time.perf_counter()
		
		response = await call_next(request)
		
		duration_ms = round((time.perf_counter() - started_at) * 1000, 2)
		response.headers["X-Request-ID"] = request_id
		
		logger.info(
			"request.completed",
			extra={
				"request_id": request_id,
				"method": request.method,
				"path": request.url.path,
				"status": response.status_code,
				"duration_ms": duration_ms,
			},
		)
		
		return response
