from __future__ import annotations

from datetime import datetime

from sqlalchemy import BigInteger, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LotStatus(Base):
    __tablename__ = "lot_status"

    lot_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    status: Mapped[str] = mapped_column(String(20), index=True)
    equipment: Mapped[str | None] = mapped_column(String(100), nullable=True)
    process_step: Mapped[str | None] = mapped_column(String(100), nullable=True)
    hold_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    hold_operator_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

