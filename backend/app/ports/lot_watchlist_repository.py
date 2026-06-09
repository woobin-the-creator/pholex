from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class LotWatchlistRepository(Protocol):
    """슬롯[2] "내 관심 랏" — 사용자가 수동 등록한 lot_id 목록 (user_lots 테이블).

    Real adapter는 Pholex Postgres의 `user_lots`에 (employee_number, lot_id, order_index)로
    저장한다 (docs/backend.md §4.2~4.3). Fake adapter는 인메모리.

    저장은 *전체 교체(set semantics)* — 화면의 리스트가 곧 watchlist 전체다. lot 데이터(status 등)는
    여기 두지 않는다; 표시 시 LotRepository.get_lots_by_ids로 `lot_status`와 JOIN한다.
    """

    async def save(self, employee_number: str, lot_ids: list[str]) -> None:
        """전체 교체. 기존 행을 모두 제거하고 lot_ids를 입력 순서(order_index)대로 재삽입.

        정규화(공백 제거·중복 제거)는 호출 측(use case) 책임. 저장소는 받은 순서를 그대로 보존한다.
        빈 리스트는 watchlist 비우기(정상)다.
        """
        ...

    async def get(self, employee_number: str) -> list[str]:
        """order_index 순서대로 lot_id 리스트 반환. 등록이 없으면 빈 리스트."""
        ...
