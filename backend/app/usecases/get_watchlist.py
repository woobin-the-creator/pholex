from __future__ import annotations

from app.ports.dto import LotRowDTO, WatchlistRowDTO
from app.ports.lot_repository import LotRepository
from app.ports.lot_watchlist_repository import LotWatchlistRepository


def _joined_hold_comments(lot: LotRowDTO) -> str | None:
    parts = [h.comment for h in lot.my_holds if h.comment]
    return "\n".join(parts) if parts else None


class GetWatchlist:
    """슬롯[2] "내 관심 랏" 조회 — watchlist lot_id를 lot_status와 JOIN해 표시 행 생성.

    등록 순서를 보존하고, `lot_status`에 없는 lot_id는 found=False("조회 대기/없음")로 띄운다.
    """

    def __init__(self, watchlist: LotWatchlistRepository, lots: LotRepository) -> None:
        self._watchlist = watchlist
        self._lots = lots

    async def execute(self, employee_number: str) -> list[WatchlistRowDTO]:
        lot_ids = await self._watchlist.get(employee_number)
        if not lot_ids:
            return []

        found = await self._lots.get_lots_by_ids(lot_ids)
        rows: list[WatchlistRowDTO] = []
        for lid in lot_ids:  # 등록 순서 보존
            lot = found.get(lid)
            if lot is None:
                rows.append(WatchlistRowDTO(lot_id=lid, found=False))
            else:
                rows.append(
                    WatchlistRowDTO(
                        lot_id=lid,
                        found=True,
                        status=lot.status,
                        equipment=lot.equipment,
                        process_step=lot.process_step,
                        # [Phase 2] hold는 1:N — 단일 hold_comment 축이 사라짐. watchlist(슬롯[2])는
                        # 이번 범위 밖이라 lot의 hold comment들을 합쳐 임시로 채운다(비면 None).
                        # TODO Phase2 후속: watchlist 행에도 hold 1:N 표현을 정식 반영.
                        hold_comment=_joined_hold_comments(lot),
                        updated_at=lot.updated_at,
                    )
                )
        return rows
