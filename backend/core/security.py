from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated
from jose import JWTError, jwt

from core.database import db_helper
from api.v1.users.services import UserService
from api.v1.users.models import User
from core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="v1/users/login")


async def get_current_user(
		token: Annotated[str, Depends(oauth2_scheme)],
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
) -> User:
	credentials_exception = HTTPException(
		status_code=status.HTTP_401_UNAUTHORIZED,
		detail="Could not validate credentials",
		headers={"WWW-Authenticate": "Bearer"},
	)
	
	try:
		payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
		user_id: int = payload.get("user_id")
		email: str = payload.get("sub")
		
		if user_id is None or email is None:
			raise credentials_exception
	
	except JWTError:
		raise credentials_exception
	
	user = await UserService.get_user_by_id(session, user_id)
	if user is None:
		raise credentials_exception
	
	return user


async def get_current_active_user(
		current_user: Annotated[User, Depends(get_current_user)]
) -> User:
	return current_user
