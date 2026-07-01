"""Postgres-backed fake LotSource — 사내 real adapter의 reference 구현.

사내 AI가 `real/lot_source.py`에 그대로 미러링할 정답 구조다. 의도적으로 고친 점:

1. **owner 필터** — `WHERE operator_ad_id = :operator_ad_id`. 사내 구현은 이게 빠져
   전체 hold를 반환했다 ("내 hold인데 전체가 나온다" + 과부하 504의 출발점).
   [Phase 2] 매칭 키가 사번(lot_hold_user_id)→AD id(operator_ad_id)로 바뀌었다(CONTRACT-1).
2. **1:N 집계** — 소스는 explode된 hold 행이라 한 lot이 여러 행. lot별로 hold를 집계해
   LotRowDTO 한 행의 `my_holds`에 담는다.

`issue_date`는 naive timestamp(KST wall-clock 가정)라, UTC로 localize해서 tz-aware datetime
contract(`LotRowDTO.updated_at`, `HoldDTO.issue_date`)를 지킨다. 사내 source가 사실 UTC면
`_KST`를 `timezone.utc`로 바꾸면 된다.
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone
from typing import AsyncIterator
from zoneinfo import ZoneInfo

from sqlalchemy import select
from ulid import ULID

from app.adapters.fake.pg_engine import get_engine
from app.adapters.fake.pg_schema import sample_table
from app.domain.lot import LotStatus
from app.ports.dto import HoldDTO, LotChangeEventDTO, LotRowDTO

# 사내 naive timestamp의 실제 timezone. fab 로컬 시각(KST) 가정.
_KST = ZoneInfo("Asia/Seoul")

# status는 raw status_type 값을 그대로 적재한다(매핑·변환 없음 — unknown→wait 위조 방지).
# 슬롯[1] "내 lot hold"는 hold 앵커 하나로만 source를 거른다.
_HOLD_RAW = LotStatus.HOLD  # = "Hold". hold를 뜻하는 유일한 raw 값


def _to_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=_KST)
    return dt.astimezone(timezone.utc)


class PgSampleLotSource:
    """Postgres `sample` 테이블에서 hold를 읽는 LotSource.

    polling 기반 stand-in이므로 `subscribe_changes`는 주기적으로 hold 스냅샷을 diff해
    변경 이벤트를 fan-out한다 (사내 source의 polling→event 모델을 모방).
    """

    def __init__(self, poll_interval_seconds: float = 5.0) -> None:
        self._poll_interval = poll_interval_seconds

    async def fetch_my_holds(self, operator_ad_id: str) -> list[LotRowDTO]:
        stmt = (
            select(
                sample_table.c.lot_id,
                sample_table.c.status_type,
                sample_table.c.step_desc,
                sample_table.c.operator_ad_id,
                sample_table.c.operator_name,
                sample_table.c.item_type,
                sample_table.c.issue_comment,
                sample_table.c.issue_date,
            )
            .where(sample_table.c.status_type == _HOLD_RAW)
            .where(sample_table.c.operator_ad_id == operator_ad_id)
            .order_by(sample_table.c.lot_id.asc(), sample_table.c.issue_date.asc())
        )
        engine = get_engine()
        async with engine.connect() as conn:
            result = await conn.execute(stmt)
            rows = result.all()

        # lot별로 hold 집계 (한 lot에 조회자 hold가 여러 건일 수 있음).
        by_lot: dict[str, list] = defaultdict(list)
        for row in rows:
            by_lot[row.lot_id].append(row)
        return [self._to_dto(lot_id, hold_rows) for lot_id, hold_rows in by_lot.items()]

    def subscribe_changes(self, operator_ad_id: str) -> AsyncIterator[LotChangeEventDTO]:
        async def _iter() -> AsyncIterator[LotChangeEventDTO]:
            previous = {r.lot_id: r for r in await self.fetch_my_holds(operator_ad_id)}
            while True:
                await asyncio.sleep(self._poll_interval)
                current = {r.lot_id: r for r in await self.fetch_my_holds(operator_ad_id)}
                for event in self._diff(previous, current):
                    yield event
                previous = current

        return _iter()

    def new_event_id(self) -> str:
        return str(ULID())

    def _diff(
        self, previous: dict[str, LotRowDTO], current: dict[str, LotRowDTO]
    ) -> list[LotChangeEventDTO]:
        # TODO Phase2 후속(알람 1:N): my_holds 리스트 diff는 알람 outbox 재설계 범위다.
        # 지금은 lot 등장/소멸만 이벤트로 낸다(대표 hold의 comment로 임시 표기).
        events: list[LotChangeEventDTO] = []
        for lot_id, row in current.items():
            prev = previous.get(lot_id)
            if prev is None:
                events.append(self._event(lot_id, "hold", None, _HOLD_RAW, _rep_comment(row), row))
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

    def _to_dto(self, lot_id: str, hold_rows: list) -> LotRowDTO:
        head = hold_rows[0]
        my_holds = [
            HoldDTO(
                operator_ad_id=r.operator_ad_id,
                operator_name=r.operator_name,
                item_type=r.item_type,
                comment=r.issue_comment,
                issue_date=_to_utc(r.issue_date),
            )
            for r in hold_rows
        ]
        # lot의 updated_at은 그 lot 최신 issue_date (dump-job-spec.md §3.1).
        latest = max((_to_utc(r.issue_date) for r in hold_rows if r.issue_date is not None), default=None)
        return LotRowDTO(
            lot_id=lot_id,
            status=head.status_type,  # raw 그대로 (매핑 없음)
            equipment=None,           # hold lot=stocker → 항상 NULL (소스 eqp_id_list 100% NULL)
            process_step=head.step_desc,
            updated_at=latest or datetime.now(tz=timezone.utc),
            my_holds=my_holds,
        )


def _rep_comment(row: LotRowDTO) -> str | None:
    """대표 hold comment (알람 임시 표기용). my_holds 첫 건의 comment."""
    return row.my_holds[0].comment if row.my_holds else None
