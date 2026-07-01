from __future__ import annotations

import copy
from datetime import datetime

from app.domain.keyword import KeywordQuery
from app.ports.dto import LotRowDTO


class InMemoryLotRepository:
    """Fake LotRepository — dict 캐시. 캐시 hit/miss를 None vs []로 정확히 구분."""

    def __init__(self) -> None:
        # lot_status(lot당 1행) + lot_hold(my_holds 리스트)를 한 DTO로 통합 저장(fake 범위).
        self._by_lot: dict[str, LotRowDTO] = {}
        self._cache_by_operator: dict[str, list[LotRowDTO]] = {}  # 캐시 키 = operator_ad_id
        # dump heartbeat. 기본 None = dump 미실행. 테스트가 세터로 주입한다.
        self._dump_last_run_at: datetime | None = None

    async def upsert_lot(self, row: LotRowDTO) -> None:
        self._by_lot[row.lot_id] = row

    async def upsert_lots_batch(self, rows: list[LotRowDTO]) -> None:
        self._by_lot.update({row.lot_id: row for row in rows})

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
                    # [Phase 2] hold는 1:N — my_holds의 comment들을 합쳐 검색 대상 텍스트로 노출.
                    "hold_comment": _joined_comments(row),
                }
            )
        ]
        # updated_at DESC, 동률 lot_id ASC — stable sort 2단(2차 키 먼저, 1차 키 나중)
        matched.sort(key=lambda r: r.lot_id)
        matched.sort(key=lambda r: r.updated_at, reverse=True)
        total = len(matched)
        return matched[offset : offset + limit], total

    async def get_my_holds_cached(self, operator_ad_id: str) -> list[LotRowDTO] | None:
        cached = self._cache_by_operator.get(operator_ad_id)
        if cached is None:
            return None
        return copy.deepcopy(cached)

    async def cache_my_holds(self, operator_ad_id: str, rows: list[LotRowDTO]) -> None:
        self._cache_by_operator[operator_ad_id] = copy.deepcopy(rows)

    async def invalidate_cache(self, operator_ad_id: str) -> None:
        self._cache_by_operator.pop(operator_ad_id, None)

    def set_dump_last_run_at(self, dt: datetime | None) -> None:
        """테스트 헬퍼 — dump heartbeat 주입 (Port 외 fake 전용)."""
        self._dump_last_run_at = dt

    async def get_dump_last_run_at(self) -> datetime | None:
        return self._dump_last_run_at


def _joined_comments(row: LotRowDTO) -> str | None:
    """my_holds의 comment들을 개행으로 합친다(키워드 검색 대상). 전부 비면 None."""
    parts = [h.comment for h in row.my_holds if h.comment]
    return "\n".join(parts) if parts else None
