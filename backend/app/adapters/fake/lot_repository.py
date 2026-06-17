from __future__ import annotations

import copy
from datetime import datetime

from app.domain.keyword import KeywordQuery
from app.ports.dto import LotRowDTO


class InMemoryLotRepository:
    """Fake LotRepository — dict 캐시. 캐시 hit/miss를 None vs []로 정확히 구분."""

    def __init__(self) -> None:
        self._by_lot: dict[str, LotRowDTO] = {}
        self._cache_by_employee: dict[str, list[LotRowDTO]] = {}
        # dump heartbeat. 기본 None = dump 미실행. 테스트가 세터로 주입한다.
        self._dump_last_run_at: datetime | None = None

    async def upsert_lot(self, row: LotRowDTO) -> None:
        self._by_lot[row.lot_id] = row

    async def upsert_lots_batch(self, rows: list[LotRowDTO]) -> None:
        # atomic from caller's POV: snapshot first, then apply all-or-nothing
        snapshot = dict(self._by_lot)
        try:
            for row in rows:
                self._by_lot[row.lot_id] = row
        except Exception:
            self._by_lot = snapshot
            raise

    async def get_lots_by_ids(self, lot_ids: list[str]) -> dict[str, LotRowDTO]:
        return {lid: self._by_lot[lid] for lid in lot_ids if lid in self._by_lot}

    async def search(
        self, query: KeywordQuery, *, limit: int, offset: int
    ) -> tuple[list[LotRowDTO], int]:
        if query.is_empty:
            return [], 0
        matched = [
            row
            for row in self._by_lot.values()  # dict keyed by lot_id → 이미 lot_id dedup
            if query.matches(
                {
                    "lot_id": row.lot_id,
                    "status": row.status,
                    "equipment": row.equipment,
                    "process_step": row.process_step,
                    "hold_comment": row.hold_comment,
                }
            )
        ]
        # updated_at DESC, 동률 lot_id ASC — stable sort 2단(2차 키 먼저, 1차 키 나중)
        matched.sort(key=lambda r: r.lot_id)
        matched.sort(key=lambda r: r.updated_at, reverse=True)
        total = len(matched)
        return matched[offset : offset + limit], total

    async def get_my_holds_cached(self, employee_number: str) -> list[LotRowDTO] | None:
        cached = self._cache_by_employee.get(employee_number)
        if cached is None:
            return None
        return copy.deepcopy(cached)

    async def cache_my_holds(self, employee_number: str, rows: list[LotRowDTO]) -> None:
        self._cache_by_employee[employee_number] = copy.deepcopy(rows)

    async def invalidate_cache(self, employee_number: str) -> None:
        self._cache_by_employee.pop(employee_number, None)

    def set_dump_last_run_at(self, dt: datetime | None) -> None:
        """테스트 헬퍼 — dump heartbeat 주입 (Port 외 fake 전용)."""
        self._dump_last_run_at = dt

    async def get_dump_last_run_at(self) -> datetime | None:
        return self._dump_last_run_at
