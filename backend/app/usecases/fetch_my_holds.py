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
            await self._repo.upsert_lots_batch(fresh)
            await self._repo.cache_my_holds(employee_number, fresh)
            await self._uow.commit()
        return fresh
