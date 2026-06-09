from __future__ import annotations

import copy

from app.ports.dto import LotRowDTO


class InMemoryLotRepository:
    """Fake LotRepository — dict 캐시. 캐시 hit/miss를 None vs []로 정확히 구분."""

    def __init__(self) -> None:
        self._by_lot: dict[str, LotRowDTO] = {}
        self._cache_by_employee: dict[str, list[LotRowDTO]] = {}

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

    async def get_my_holds_cached(self, employee_number: str) -> list[LotRowDTO] | None:
        cached = self._cache_by_employee.get(employee_number)
        if cached is None:
            return None
        return copy.deepcopy(cached)

    async def cache_my_holds(self, employee_number: str, rows: list[LotRowDTO]) -> None:
        self._cache_by_employee[employee_number] = copy.deepcopy(rows)

    async def invalidate_cache(self, employee_number: str) -> None:
        self._cache_by_employee.pop(employee_number, None)
