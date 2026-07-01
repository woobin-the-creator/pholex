from __future__ import annotations

from datetime import datetime
from typing import Protocol, runtime_checkable

from app.domain.keyword import KeywordQuery
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

    async def get_lots_by_ids(self, lot_ids: list[str]) -> dict[str, LotRowDTO]:
        """주어진 lot_id 중 캐시(`lot_status`)에 존재하는 것만 {lot_id: LotRowDTO}로 반환.

        슬롯[2] "내 관심 랏"이 watchlist lot_id를 lot 데이터와 JOIN할 때 사용. 없는 lot_id는
        결과에서 빠진다(호출 측이 "조회 대기"로 표시). Real adapter: SELECT … WHERE lot_id = ANY(:ids).
        """
        ...

    async def search(
        self, query: KeywordQuery, *, limit: int, offset: int
    ) -> tuple[list[LotRowDTO], int]:
        """슬롯[5] "Special hold" — DNF 키워드로 lot_status 검색.

        반환: (페이지 행, 총 매칭 건수). 정렬 updated_at DESC, 동률 lot_id ASC. lot_id 기준
        dedup(한 행은 한 번). 빈 쿼리(그룹 0개)는 ([], 0). Real adapter:
        WHERE (그룹1 AND…) OR (그룹2 AND…) … ORDER BY updated_at DESC, lot_id ASC
        LIMIT :limit OFFSET :offset + 별도 COUNT(*).
        """
        ...

    async def get_my_holds_cached(self, operator_ad_id: str) -> list[LotRowDTO] | None:
        """캐시된 결과 반환. None은 *cache miss* (key 부재). 빈 리스트는 *정상 빈 결과*.

        [Phase 2] 캐시 키가 사번→AD id(operator_ad_id)로 바뀜.
        """
        ...

    async def cache_my_holds(self, operator_ad_id: str, rows: list[LotRowDTO]) -> None:
        """AD id별 hold 결과 캐시 적재. 후속 `get_my_holds_cached`에서 hit."""
        ...

    async def invalidate_cache(self, operator_ad_id: str) -> None: ...

    async def get_dump_last_run_at(self) -> datetime | None:
        """lot_dump_meta.last_run_at (dump가 마지막에 돈 시각, tz-aware UTC).

        dump가 한 번도 안 돌았으면 None. employee 무관 전역값.
        신선도(🟡/🔴) 판정 소스 — lot_status 행의 updated_at으로 추론하지 말 것.
        Real adapter: SELECT last_run_at FROM lot_dump_meta WHERE id = 1.
        """
        ...
