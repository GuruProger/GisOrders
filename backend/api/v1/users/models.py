from typing import List, TYPE_CHECKING

from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base

if TYPE_CHECKING:
	from ..orders.models import Order, OrderProposal


class User(Base):
	id: Mapped[int] = mapped_column(primary_key=True)
	email: Mapped[str] = mapped_column(String, unique=True, index=True)
	hashed_password: Mapped[str] = mapped_column(String)
	username: Mapped[str] = mapped_column(String, unique=True, index=True)
	phone_number: Mapped[str] = mapped_column(String, nullable=True, unique=True, index=True)
	is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
	
	# Связи с Order
	orders_as_customer: Mapped[List["Order"]] = relationship(
		"Order",
		foreign_keys="Order.customer_id",
		back_populates="customer"
	)
	
	# Связи с OrderProposal
	order_proposals: Mapped[List["OrderProposal"]] = relationship(
		"OrderProposal",
		back_populates="executor"
	)
