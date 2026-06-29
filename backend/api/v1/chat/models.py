from typing import List, TYPE_CHECKING
from sqlalchemy import String, Text, DateTime, Integer, ForeignKey, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from datetime import datetime

if TYPE_CHECKING:
	from ..users.models import User
	from ..orders.models import Order, OrderProposal

from core.database import Base


class Chat(Base):
	"""Чат между заказчиком и исполнителем по конкретному заказу"""
	
	id: Mapped[int] = mapped_column(primary_key=True)
	
	# Статус чата
	is_active: Mapped[bool] = mapped_column(Boolean, default=True)
	
	# Временные метки
	created_at: Mapped[datetime] = mapped_column(
		DateTime, server_default=func.now(), nullable=False
	)
	updated_at: Mapped[datetime] = mapped_column(
		DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
	)
	
	# Внешние ключи
	order_id: Mapped[int] = mapped_column(Integer, ForeignKey("order.id"), nullable=False)
	customer_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"), nullable=False)
	executor_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"), nullable=False)
	proposal_id: Mapped[int] = mapped_column(Integer, ForeignKey("order_proposal.id"), nullable=True)
	
	# Связи
	order: Mapped["Order"] = relationship("Order", back_populates="chats")
	customer: Mapped["User"] = relationship("User", foreign_keys=[customer_id], back_populates="chats_as_customer")
	executor: Mapped["User"] = relationship("User", foreign_keys=[executor_id], back_populates="chats_as_executor")
	proposal: Mapped["OrderProposal"] = relationship("OrderProposal", back_populates="chat")
	messages: Mapped[List["Message"]] = relationship("Message", back_populates="chat", cascade="all, delete-orphan")


class Message(Base):
	"""Сообщение в чате"""
	
	id: Mapped[int] = mapped_column(primary_key=True)
	
	# Содержание сообщения
	text: Mapped[str] = mapped_column(Text, nullable=False)
	
	# Статус прочтения
	is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
	
	# Временные метки
	created_at: Mapped[datetime] = mapped_column(
		DateTime, server_default=func.now(), nullable=False
	)
	
	# Внешние ключи
	chat_id: Mapped[int] = mapped_column(Integer, ForeignKey("chat.id"), nullable=False)
	sender_id: Mapped[int] = mapped_column(Integer, ForeignKey("user.id"), nullable=False)
	
	# Связи
	chat: Mapped["Chat"] = relationship("Chat", back_populates="messages")
	sender: Mapped["User"] = relationship("User", back_populates="sent_messages")
