from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from jose.exceptions import ExpiredSignatureError, JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from core.database import db_helper
from api.v1.users.services import UserService
from api.v1.users.models import User

oauth2_scheme = OAuth2PasswordBearer(
	tokenUrl="/api/v1/users/login",
	auto_error=False,
)


def _unauthorized_error(detail: str) -> HTTPException:
	return HTTPException(
		status_code=status.HTTP_401_UNAUTHORIZED,
		detail=detail,
		headers={"WWW-Authenticate": "Bearer"},
	)


async def get_current_user(
		token: Annotated[Optional[str], Depends(oauth2_scheme)],
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
) -> User:
	if not token:
		raise _unauthorized_error("Токен не передан")
	
	try:
		payload = jwt.decode(
			token,
			settings.jwt_secret_key,
			algorithms=[settings.jwt_algorithm],
		)
	except ExpiredSignatureError:
		raise _unauthorized_error("Токен истек")
	except JWTError:
		raise _unauthorized_error("Недействительный токен")
	
	token_type = payload.get("token_type")
	
	if token_type != "access":
		raise _unauthorized_error("Некорректный тип токена")
	
	raw_user_id = payload.get("user_id")
	
	if raw_user_id is None:
		raise _unauthorized_error("Некорректный токен: отсутствует user_id")
	
	try:
		user_id = int(raw_user_id)
	except (TypeError, ValueError):
		raise _unauthorized_error("Некорректный токен: неверный user_id")
	
	user = await UserService.get_user_by_id(session, user_id)
	
	if user is None:
		raise _unauthorized_error("Пользователь не найден")
	
	return user


async def get_current_active_user(
		current_user: Annotated[User, Depends(get_current_user)],
) -> User:
	return current_user
