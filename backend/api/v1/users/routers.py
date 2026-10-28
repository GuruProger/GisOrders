import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import create_access_token
from core.config import settings
from core.database import db_helper
from core.errors import (
	AuthenticationError,
	BusinessRuleError,
	ForbiddenError,
	NotFoundError,
	RateLimitError,
)
from core.rate_limit import RateLimiter, build_rate_limiter
from core.security import get_current_active_user

from .models import User
from .schemas import (
	LoginRequest,
	PasswordChangeRequest,
	RefreshRequest,
	Token,
	UserCreate,
	UserPublicResponse,
	UserResponse,
	UserUpdate,
)
from .services import RefreshTokenService, UserService

router = APIRouter(prefix="/users", tags=["users"])

login_limiter = build_rate_limiter(
	limit=settings.login_rate_limit,
	window_seconds=settings.login_rate_window_seconds,
)
register_limiter = build_rate_limiter(
	limit=settings.register_rate_limit,
	window_seconds=settings.register_rate_window_seconds,
)


def _rate_limit_key(request: Request, scope: str, subject: str = "") -> str:
	host = request.client.host if request.client else "unknown"
	return f"{scope}:{host}:{subject}".rstrip(":")


async def _enforce_rate_limit(limiter: RateLimiter, key: str) -> None:
	allowed, retry_after = await limiter.allow(key)
	if not allowed:
		raise RateLimitError(
			"Слишком много попыток. Попробуйте позже",
			code="rate_limited",
			headers={"Retry-After": str(retry_after)},
		)


@router.post(
	"/register",
	response_model=UserResponse,
	summary="Регистрация нового пользователя",
	description="Создание нового аккаунта пользователя"
)
async def register(
		user_data: UserCreate,
		request: Request,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
	await _enforce_rate_limit(register_limiter, _rate_limit_key(request, "register"))
	return await UserService.create_user(session, user_data)


def _token_response(user: User, refresh_token: str) -> dict:
	access_token = create_access_token(
		data={"user_id": user.id},
		expires_delta=datetime.timedelta(minutes=settings.access_token_expire_minutes),
	)
	
	return {
		"access_token": access_token,
		"refresh_token": refresh_token,
		"token_type": "bearer",
		"user": user,
	}


async def _create_login_response(session: AsyncSession, email: str, password: str):
	user = await UserService.authenticate_user(session, email, password)
	
	if not user:
		raise AuthenticationError(
			"Неверный email или пароль",
			code="invalid_credentials",
		)
	
	if not user.is_active:
		raise ForbiddenError(
			"Аккаунт заблокирован",
			code="user_blocked",
			resource="user",
			resource_id=user.id,
		)
	
	refresh_token = await RefreshTokenService.issue(session, user.id)
	return _token_response(user, refresh_token)


@router.post(
	"/login",
	response_model=Token,
	summary="Вход через форму (OAuth2)",
	description="Стандартный вход для Swagger и OAuth2 клиентов"
)
async def login_form(
		request: Request,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		form_data: OAuth2PasswordRequestForm = Depends(),
):
	"""
	Принимает данные как form-data (username/password).
	"""
	await _enforce_rate_limit(
		login_limiter,
		_rate_limit_key(request, "login", form_data.username),
	)
	return await _create_login_response(session, form_data.username, form_data.password)


@router.post(
	"/login/json",
	response_model=Token,
	summary="Вход через JSON",
	description="Вход для клиентов, отправляющих JSON"
)
async def login_json(
		login_data: LoginRequest,
		request: Request,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
	"""
	Принимает данные как JSON объект.
	"""
	await _enforce_rate_limit(
		login_limiter,
		_rate_limit_key(request, "login", str(login_data.email)),
	)
	return await _create_login_response(session, str(login_data.email), login_data.password)


@router.post(
	"/refresh",
	response_model=Token,
	summary="Обновление access-токена",
	description="Обменивает refresh-токен на новую пару токенов (ротация)"
)
async def refresh_token(
		data: RefreshRequest,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
	user, refresh_token = await RefreshTokenService.rotate(session, data.refresh_token)
	return _token_response(user, refresh_token)


@router.post(
	"/logout",
	status_code=status.HTTP_204_NO_CONTENT,
	summary="Выход",
	description="Отзывает refresh-токен текущей сессии"
)
async def logout(
		data: RefreshRequest,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
	await RefreshTokenService.revoke(session, data.refresh_token)


@router.get(
	"/me",
	response_model=UserResponse,
	summary="Информация о текущем пользователе",
	description="Получение информации о текущем аутентифицированном пользователе"
)
async def get_current_user_info(
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	return current_user


@router.patch(
	"/me",
	response_model=UserResponse,
	summary="Обновление данных пользователя",
	description="Частичное обновление данных текущего пользователя"
)
async def update_current_user(
		update_data: UserUpdate,
		current_user: Annotated[User, Depends(get_current_active_user)],
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
	# Преобразуем Pydantic модель в dict, исключая None значения
	update_dict = update_data.model_dump(exclude_unset=True)
	
	# Удаляем поля, которые нельзя обновлять через этот эндпоинт
	restricted_fields = ['id', 'is_admin', 'hashed_password']
	for field in restricted_fields:
		update_dict.pop(field, None)
	
	return await UserService.update_user(session, current_user.id, update_dict)


@router.post(
	"/me/password",
	status_code=status.HTTP_204_NO_CONTENT,
	summary="Смена пароля",
	description=(
		"Меняет пароль текущего пользователя и отзывает все refresh-токены. "
		"Ранее выданные access-токены действуют до истечения их короткого срока."
	),
)
async def change_password(
		data: PasswordChangeRequest,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	await UserService.change_password(
		session,
		current_user.id,
		data.current_password,
		data.new_password,
	)


@router.delete(
	"/me",
	status_code=status.HTTP_204_NO_CONTENT,
	summary="Удаление текущего пользователя",
	description="Удаление собственного аккаунта"
)
async def delete_current_user(
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	await UserService.delete_user(session, current_user.id)


@router.delete(
	"/{user_id}",
	status_code=status.HTTP_204_NO_CONTENT,
	summary="Удаление пользователя",
	description="Удаление пользователя по идентификатору (только для админов)"
)
async def delete_user(
		user_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	# Проверяем, что текущий пользователь - администратор
	if not current_user.is_admin:
		raise ForbiddenError(
			"Недостаточно прав для выполнения этой операции",
			code="admin_required",
			resource="user",
			resource_id=user_id,
		)
	
	# Не позволяем пользователю удалить самого себя
	if current_user.id == user_id:
		raise BusinessRuleError(
			"Нельзя удалить собственный аккаунт",
			code="self_deletion_forbidden",
			resource="user",
			resource_id=user_id,
		)
	
	await UserService.delete_user(session, user_id)


@router.post(
	"/{user_id}/block",
	response_model=UserResponse,
	summary="Блокировка пользователя",
	description="Запрещает вход и использование API (только для админов)"
)
async def block_user(
		user_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	return await _set_user_active(session, current_user, user_id, False)


@router.post(
	"/{user_id}/unblock",
	response_model=UserResponse,
	summary="Разблокировка пользователя",
	description="Возвращает пользователю доступ к API (только для админов)"
)
async def unblock_user(
		user_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	return await _set_user_active(session, current_user, user_id, True)


async def _set_user_active(
		session: AsyncSession,
		admin: User,
		user_id: int,
		is_active: bool,
) -> User:
	if not admin.is_admin:
		raise ForbiddenError(
			"Недостаточно прав для выполнения этой операции",
			code="admin_required",
			resource="user",
			resource_id=user_id,
		)
	
	if admin.id == user_id:
		raise BusinessRuleError(
			"Нельзя изменить статус собственного аккаунта",
			code="self_block_forbidden",
			resource="user",
			resource_id=user_id,
		)
	
	return await UserService.set_active(session, user_id, is_active)


@router.get(
	"/{user_id}",
	summary="Получение пользователя по ID",
	description="Получение информации о пользователе по его идентификатору"
)
async def get_user_by_id(
		user_id: int,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		current_user: Annotated[User, Depends(get_current_active_user)],
):
	user = await UserService.get_user_by_id(session, user_id)
	if not user:
		raise NotFoundError(
			"Пользователь не найден",
			resource="user",
			resource_id=user_id,
		)
	
	# Сам пользователь или админ могут посмотреть данные UserResponse
	if current_user.id == user.id or current_user.is_admin:
		return UserResponse.model_validate(user)
	
	# Посторонние получают ограниченную информацию о пользователе
	return UserPublicResponse.model_validate(user)
