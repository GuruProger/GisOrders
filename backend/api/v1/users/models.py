from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base
from core.time import utcnow

if TYPE_CHECKING:
	from ..chat.models import Chat, Message
	from ..orders.models import Order, OrderProposal


class User(Base):
	id: Mapped[int] = mapped_column(primary_key=True)
	email: Mapped[str] = mapped_column(String, unique=True, index=True)
	hashed_password: Mapped[str] = mapped_column(String)
	username: Mapped[str] = mapped_column(String, unique=True, index=True)
	phone_number: Mapped[str] = mapped_column(String, nullable=True, unique=True, index=True)
	is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
	is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true(), nullable=False)
	
	# Связи с Order
	orders_as_customer: Mapped[List["Order"]] = relationship(
		"Order",
		foreign_keys="Order.customer_id",
		back_populates="customer",
		cascade="all, delete-orphan"
	)
	
	# Связи с OrderProposal
	order_proposals: Mapped[List["OrderProposal"]] = relationship(
		"OrderProposal",
		back_populates="executor",
		cascade="all, delete-orphan"
	)

	# Связи с Chat
	chats_as_customer: Mapped[List["Chat"]] = relationship(
		"Chat",
		foreign_keys="Chat.customer_id",
		back_populates="customer",
		cascade="all, delete-orphan"
	)
	chats_as_executor: Mapped[List["Chat"]] = relationship(
		"Chat",
		foreign_keys="Chat.executor_id",
		back_populates="executor",
		cascade="all, delete-orphan"
	)

	# Связи с Message
	sent_messages: Mapped[List["Message"]] = relationship(
		"Message",
		back_populates="sender",
		cascade="all, delete-orphan"
	)


class RefreshToken(Base):
	"""Opaque refresh-токен; в базе хранится только его SHA-256."""
	
	id: Mapped[int] = mapped_column(primary_key=True)
	token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
	user_id: Mapped[int] = mapped_column(
		Integer,
		ForeignKey("user.id", ondelete="CASCADE"),
		index=True,
		nullable=False,
	)
	
	created_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), default=utcnow, nullable=False
	)
	expires_at: Mapped[datetime] = mapped_column(
		DateTime(timezone=True), index=True, nullable=False
	)
	revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
	
	# Для расследования reuse: какой токен заменил этот
	replaced_by_id: Mapped[Optional[int]] = mapped_column(
		Integer,
		ForeignKey("refresh_token.id", ondelete="SET NULL"),
		nullable=True,
	)
