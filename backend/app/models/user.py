from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    employee_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    username: Mapped[str] = mapped_column(String(100))
    email: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    auth: Mapped[str] = mapped_column(String(50), default="ENGINEER")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    last_login: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
