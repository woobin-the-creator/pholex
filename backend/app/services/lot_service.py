from __future__ import annotations

from datetime import datetime

from sqlalchemy import Select, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.lot import LotStatus
from app.schemas.auth import SessionUser
from app.schemas.lot import LotRow, SlotPayload
from app.services.cache_service import CacheService


def normalize_employee_number(value: str | int | None) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or not text.isdigit():
        return None
    return int(text)


class LotService:
    async def get_my_hold_rows(
        self,
        session: AsyncSession,
        user: SessionUser,
    ) -> list[LotRow]:
        employee_number = normalize_employee_number(user.employee_number)
        if employee_number is None:
            return []

        statement: Select[tuple[LotStatus]] = (
            select(LotStatus)
            .where(LotStatus.status == "hold")
            .where(LotStatus.hold_operator_id == employee_number)
            .order_by(desc(LotStatus.updated_at), LotStatus.lot_id)
        )
        result = await session.execute(statement)
        rows = result.scalars().all()
        return [
            LotRow(
                lotId=row.lot_id,
                status=row.status,
                equipment=row.equipment,
                processStep=row.process_step,
                holdComment=row.hold_comment,
                updatedAt=row.updated_at,
            )
            for row in rows
        ]

    async def get_my_hold_payload(
        self,
        session: AsyncSession,
        user: SessionUser,
        *,
        cache_service: CacheService,
        force_refresh: bool = False,
    ) -> SlotPayload:
        cache_key = f"my-hold:{user.employee_id}"
        if not force_refresh:
            cached = await cache_service.get(cache_key)
            if cached is not None:
                return cached

        rows = await self.get_my_hold_rows(session, user)
        last_updated: datetime | None = rows[0].updated_at if rows else None
        payload = SlotPayload(tableId=1, rows=rows, diff=True, lastUpdated=last_updated)
        await cache_service.set(cache_key, payload)
        return payload

