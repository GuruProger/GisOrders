from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from .models import User
from .schemas import UserCreate
from core.auth import get_password_hash, verify_password


class UserService:
	@staticmethod
	async def create_user(session: AsyncSession, user_data: UserCreate) -> User:
		# Проверяем существующего пользователя по email
		stmt = select(User).where(User.email == user_data.email)
		result = await session.execute(stmt)
		if result.scalar_one_or_none():
			raise ValueError("Пользователь с таким email уже существует")
		
		# Проверяем существующего пользователя по номеру телефона
		if user_data.phone_number:
			stmt = select(User).where(User.phone_number == user_data.phone_number)
			result = await session.execute(stmt)
			if result.scalar_one_or_none():
				raise ValueError("Пользователь с таким номером телефона уже существует")
		
		user = User(
			email=str(user_data.email),
			hashed_password=get_password_hash(user_data.password),
			username=user_data.username,
			phone_number=user_data.phone_number
		)
		
		session.add(user)
		try:
			await session.commit()
			await session.refresh(user)
			return user
		except IntegrityError as e:
			await session.rollback()
			error_msg = str(e.orig)
			
			if "ix_user_username" in error_msg:
				raise ValueError("Пользователь с таким именем уже существует")
			elif "ix_user_email" in error_msg:
				raise ValueError("Пользователь с таким email уже существует")
			elif "ix_user_phone_number" in error_msg:
				raise ValueError("Пользователь с таким номером телефона уже существует")
			else:
				raise ValueError("Пользователь с такими данными уже существует")
	
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
			raise ValueError("Пользователь не найден")
		
		# Проверяем уникальность email, если он обновляется
		if 'email' in update_data and update_data['email'] != user.email:
			stmt = select(User).where(
				User.email == update_data['email'],
				User.id != user_id
			)
			result = await session.execute(stmt)
			if result.scalar_one_or_none():
				raise ValueError("Пользователь с таким email уже существует")
		
		# Проверяем уникальность номера телефона, если он обновляется
		if 'phone_number' in update_data and update_data['phone_number'] != user.phone_number:
			if update_data['phone_number']:
				stmt = select(User).where(
					User.phone_number == update_data['phone_number'],
					User.id != user_id
				)
				result = await session.execute(stmt)
				if result.scalar_one_or_none():
					raise ValueError("Этот номер телефона уже используется другим пользователем")
		
		# Обновляем только переданные поля
		for field, value in update_data.items():
			if hasattr(user, field):
				setattr(user, field, value)
		
		try:
			await session.commit()
			await session.refresh(user)
			return user
		except IntegrityError as e:
			await session.rollback()
			error_msg = str(e.orig)
			
			if "ix_user_username" in error_msg:
				raise ValueError("Пользователь с таким именем уже существует")
			elif "ix_user_email" in error_msg:
				raise ValueError("Пользователь с таким email уже существует")
			elif "ix_user_phone_number" in error_msg:
				raise ValueError("Пользователь с таким номером телефона уже существует")
			else:
				raise ValueError("Конфликт уникальности данных")
	
	@staticmethod
	async def delete_user(session: AsyncSession, user_id: int) -> None:
		stmt = select(User).where(User.id == user_id)
		result = await session.execute(stmt)
		user = result.scalar_one_or_none()
		
		if not user:
			raise ValueError("Пользователь не найден")
		
		await session.delete(user)
		await session.commit()