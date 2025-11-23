from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class User(Base):
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    username: Mapped[str] = mapped_column(String, unique=True, index=True)
    phone_number: Mapped[str] = mapped_column(String, nullable=True, unique=True, index=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)