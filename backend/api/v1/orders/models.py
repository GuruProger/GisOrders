from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, List, Optional

from geoalchemy2 import Geometry
from geoalchemy2.shape import to_shape
from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base
from core.time import utcnow

if TYPE_CHECKING:
	from ..chat.models import Chat
	from ..users.models import User


class OrderStatus(str, Enum):
	OPEN = "open"  # На заказ можно откликнуться
	ASSIGNED = "assigned"  # Заказчик выбрал исполнителя
	CLOSED = "closed"  # Сделка окончена или отменена


class ProposalStatus(str, Enum):
	PENDING = "pending"  # Ожидает решения заказчика
	ACCEPTED = "accepted"  # Исполнитель выбран
	REJECTED = "rejected"  # Отклонён автоматически или при закрытии заказа


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
		DateTime(timezone=True),
		default=utcnow,
		nullable=False,
	)
	deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))  # Срок выполнения
	closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
	
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
	customer_id: Mapped[int] = mapped_column(
		Integer,
		ForeignKey("user.id", ondelete="CASCADE"),
	)  # Заказчик
	accepted_proposal_id: Mapped[Optional[int]] = mapped_column(
		Integer,
		ForeignKey(
			"order_proposal.id",
			ondelete="SET NULL",
			name="fk_order_accepted_proposal_id_order_proposal",
			use_alter=True,
		),
		unique=True,
		nullable=True,
	)  # Выбранный исполнитель
	
	# Связи
	customer: Mapped["User"] = relationship("User", foreign_keys=[customer_id], back_populates="orders_as_customer")
	proposals: Mapped[List["OrderProposal"]] = relationship(
		"OrderProposal",
		foreign_keys="OrderProposal.order_id",
		back_populates="order",
		cascade="all, delete-orphan",
	)
	chats: Mapped[List["Chat"]] = relationship("Chat", back_populates="order", cascade="all, delete-orphan")
	accepted_proposal: Mapped[Optional["OrderProposal"]] = relationship(
		"OrderProposal",
		foreign_keys=[accepted_proposal_id],
		post_update=True,
	)
	
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
	status: Mapped[ProposalStatus] = mapped_column(
		SQLEnum(ProposalStatus, name="proposal_status"),
		default=ProposalStatus.PENDING,
		server_default=ProposalStatus.PENDING.name,
		nullable=False,
	)
	
	# Временные метки
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True),
		default=utcnow,
		nullable=False,
	)
	
	# Внешние ключи
	order_id: Mapped[int] = mapped_column(
		Integer,
		ForeignKey("order.id", ondelete="CASCADE"),
	)
	executor_id: Mapped[int] = mapped_column(
		Integer,
		ForeignKey("user.id", ondelete="CASCADE"),
	)
	
	# Связи
	order: Mapped["Order"] = relationship(
		"Order", foreign_keys=[order_id], back_populates="proposals"
	)
	executor: Mapped["User"] = relationship("User", back_populates="order_proposals")
	chat: Mapped[Optional["Chat"]] = relationship(
		"Chat", back_populates="proposal", uselist=False
	)
	
	__table_args__ = (
		UniqueConstraint("order_id", "executor_id", name="uq_order_proposal_order_executor"),
	)
