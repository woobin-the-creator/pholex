from __future__ import annotations

from app.ports.lot_watchlist_repository import LotWatchlistRepository
from app.ports.unit_of_work import UnitOfWork


class SaveWatchlist:
    """슬롯[2] "내 관심 랏" 저장 — 전체 교체(set semantics).

    입력 정규화: 공백 trim → 빈 값 제거 → 중복 제거(첫 위치 유지). 정규화된 리스트가 곧
    watchlist 전체가 되어 UnitOfWork 안에서 원자적으로 저장된다.
    """

    def __init__(self, repo: LotWatchlistRepository, uow: UnitOfWork) -> None:
        self._repo = repo
        self._uow = uow

    async def execute(self, employee_number: str, lot_ids: list[str]) -> list[str]:
        cleaned: list[str] = []
        seen: set[str] = set()
        for raw in lot_ids:
            lid = raw.strip()
            if not lid or lid in seen:
                continue
            seen.add(lid)
            cleaned.append(lid)

        async with self._uow:
            await self._repo.save(employee_number, cleaned)
            await self._uow.commit()
        return cleaned
