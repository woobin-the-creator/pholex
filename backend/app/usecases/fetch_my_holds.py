from __future__ import annotations

from app.ports.dto import LotRowDTO
from app.ports.lot_repository import LotRepository
from app.ports.lot_source import LotSource
from app.ports.unit_of_work import UnitOfWork


class FetchMyHolds:
    def __init__(self, source: LotSource, repo: LotRepository, uow: UnitOfWork) -> None:
        self._source = source
        self._repo = repo
        self._uow = uow

    async def execute(self, employee_number: str, *, force_refresh: bool = False) -> list[LotRowDTO]:
        if not force_refresh:
            cached = await self._repo.get_my_holds_cached(employee_number)
            if cached is not None:
                return cached

        async with self._uow:
            fresh = await self._source.fetch_my_holds(employee_number)
            # hold가 0건이면 빈 배치를 upsert/cache 하지 않는다. 빈 INSERT VALUES 를
            # PostgreSQL이 "null 1행"으로 해석해 lot_id NOT NULL 위반 → 500이 났다
            # (hold 없는 사용자는 빈 화면이 정상 — 에러가 아니다).
            if fresh:
                await self._repo.upsert_lots_batch(fresh)
                await self._repo.cache_my_holds(employee_number, fresh)
            await self._uow.commit()
        return fresh
