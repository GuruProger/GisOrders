import hashlib
import logging
import secrets
from datetime import timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_password_hash, verify_password
from core.config import settings
from core.errors import AuthenticationError, ConflictError, ForbiddenError, NotFoundError
from core.time import utcnow

from .models import RefreshToken, User
from .schemas import UserCreate

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
	async def set_active(session: AsyncSession, user_id: int, is_active: bool) -> User:
		stmt = select(User).where(User.id == user_id)
		user = (await session.execute(stmt)).scalar_one_or_none()
		
		if not user:
			raise NotFoundError(
				"Пользователь не найден",
				resource="user",
				resource_id=user_id,
			)
		
		user.is_active = is_active
		if not is_active:
			await RefreshTokenService.revoke_all_for_user(session, user.id)
		
		await session.flush()
		await session.refresh(user)
		return user
	
	@staticmethod
	async def set_admin(session: AsyncSession, user_id: int, is_admin: bool) -> User:
		stmt = select(User).where(User.id == user_id)
		user = (await session.execute(stmt)).scalar_one_or_none()
		
		if not user:
			raise NotFoundError(
				"Пользователь не найден",
				resource="user",
				resource_id=user_id,
			)
		
		user.is_admin = is_admin
		await session.flush()
		await session.refresh(user)
		return user
	
	@staticmethod
	async def change_password(
			session: AsyncSession,
			user_id: int,
			current_password: str,
			new_password: str,
	) -> None:
		user = await UserService.get_user_by_id(session, user_id)
		if not user:
			raise NotFoundError(
				"Пользователь не найден",
				resource="user",
				resource_id=user_id,
			)
		
		if not verify_password(current_password, str(user.hashed_password)):
			raise AuthenticationError(
				"Текущий пароль неверен",
				code="invalid_password",
			)
		
		user.hashed_password = get_password_hash(new_password)
		# Пароль сменился — все ранее выданные refresh-токены недействительны.
		# Access-токены доживут до конца своего короткого срока (15 минут).
		await RefreshTokenService.revoke_all_for_user(session, user.id)
		await session.flush()
	
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


class RefreshTokenService:
	"""Opaque refresh-токены с ротацией и детектом повторного использования."""
	
	@staticmethod
	def hash_token(token: str) -> str:
		return hashlib.sha256(token.encode("utf-8")).hexdigest()
	
	@staticmethod
	async def _create(session: AsyncSession, user_id: int) -> tuple[RefreshToken, str]:
		raw_token = secrets.token_urlsafe(48)
		record = RefreshToken(
			token_hash=RefreshTokenService.hash_token(raw_token),
			user_id=user_id,
			expires_at=utcnow() + timedelta(days=settings.refresh_token_expire_days),
		)
		session.add(record)
		await session.flush()
		return record, raw_token
	
	@staticmethod
	async def issue(session: AsyncSession, user_id: int) -> str:
		"""Создаёт refresh-токен и возвращает его открытое значение (единственный раз)."""
		_, raw_token = await RefreshTokenService._create(session, user_id)
		return raw_token
	
	@staticmethod
	async def rotate(session: AsyncSession, raw_token: str) -> tuple[User, str]:
		"""
		Обменивает refresh-токен на новую пару.
		
		Повторное использование уже отозванного токена считается компрометацией:
		отзываются все активные сессии пользователя.
		"""
		stmt = (
			select(RefreshToken)
			.where(RefreshToken.token_hash == RefreshTokenService.hash_token(raw_token))
			.with_for_update()
		)
		record = (await session.execute(stmt)).scalar_one_or_none()
		
		if not record:
			raise AuthenticationError(
				"Недействительный refresh-токен",
				code="refresh_token_invalid",
			)
		
		if record.revoked_at is not None:
			await RefreshTokenService.revoke_all_for_user(session, record.user_id)
			await session.flush()
			raise AuthenticationError(
				"Refresh-токен уже использован. Все сессии отозваны",
				code="refresh_token_reuse",
			)
		
		if record.expires_at <= utcnow():
			record.revoked_at = utcnow()
			await session.flush()
			raise AuthenticationError(
				"Refresh-токен истёк",
				code="refresh_token_expired",
			)
		
		user = await UserService.get_user_by_id(session, record.user_id)
		if user is None:
			raise AuthenticationError(
				"Недействительный refresh-токен",
				code="refresh_token_invalid",
			)
		
		if not user.is_active:
			raise ForbiddenError(
				"Аккаунт заблокирован",
				code="user_blocked",
				resource="user",
				resource_id=user.id,
			)
		
		new_record, new_raw_token = await RefreshTokenService._create(session, user.id)
		record.revoked_at = utcnow()
		record.replaced_by_id = new_record.id
		await session.flush()
		
		return user, new_raw_token
	
	@staticmethod
	async def revoke(session: AsyncSession, raw_token: str) -> None:
		"""Отзывает конкретный токен. Неизвестный токен игнорируется."""
		stmt = select(RefreshToken).where(
			RefreshToken.token_hash == RefreshTokenService.hash_token(raw_token)
		)
		record = (await session.execute(stmt)).scalar_one_or_none()
		
		if record and record.revoked_at is None:
			record.revoked_at = utcnow()
			await session.flush()
	
	@staticmethod
	async def revoke_all_for_user(session: AsyncSession, user_id: int) -> None:
		await session.execute(
			update(RefreshToken)
			.where(
				RefreshToken.user_id == user_id,
				RefreshToken.revoked_at.is_(None),
			)
			.values(revoked_at=utcnow())
		)
	
	@staticmethod
	async def purge_expired(session: AsyncSession, now=None) -> int:
		"""Удаляет истёкшие refresh-токены и возвращает их количество."""
		result = await session.execute(
			delete(RefreshToken).where(
				RefreshToken.expires_at <= (now or utcnow())
			)
		)
		return int(result.rowcount or 0)
