from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from typing import Annotated
import datetime

from core.database import db_helper
from core.security import get_current_user, get_current_active_user
from core.auth import create_access_token
from .models import User
from .schemas import (
	UserCreate, UserResponse, Token, LoginRequest, UserUpdate
)
from .services import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.post(
	"/register",
	response_model=UserResponse,
	summary="Регистрация нового пользователя",
	description="Создание нового аккаунта пользователя"
)
async def register(
		user_data: UserCreate,
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
):
	try:
		user = await UserService.create_user(session, user_data)
		return user
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)
	except IntegrityError:
		await session.rollback()
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Пользователь с такими данными уже существует"
		)


@router.post(
	"/login",
	response_model=Token,
	summary="Вход в систему",
	description="Аутентификация пользователя через форму или JSON"
)
async def login(
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		form_data: OAuth2PasswordRequestForm = Depends(OAuth2PasswordRequestForm),
		login_data: LoginRequest = None,
):
	# Определяем email и password в зависимости от типа запроса
	if login_data:
		# JSON запрос
		email = str(login_data.email)
		password = login_data.password
	else:
		# FormData запрос
		email = form_data.username  # OAuth2PasswordRequestForm использует username для email
		password = form_data.password
	
	user = await UserService.authenticate_user(session, email, password)
	if not user:
		raise HTTPException(
			status_code=status.HTTP_401_UNAUTHORIZED,
			detail="Неверный email или пароль",
			headers={"WWW-Authenticate": "Bearer"},
		)
	
	access_token_expires = datetime.timedelta(minutes=30)
	access_token = create_access_token(
		data={"sub": user.email, "user_id": user.id},
		expires_delta=access_token_expires
	)
	
	return {
		"access_token": access_token,
		"token_type": "bearer",
		"user": user
	}


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
	try:
		# Преобразуем Pydantic модель в dict, исключая None значения
		update_dict = update_data.model_dump(exclude_unset=True)
		
		# Удаляем поля, которые нельзя обновлять через этот эндпоинт
		restricted_fields = ['id', 'is_admin', 'hashed_password']
		for field in restricted_fields:
			update_dict.pop(field, None)
		
		user = await UserService.update_user(session, current_user.id, update_dict)
		return user
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail=str(e)
		)
	except IntegrityError:
		await session.rollback()
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Конфликт уникальности данных"
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
	try:
		await UserService.delete_user(session, current_user.id)
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail=str(e)
		)


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
		raise HTTPException(
			status_code=status.HTTP_403_FORBIDDEN,
			detail="Недостаточно прав для выполнения этой операции"
		)
	
	# Не позволяем пользователю удалить самого себя
	if current_user.id == user_id:
		raise HTTPException(
			status_code=status.HTTP_400_BAD_REQUEST,
			detail="Нельзя удалить собственный аккаунт"
		)
	
	try:
		await UserService.delete_user(session, user_id)
	except ValueError as e:
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail=str(e)
		)


@router.get(
	"/{user_id}",
	response_model=UserResponse,
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
		raise HTTPException(
			status_code=status.HTTP_404_NOT_FOUND,
			detail="Пользователь не найден"
		)
	return user