from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import AsyncIterator

from ulid import ULID

from app.adapters.fake.golden_dataset import GOLDEN_ROWS, GoldenRow
from app.domain.lot import LotStatus
from app.ports.dto import LotChangeEventDTO, LotRowDTO


class InMemoryLotSource:
    """Fake LotSource — golden dataset에서 hold 조회 + asyncio.Queue 기반 fan-out 스트림."""

    def __init__(self, seed: list[GoldenRow] | None = None) -> None:
        self._rows: list[GoldenRow] = list(seed if seed is not None else GOLDEN_ROWS)
        self._subscribers: dict[str, list[asyncio.Queue[LotChangeEventDTO]]] = defaultdict(list)

    async def fetch_my_holds(self, employee_number: str) -> list[LotRowDTO]:
        matching = [r for r in self._rows if r["hold_operator_employee_number"] == employee_number and r["status"] == LotStatus.HOLD]
        matching.sort(key=lambda r: r["lot_id"])  # deterministic ordering
        return [self._to_dto(r, employee_number) for r in matching]

    def subscribe_changes(self, employee_number: str) -> AsyncIterator[LotChangeEventDTO]:
        queue: asyncio.Queue[LotChangeEventDTO] = asyncio.Queue()
        self._subscribers[employee_number].append(queue)

        async def _iter() -> AsyncIterator[LotChangeEventDTO]:
            try:
                while True:
                    event = await queue.get()
                    yield event
            finally:
                # Idempotent unsubscribe: re-running or double-close must not raise.
                bucket = self._subscribers.get(employee_number)
                if bucket is not None and queue in bucket:
                    bucket.remove(queue)

        return _iter()

    async def emit(self, employee_number: str, event: LotChangeEventDTO) -> None:
        """Test helper: fan-out an event to all subscribers of the given employee."""
        for queue in list(self._subscribers[employee_number]):
            await queue.put(event)

    def new_event_id(self) -> str:
        return str(ULID())

    @staticmethod
    def _to_dto(row: GoldenRow, viewer_employee_number: str) -> LotRowDTO:
        return LotRowDTO(
            lot_id=row["lot_id"],
            status=row["status"],  # raw 그대로 (golden은 raw "Hold")
            equipment=row["equipment"],
            process_step=row["process_step"],
            hold_comment=row["hold_comment"],
            updated_at=row["updated_at"],
            is_held_by_me=(row["hold_operator_employee_number"] == viewer_employee_number),
        )
