from typing import List, TYPE_CHECKING, Optional
from geoalchemy2 import Geometry
from geoalchemy2.shape import to_shape
from sqlalchemy import String, Text, DateTime, Float, Integer, Enum as SQLEnum, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import ARRAY
from datetime import datetime
from enum import Enum

from core.database import Base

if TYPE_CHECKING:
	from ..users.models import User
	from ..chat.models import Chat


class OrderStatus(str, Enum):
	OPEN = "open"  # На заказ можно откликнуться
	CLOSED = "closed"  # На заказ нельзя откликаться


class Order(Base):
	id: Mapped[int] = mapped_column(primary_key=True)
	
	# Основная информация
	title: Mapped[str] = mapped_column(String(200))
	description: Mapped[str] = mapped_column(Text)
	status: Mapped[OrderStatus] = mapped_column(SQLEnum(OrderStatus, name="order_status"),
	                                            name='status', default=OrderStatus.OPEN)
	# Бюджет
	min_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
	max_price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
	
	# Временные метки
	created_at: Mapped[datetime] = mapped_column(
		default=datetime.now,
		nullable=False,
	)
	deadline: Mapped[datetime] = mapped_column(DateTime)  # Срок выполнения
	
	# Геоданные (PostGIS)
	location = mapped_column(Geometry('POINT', srid=4326))  # Координаты дерева
	address: Mapped[str] = mapped_column(String(500))  # Текстовый адрес
	
	# Характеристики дерева
	tree_type: Mapped[str] = mapped_column(String(50))  # Порода дерева
	tree_height: Mapped[float] = mapped_column(Float)  # Высота в метрах
	tree_diameter: Mapped[float] = mapped_column(Float)  # Диаметр в см
	
	# Медиа
	photos: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)  # Массив URL фото
	
	# Внешние ключи
	customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"))  # Заказчик
	
	# Связи
	customer: Mapped["User"] = relationship("User", foreign_keys=[customer_id], back_populates="orders_as_customer")
	proposals: Mapped[List["OrderProposal"]] = relationship("OrderProposal", back_populates="order",
	                                                        cascade="all, delete-orphan")
	chats: Mapped[List["Chat"]] = relationship("Chat", back_populates="order", cascade="all, delete-orphan")
	
	# Свойства для доступа к координатам
	@property
	def lat(self) -> float:
		"""Широта (Y координата)"""
		if self.location:
			try:
				point = to_shape(self.location)
				return float(point.y)
			except (AttributeError, ValueError, TypeError):
				return 0.0
		return 0.0
	
	@property
	def lon(self) -> float:
		"""Долгота (X координата)"""
		if self.location:
			try:
				point = to_shape(self.location)
				return float(point.x)
			except (AttributeError, ValueError, TypeError):
				return 0.0
		return 0.0
	
	def get_coordinates(self) -> tuple[float, float]:
		"""Возвращает кортеж (lat, lon)"""
		if self.location:
			try:
				point = to_shape(self.location)
				return float(point.y), float(point.x)
			except (AttributeError, ValueError, TypeError):
				return 0.0, 0.0
		return 0.0, 0.0


class OrderProposal(Base):
	id: Mapped[int] = mapped_column(primary_key=True)
	
	# Информация о предложении
	proposed_price: Mapped[float] = mapped_column(Float)  # Предложенная цена
	message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Сообщение исполнителя
	
	# Временные метки
	created_at: Mapped[datetime] = mapped_column(
		default=datetime.now,
		nullable=False,
	)
	
	# Внешние ключи
	order_id: Mapped[int] = mapped_column(Integer, ForeignKey("order.id"))
	executor_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"))
	
	# Связи
	order: Mapped["Order"] = relationship("Order", back_populates="proposals")
	executor: Mapped["User"] = relationship("User", back_populates="order_proposals")
	chat: Mapped["Chat"] = relationship("Chat", back_populates="proposal")