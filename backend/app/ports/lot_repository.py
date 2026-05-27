from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.ports.dto import LotRowDTO


@runtime_checkable
class LotRepository(Protocol):
    """Pholex의 자체 lot 저장소 (LotSource로부터 받은 데이터의 캐시/사본).

    Real adapter는 Pholex Postgres에 붙는다 (사내 production DB 아님).
    Fake adapter는 인메모리.
    """

    async def upsert_lot(self, row: LotRowDTO) -> None: ...

    async def upsert_lots_batch(self, rows: list[LotRowDTO]) -> None:
        """N건을 단일 트랜잭션으로 적용. 부분 실패 없이 전부 또는 전무."""
        ...

    async def get_my_holds_cached(self, employee_number: str) -> list[LotRowDTO] | None:
        """캐시된 결과 반환. None은 *cache miss* (key 부재). 빈 리스트는 *정상 빈 결과*."""
        ...

    async def cache_my_holds(self, employee_number: str, rows: list[LotRowDTO]) -> None:
        """사번별 hold 결과 캐시 적재. 후속 `get_my_holds_cached`에서 hit."""
        ...

    async def invalidate_cache(self, employee_number: str) -> None: ...
