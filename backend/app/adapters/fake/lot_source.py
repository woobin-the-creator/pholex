from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import AsyncIterator

from app.adapters.fake.golden_dataset import GOLDEN_ROWS, GoldenRow
from app.domain.lot import LotStatus
from app.ports.dto import HoldDTO, LotChangeEventDTO, LotRowDTO


class InMemoryLotSource:
    """Fake LotSource — golden dataset에서 hold 조회 + asyncio.Queue 기반 fan-out 스트림.

    [Phase 2] hold는 1:N — `operator_ad_id`로 필터한 뒤 lot별로 hold를 집계해 LotRowDTO 한 행에
    `my_holds` 리스트로 담는다.
    """

    def __init__(self, seed: list[GoldenRow] | None = None) -> None:
        self._rows: list[GoldenRow] = list(seed if seed is not None else GOLDEN_ROWS)
        self._subscribers: dict[str, list[asyncio.Queue[LotChangeEventDTO]]] = defaultdict(list)

    async def fetch_my_holds(self, operator_ad_id: str) -> list[LotRowDTO]:
        # 조회자가 건 active hold 행만 (catg_type='HOLD' → golden은 raw "Hold").
        mine = [
            r
            for r in self._rows
            if r["operator_ad_id"] == operator_ad_id and r["status"] == LotStatus.HOLD
        ]
        # lot별로 hold를 집계 (한 lot에 조회자 hold가 여러 건일 수 있음).
        by_lot: dict[str, list[GoldenRow]] = defaultdict(list)
        for r in mine:
            by_lot[r["lot_id"]].append(r)
        rows = [self._to_dto(hold_rows) for hold_rows in by_lot.values()]
        rows.sort(key=lambda r: r.lot_id)  # deterministic ordering
        return rows

    def subscribe_changes(self, operator_ad_id: str) -> AsyncIterator[LotChangeEventDTO]:
        queue: asyncio.Queue[LotChangeEventDTO] = asyncio.Queue()
        self._subscribers[operator_ad_id].append(queue)

        async def _iter() -> AsyncIterator[LotChangeEventDTO]:
            try:
                while True:
                    event = await queue.get()
                    yield event
            finally:
                # Idempotent unsubscribe: re-running or double-close must not raise.
                bucket = self._subscribers.get(operator_ad_id)
                if bucket is not None and queue in bucket:
                    bucket.remove(queue)

        return _iter()

    async def emit(self, operator_ad_id: str, event: LotChangeEventDTO) -> None:
        """Test helper: fan-out an event to all subscribers of the given operator."""
        for queue in list(self._subscribers[operator_ad_id]):
            await queue.put(event)

    @staticmethod
    def _to_dto(hold_rows: list[GoldenRow]) -> LotRowDTO:
        # 같은 lot_id의 hold 행들 → lot 필드는 공통(첫 행 기준), hold는 my_holds로 집계.
        head = hold_rows[0]
        my_holds = [
            HoldDTO(
                operator_ad_id=r["operator_ad_id"],
                operator_name=r["operator_name"],
                item_type=r["item_type"],
                comment=r["issue_comment"],
                issue_date=r["issue_date"],
            )
            for r in hold_rows
        ]
        return LotRowDTO(
            lot_id=head["lot_id"],
            status=head["status"],  # raw 그대로 (golden은 raw "Hold")
            equipment=head["equipment"],
            process_step=head["process_step"],
            updated_at=head["updated_at"],
            my_holds=my_holds,
        )
