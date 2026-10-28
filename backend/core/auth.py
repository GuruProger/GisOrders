from datetime import datetime, timedelta, timezone

import bcrypt
from jose import jwt

from core.config import settings


def verify_password(plain_password: str, hashed_password: str) -> bool:
	"""Проверяет пароль по bcrypt-хешу; повреждённый хеш считается неверным."""
	try:
		return bcrypt.checkpw(
			plain_password.encode("utf-8"),
			hashed_password.encode("utf-8"),
		)
	except (ValueError, TypeError):
		return False


def get_password_hash(password: str) -> str:
	return bcrypt.hashpw(
		password.encode("utf-8"),
		bcrypt.gensalt(),
	).decode("utf-8")


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
	to_encode = data.copy()
	
	now = datetime.now(timezone.utc)
	
	if expires_delta:
		expire = now + expires_delta
	else:
		expire = now + timedelta(minutes=settings.access_token_expire_minutes)
	
	to_encode.update(
		{
			"iat": int(now.timestamp()),
			"exp": int(expire.timestamp()),
			"token_type": "access",
		}
	)
	
	encoded_jwt = jwt.encode(
		to_encode,
		settings.jwt_secret_key,
		algorithm=settings.jwt_algorithm,
	)
	
	return encoded_jwt
