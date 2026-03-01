import json
import re
from typing import AsyncGenerator

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase, declared_attr
from sqlalchemy.ext.asyncio import (
	create_async_engine,
	AsyncEngine,
	async_sessionmaker,
	AsyncSession,
)
from geoalchemy2 import Geography, Geometry

from core.config import settings


class Base(DeclarativeBase):
	"""Базовый класс для всех моделей базы данных"""
	
	__abstract__ = True  # Этот класс не будет создавать таблицу в базе данных
	
	type_annotation_map = {
		Geography: Geography,
		Geometry: Geometry,
	}
	
	metadata = MetaData(
		naming_convention=settings.db_naming_convention,
	)
	
	@declared_attr.directive
	def __tablename__(
			cls,
	) -> str:  # Автоматическое создание имени таблицы на основе имени класса
		
		# Замена паттернов, где строчная буква/цифра следует за заглавной буквой
		snake_case_string = re.sub(r'(.)([A-Z][a-z]+)', r'\1_\2', cls.__name__)
		# Обработка случаев, когда заглавная буква следует за другой заглавной и строчной
		snake_case_string = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', snake_case_string)
		return snake_case_string.lower()


class DatabaseHelper:
	def __init__(
			self,
			url: str,
			echo: bool = False,
			echo_pool: bool = False,
			max_overflow: int = 10,
			pool_size: int = 20,
	) -> None:
		self.engine: AsyncEngine = create_async_engine(
			url=url,
			echo=echo,
			echo_pool=echo_pool,
			max_overflow=max_overflow,
			pool_size=pool_size,
			json_serializer=lambda obj: json.dumps(obj, ensure_ascii=False),
		)
		self.session_factory = async_sessionmaker(
			bind=self.engine,
			autoflush=False,
			autocommit=False,
			expire_on_commit=False,
		)
	
	async def dispose(self) -> None:
		"""Освобождение ресурсов движка базы данных, закрытие всех соединений"""
		await self.engine.dispose()
	
	async def session_getter(self) -> AsyncGenerator[AsyncSession, None]:
		"""
		Асинхронная выдача сессии базы данных.
		"""
		async with self.session_factory() as session:
			yield session


db_helper = DatabaseHelper(
	url=str(settings.db_url),
	echo=settings.db_echo,
	echo_pool=settings.db_echo_pool,
	max_overflow=settings.db_max_overflow,
	pool_size=settings.db_pool_size,
)

# Импортируем все модели здесь (иначе алембик не будет видеть модели)
from api.v1.users.models import User
from api.v1.orders.models import Order, OrderProposal, OrderStatus
