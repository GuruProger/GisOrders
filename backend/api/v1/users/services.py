import logging
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from .models import User
from .schemas import UserCreate
from core.auth import get_password_hash, verify_password
from core.errors import ConflictError, NotFoundError

logger = logging.getLogger(__name__)


class UserService:
	@staticmethod
	async def create_user(session: AsyncSession, user_data: UserCreate) -> User:
		# Проверяем существующего пользователя по email
		stmt = select(User).where(User.email == user_data.email)
		result = await session.execute(stmt)
		if result.scalar_one_or_none():
			raise ConflictError(
				"Пользователь с таким email уже существует",
				code="email_duplicate",
				field="email",
				resource="user",
			)
		
		# Проверяем существующего пользователя по номеру телефона
		if user_data.phone_number:
			stmt = select(User).where(User.phone_number == user_data.phone_number)
			result = await session.execute(stmt)
			if result.scalar_one_or_none():
				raise ConflictError(
					"Пользователь с таким номером телефона уже существует",
					code="phone_duplicate",
					field="phone_number",
					resource="user",
				)
		
		user = User(
			email=str(user_data.email),
			hashed_password=get_password_hash(user_data.password),
			username=user_data.username,
			phone_number=user_data.phone_number
		)
		
		session.add(user)
		try:
			await session.flush()
			await session.refresh(user)
			return user
		except IntegrityError as e:
			error_msg = str(e.orig).lower()
			if "ix_user_username" in error_msg or "username" in error_msg:
				raise ConflictError(
					"Пользователь с таким именем уже существует",
					code="username_duplicate",
					field="username",
					resource="user",
				)
			elif "ix_user_email" in error_msg or "email" in error_msg:
				raise ConflictError(
					"Пользователь с таким email уже существует",
					code="email_duplicate",
					field="email",
					resource="user",
				)
			elif "ix_user_phone_number" in error_msg or "phone" in error_msg:
				raise ConflictError(
					"Пользователь с таким номером телефона уже существует",
					code="phone_duplicate",
					field="phone_number",
					resource="user",
				)
			else:
				logger.error("IntegrityError in create_user", exc_info=e)
				raise ConflictError(
					"Пользователь с такими данными уже существует",
					code="user_duplicate",
					resource="user",
				)
	
	@staticmethod
	async def authenticate_user(session: AsyncSession, email: str, password: str) -> User | None:
		stmt = select(User).where(User.email == email)
		result = await session.execute(stmt)
		user = result.scalar_one_or_none()
		
		if not user or not verify_password(password, str(user.hashed_password)):
			return None
		return user
	
	@staticmethod
	async def get_user_by_id(session: AsyncSession, user_id: int) -> User | None:
		stmt = select(User).where(User.id == user_id)
		result = await session.execute(stmt)
		return result.scalar_one_or_none()
	
	@staticmethod
	async def get_user_by_email(session: AsyncSession, email: str) -> User | None:
		stmt = select(User).where(User.email == email)
		result = await session.execute(stmt)
		return result.scalar_one_or_none()
	
	@staticmethod
	async def get_user_by_phone(session: AsyncSession, phone_number: str) -> User | None:
		stmt = select(User).where(User.phone_number == phone_number)
		result = await session.execute(stmt)
		return result.scalar_one_or_none()
	
	@staticmethod
	async def update_user(session: AsyncSession, user_id: int, update_data: dict) -> User:
		stmt = select(User).where(User.id == user_id)
		result = await session.execute(stmt)
		user = result.scalar_one_or_none()
		
		if not user:
			raise NotFoundError(
				"Пользователь не найден",
				resource="user",
				resource_id=user_id,
			)
		
		# Проверяем уникальность email, если он обновляется
		if 'email' in update_data and update_data['email'] != user.email:
			stmt = select(User).where(
				User.email == update_data['email'],
				User.id != user_id
			)
			result = await session.execute(stmt)
			if result.scalar_one_or_none():
				raise ConflictError(
					"Пользователь с таким email уже существует",
					code="email_duplicate",
					field="email",
					resource="user",
					resource_id=user_id,
				)
		
		# Проверяем уникальность номера телефона, если он обновляется
		if 'phone_number' in update_data and update_data['phone_number'] != user.phone_number:
			if update_data['phone_number']:
				stmt = select(User).where(
					User.phone_number == update_data['phone_number'],
					User.id != user_id
				)
				result = await session.execute(stmt)
				if result.scalar_one_or_none():
					raise ConflictError(
						"Этот номер телефона уже используется другим пользователем",
						code="phone_duplicate",
						field="phone_number",
						resource="user",
						resource_id=user_id,
					)
		
		# Обновляем только переданные поля
		for field, value in update_data.items():
			if hasattr(user, field):
				setattr(user, field, value)
		
		try:
			await session.flush()
			await session.refresh(user)
			return user
		except IntegrityError as e:
			error_msg = str(e.orig).lower()
			if "ix_user_username" in error_msg or "username" in error_msg:
				raise ConflictError(
					"Пользователь с таким именем уже существует",
					code="username_duplicate",
					field="username",
					resource="user",
					resource_id=user_id,
				)
			elif "ix_user_email" in error_msg or "email" in error_msg:
				raise ConflictError(
					"Пользователь с таким email уже существует",
					code="email_duplicate",
					field="email",
					resource="user",
					resource_id=user_id,
				)
			elif "ix_user_phone_number" in error_msg or "phone" in error_msg:
				raise ConflictError(
					"Пользователь с таким номером телефона уже существует",
					code="phone_duplicate",
					field="phone_number",
					resource="user",
					resource_id=user_id,
				)
			else:
				logger.error("IntegrityError in update_user", exc_info=e)
				raise ConflictError(
					"Конфликт уникальности данных",
					code="data_conflict",
					resource="user",
					resource_id=user_id,
				)
	
	@staticmethod
	async def delete_user(session: AsyncSession, user_id: int) -> None:
		stmt = select(User).where(User.id == user_id)
		result = await session.execute(stmt)
		user = result.scalar_one_or_none()
		
		if not user:
			raise NotFoundError(
				"Пользователь не найден",
				resource="user",
				resource_id=user_id,
			)
		await session.delete(user)
		await session.flush()
