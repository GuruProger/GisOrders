from typing import Annotated, Optional

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.users.models import User
from api.v1.users.services import UserService
from core.config import settings
from core.database import db_helper
from core.errors import AuthenticationError, ForbiddenError

oauth2_scheme = OAuth2PasswordBearer(
	tokenUrl="/api/v1/users/login",
	auto_error=False,
)


async def get_user_from_token(session: AsyncSession, token: str) -> User:
	"""Проверяет access-токен и возвращает пользователя из БД."""
	try:
		payload = jwt.decode(
			token,
			settings.jwt_secret_key,
			algorithms=[settings.jwt_algorithm],
		)
	except ExpiredSignatureError:
		raise AuthenticationError(
			"Токен истек",
			code="token_expired",
		)
	except JWTError:
		raise AuthenticationError(
			"Недействительный токен",
			code="token_invalid",
		)
	
	token_type = payload.get("token_type")
	
	if token_type != "access":
		raise AuthenticationError(
			"Некорректный тип токена",
			code="token_type_invalid",
		)
	
	raw_user_id = payload.get("user_id")
	
	if raw_user_id is None:
		raise AuthenticationError(
			"Некорректный токен: отсутствует user_id",
			code="token_invalid_payload",
		)
	
	try:
		user_id = int(raw_user_id)
	except (TypeError, ValueError):
		raise AuthenticationError(
			"Некорректный токен: неверный user_id",
			code="token_invalid_payload",
		)
	
	user = await UserService.get_user_by_id(session, user_id)
	
	if user is None:
		raise AuthenticationError(
			"Пользователь не найден",
			code="user_not_found",
		)
	
	return user


async def get_current_user(
		token: Annotated[Optional[str], Depends(oauth2_scheme)],
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
) -> User:
	if not token:
		raise AuthenticationError(
			"Токен не передан",
			code="token_missing",
		)
	
	return await get_user_from_token(session, token)


async def get_current_active_user(
		current_user: Annotated[User, Depends(get_current_user)],
) -> User:
	if not current_user.is_active:
		raise ForbiddenError(
			"Аккаунт заблокирован",
			code="user_blocked",
			resource="user",
			resource_id=current_user.id,
		)
	return current_user
