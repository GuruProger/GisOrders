from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated
import datetime
from core.database import db_helper
from core.security import get_current_user, get_current_active_user
from core.auth import create_access_token
from core.errors import AuthenticationError, ForbiddenError, BusinessRuleError, NotFoundError
from .models import User
from .schemas import (
	UserCreate, UserResponse, UserPublicResponse, Token, LoginRequest, UserUpdate
)
from .services import UserService
from core.config import settings

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
	return await UserService.create_user(session, user_data)


async def _create_login_response(session: AsyncSession, email: str, password: str):
	user = await UserService.authenticate_user(session, email, password)
	
	if not user:
		raise AuthenticationError(
			"Неверный email или пароль",
			code="invalid_credentials",
		)
	
	access_token_expires = datetime.timedelta(minutes=settings.access_token_expire_minutes)
	access_token = create_access_token(
		data={"user_id": user.id},
		expires_delta=access_token_expires
	)
	
	return {
		"access_token": access_token,
		"token_type": "bearer",
		"user": user
	}


@router.post(
	"/login",
	response_model=Token,
	summary="Вход через форму (OAuth2)",
	description="Стандартный вход для Swagger и OAuth2 клиентов"
)
async def login_form(
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		form_data: OAuth2PasswordRequestForm = Depends(),
):
	"""
	Принимает данные как form-data (username/password).
	"""
	return await _create_login_response(session, form_data.username, form_data.password)


@router.post(
	"/login/json",
	response_model=Token,
	summary="Вход через JSON",
	description="Вход для клиентов, отправляющих JSON"
)
async def login_json(
		session: Annotated[AsyncSession, Depends(db_helper.session_getter)],
		login_data: LoginRequest,
):
	"""
	Принимает данные как JSON объект.
	"""
	return await _create_login_response(session, str(login_data.email), login_data.password)


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
