from __future__ import annotations

from app.ports.dto import WatchlistRowDTO
from app.ports.lot_repository import LotRepository
from app.ports.lot_watchlist_repository import LotWatchlistRepository


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
                        hold_comment=lot.hold_comment,
                        updated_at=lot.updated_at,
                    )
                )
        return rows
