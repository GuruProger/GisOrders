from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

logger = logging.getLogger("app.errors")


class AppError(Exception):
	"""
	Базовый класс для ошибок приложения.

	Наследники задают HTTP-статус, код ошибки и сообщение по умолчанию.
	"""
	
	status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
	default_detail: str = "Внутренняя ошибка сервера"
	default_code: str = "internal_error"
	
	def __init__(
			self,
			detail: Optional[str] = None,
			*,
			code: Optional[str] = None,
			field: Optional[str] = None,
			resource: Optional[str] = None,
			resource_id: Optional[Any] = None,
			headers: Optional[dict[str, str]] = None,
	) -> None:
		self.detail = detail or self.default_detail
		self.code = code or self.default_code
		self.field = field
		self.resource = resource
		self.resource_id = resource_id
		self.headers = headers
		
		super().__init__(self.detail)


class BadRequestError(AppError):
	status_code = status.HTTP_400_BAD_REQUEST
	default_detail = "Некорректный запрос"
	default_code = "bad_request"


class UnauthorizedError(AppError):
	status_code = status.HTTP_401_UNAUTHORIZED
	default_detail = "Требуется авторизация"
	default_code = "unauthorized"


class AuthenticationError(UnauthorizedError):
	"""Не удалось подтвердить личность"""
	default_code = "authentication_failed"


class ForbiddenError(AppError):
	status_code = status.HTTP_403_FORBIDDEN
	default_detail = "Недостаточно прав"
	default_code = "forbidden"


class NotFoundError(AppError):
	status_code = status.HTTP_404_NOT_FOUND
	default_detail = "Ресурс не найден"
	default_code = "not_found"


class ConflictError(AppError):
	status_code = status.HTTP_409_CONFLICT
	default_detail = "Конфликт данных"
	default_code = "conflict"


class PayloadTooLargeError(AppError):
	status_code = 413
	default_detail = "Файл слишком большой"
	default_code = "payload_too_large"


class ProposalLimitError(AppError):
	status_code = status.HTTP_429_TOO_MANY_REQUESTS
	default_detail = "Достигнут лимит предложений за день"
	default_code = "daily_proposal_limit"


class RateLimitError(AppError):
	status_code = status.HTTP_429_TOO_MANY_REQUESTS
	default_detail = "Слишком много запросов. Попробуйте позже"
	default_code = "rate_limited"


class ServiceUnavailableError(AppError):
	status_code = status.HTTP_503_SERVICE_UNAVAILABLE
	default_detail = "Сервис временно недоступен"
	default_code = "service_unavailable"


class BusinessRuleError(AppError):
	"""
	Ошибка бизнес-правила.
	"""
	
	status_code = status.HTTP_400_BAD_REQUEST
	default_detail = "Операция недоступна в текущем состоянии"
	default_code = "business_rule_violation"


def _build_error_payload(exc: AppError) -> dict[str, Any]:
	payload: dict[str, Any] = {
		"detail": exc.detail,
		"error_code": exc.code,
	}
	
	if exc.field:
		payload["field"] = exc.field
	
	if exc.resource:
		payload["resource"] = exc.resource
	
	if exc.resource_id is not None:
		payload["resource_id"] = exc.resource_id
	
	return payload


def _request_extra(request: Request) -> dict[str, Any]:
	return {
		"method": request.method,
		"path": request.url.path,
	}


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
	payload = _build_error_payload(exc)
	extra = _request_extra(request)
	
	if exc.status_code >= 500:
		logger.error(
			"Request failed with server error",
			exc_info=exc,
			extra=extra,
		)
	else:
		logger.info(
			"Request failed with client error",
			extra=extra,
		)
	
	return JSONResponse(
		status_code=exc.status_code,
		content=payload,
		headers=exc.headers,
	)


async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
	"""
	Временный обработчик для обратной совместимости.

	Пока сервисы еще могут где-то использовать ValueError,
	он будет превращаться в 400.
	"""
	
	logger.info(
		"ValueError converted to 400",
		extra=_request_extra(request),
	)
	
	return JSONResponse(
		status_code=status.HTTP_400_BAD_REQUEST,
		content={
			"detail": str(exc),
			"error_code": "value_error",
		},
	)


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
	"""
	Ловит все необработанные ошибки и не отдает технические детали клиенту.
	"""
	
	logger.exception(
		"Unhandled server error",
		extra=_request_extra(request),
	)
	
	return JSONResponse(
		status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
		content={
			"detail": "Внутренняя ошибка сервера",
			"error_code": "internal_error",
		},
	)


def register_error_handlers(app: FastAPI) -> None:
	app.add_exception_handler(AppError, app_error_handler)
	app.add_exception_handler(ValueError, value_error_handler)
	app.add_exception_handler(Exception, unhandled_exception_handler)
