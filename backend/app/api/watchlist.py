from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import clock_dep, get_watchlist_uc, require_session, save_watchlist_uc
from app.api.wire import watchlist_payload
from app.domain.session import SessionUser
from app.ports.clock import Clock
from app.usecases.get_watchlist import GetWatchlist
from app.usecases.save_watchlist import SaveWatchlist


router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

TABLE_ID_WATCHLIST = 2


class SaveWatchlistBody(BaseModel):
    # 프론트는 camelCase(lotIds)로 보낸다. snake_case도 허용(populate_by_name).
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    lot_ids: list[str] = Field(alias="lotIds")


@router.get("")
async def get_watchlist(
    session: Annotated[SessionUser, Depends(require_session)],
    uc: Annotated[GetWatchlist, Depends(get_watchlist_uc)],
    clock: Annotated[Clock, Depends(clock_dep)],
) -> dict:
    rows = await uc.execute(session.employee_number)
    return watchlist_payload(table_id=TABLE_ID_WATCHLIST, rows=rows, last_updated=clock.now())


@router.post("")
async def save_watchlist(
    body: SaveWatchlistBody,
    session: Annotated[SessionUser, Depends(require_session)],
    save_uc: Annotated[SaveWatchlist, Depends(save_watchlist_uc)],
    get_uc: Annotated[GetWatchlist, Depends(get_watchlist_uc)],
    clock: Annotated[Clock, Depends(clock_dep)],
) -> dict:
    # 전체 교체 저장 → 저장 결과를 lot_status와 JOIN해 즉시 반환(프론트 재조회 불필요)
    await save_uc.execute(session.employee_number, body.lot_ids)
    rows = await get_uc.execute(session.employee_number)
    return watchlist_payload(table_id=TABLE_ID_WATCHLIST, rows=rows, last_updated=clock.now())
