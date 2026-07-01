from __future__ import annotations

from app.ports.dto import MyHoldResult
from app.ports.lot_repository import LotRepository
from app.ports.lot_source import LotSource
from app.ports.unit_of_work import UnitOfWork


class FetchMyHolds:
    def __init__(self, source: LotSource, repo: LotRepository, uow: UnitOfWork) -> None:
        self._source = source
        self._repo = repo
        self._uow = uow

    async def execute(
        self, operator_ad_id: str, *, force_refresh: bool = False
    ) -> MyHoldResult:
        # [Phase 2] 매칭 키가 사번→AD id(operator_ad_id, email 로컬파트)로 바뀜(CONTRACT-1).
        # 신선도(last_run_at)는 캐시 hit/miss·force_refresh와 무관하게 항상 repo에서 읽는다.
        # dump heartbeat는 hold 데이터의 신선도와 별개 소스(lot_dump_meta)다.
        last_run_at = await self._repo.get_dump_last_run_at()

        if not force_refresh:
            cached = await self._repo.get_my_holds_cached(operator_ad_id)
            if cached is not None:
                return MyHoldResult(rows=cached, last_run_at=last_run_at)

        async with self._uow:
            fresh = await self._source.fetch_my_holds(operator_ad_id)
            # hold가 0건이면 빈 배치를 upsert/cache 하지 않는다. 빈 INSERT VALUES 를
            # PostgreSQL이 "null 1행"으로 해석해 lot_id NOT NULL 위반 → 500이 났다
            # (hold 없는 사용자는 빈 화면이 정상 — 에러가 아니다).
            if fresh:
                await self._repo.upsert_lots_batch(fresh)
                await self._repo.cache_my_holds(operator_ad_id, fresh)
            await self._uow.commit()
        return MyHoldResult(rows=fresh, last_run_at=last_run_at)
