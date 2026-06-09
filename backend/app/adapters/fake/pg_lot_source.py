"""Postgres-backed fake LotSource — 사내 real adapter의 reference 구현.

사내 AI가 `real/lot_source.py`에 그대로 미러링할 정답 구조다. 사내 현재 구현 대비
의도적으로 고친 두 가지:

1. **owner 필터** — `WHERE lot_hold_user_id = :employee_number`. 사내 구현은 이게 빠져
   전체 hold를 반환했다 ("내 hold인데 전체가 나온다" + 과부하 504의 출발점).
2. **canonical 매핑** — Active/Hold/PreActive 세 raw 값을 모두 명시. 사내 구현은 일부가
   누락돼 unknown→wait로 떨어질 위험이 있었다.

`last_update_date`는 naive timestamp(KST wall-clock 가정)라, UTC로 localize해서
tz-aware datetime contract(`LotRowDTO.updated_at`)를 지킨다. 사내 source가 사실 UTC면
`_KST`를 `timezone.utc`로 바꾸면 된다.
"""

from __future__ import annotations

import asyncio
from datetime import timezone
from typing import AsyncIterator
from zoneinfo import ZoneInfo

from sqlalchemy import select
from ulid import ULID

from app.adapters.fake.pg_engine import get_engine
from app.adapters.fake.pg_schema import sample_table
from app.domain.lot import LotStatus
from app.ports.dto import LotChangeEventDTO, LotRowDTO

# 사내 naive timestamp의 실제 timezone. fab 로컬 시각(KST) 가정.
_KST = ZoneInfo("Asia/Seoul")

# status는 raw lot_status_seg 값을 그대로 적재한다(매핑·변환 없음 — unknown→wait 위조 방지).
# 슬롯[1] "내 lot hold"는 hold 앵커 하나로만 source를 거른다.
_HOLD_RAW = LotStatus.HOLD  # = "Hold". hold를 뜻하는 유일한 raw 값


class PgSampleLotSource:
    """Postgres `sample` 테이블에서 hold를 읽는 LotSource.

    polling 기반 stand-in이므로 `subscribe_changes`는 주기적으로 hold 스냅샷을 diff해
    변경 이벤트를 fan-out한다 (사내 source의 polling→event 모델을 모방).
    """

    def __init__(self, poll_interval_seconds: float = 5.0) -> None:
        self._poll_interval = poll_interval_seconds

    async def fetch_my_holds(self, employee_number: str) -> list[LotRowDTO]:
        stmt = (
            select(
                sample_table.c.lot_id,
                sample_table.c.lot_status_seg,
                sample_table.c.eqp_type,
                sample_table.c.step_name,
                sample_table.c.lot_hold_comment,
                sample_table.c.last_update_date,
                sample_table.c.lot_hold_user_id,
            )
            .where(sample_table.c.lot_status_seg == _HOLD_RAW)
            .where(sample_table.c.lot_hold_user_id == employee_number)
            .order_by(sample_table.c.lot_id.asc())
        )
        engine = get_engine()
        async with engine.connect() as conn:
            result = await conn.execute(stmt)
            rows = result.all()
        return [self._to_dto(row, employee_number) for row in rows]

    def subscribe_changes(self, employee_number: str) -> AsyncIterator[LotChangeEventDTO]:
        async def _iter() -> AsyncIterator[LotChangeEventDTO]:
            previous = {r.lot_id: r for r in await self.fetch_my_holds(employee_number)}
            while True:
                await asyncio.sleep(self._poll_interval)
                current = {r.lot_id: r for r in await self.fetch_my_holds(employee_number)}
                for event in self._diff(previous, current):
                    yield event
                previous = current

        return _iter()

    def new_event_id(self) -> str:
        return str(ULID())

    def _diff(
        self, previous: dict[str, LotRowDTO], current: dict[str, LotRowDTO]
    ) -> list[LotChangeEventDTO]:
        events: list[LotChangeEventDTO] = []
        for lot_id, row in current.items():
            prev = previous.get(lot_id)
            if prev is None:
                events.append(self._event(lot_id, "hold", None, _HOLD_RAW, row.hold_comment, row))
            elif prev.hold_comment != row.hold_comment:
                events.append(self._event(lot_id, "comment", _HOLD_RAW, _HOLD_RAW, row.hold_comment, row))
        for lot_id, prev in previous.items():
            if lot_id not in current:
                events.append(self._event(lot_id, "removed", _HOLD_RAW, None, None, prev))
        return events

    def _event(
        self,
        lot_id: str,
        change_type: str,
        previous_status: str | None,
        new_status: str | None,
        new_hold_comment: str | None,
        row: LotRowDTO,
    ) -> LotChangeEventDTO:
        return LotChangeEventDTO(
            lot_id=lot_id,
            change_type=change_type,  # type: ignore[arg-type]
            previous_status=previous_status,
            new_status=new_status,
            new_hold_comment=new_hold_comment,
            occurred_at=row.updated_at,
            event_id=self.new_event_id(),
        )

    def _to_dto(self, row, viewer_employee_number: str) -> LotRowDTO:
        last_update = row.last_update_date
        if last_update.tzinfo is None:
            last_update = last_update.replace(tzinfo=_KST)
        updated_at_utc = last_update.astimezone(timezone.utc)
        return LotRowDTO(
            lot_id=row.lot_id,
            status=row.lot_status_seg,  # raw 그대로 (매핑 없음)
            equipment=row.eqp_type,
            process_step=row.step_name,
            hold_comment=row.lot_hold_comment,
            updated_at=updated_at_utc,
            is_held_by_me=(row.lot_hold_user_id == viewer_employee_number),
        )
