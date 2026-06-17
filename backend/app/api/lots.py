from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import clock_dep, fetch_my_holds_uc, require_session
from app.api.wire import slot_payload
from app.domain.session import SessionUser
from app.ports.clock import Clock
from app.usecases.fetch_my_holds import FetchMyHolds


router = APIRouter(prefix="/api/lots", tags=["lots"])

TABLE_ID_MY_HOLD = 1


@router.get("/my-hold")
async def get_my_hold(
    session: Annotated[SessionUser, Depends(require_session)],
    uc: Annotated[FetchMyHolds, Depends(fetch_my_holds_uc)],
    clock: Annotated[Clock, Depends(clock_dep)],
    force_refresh: bool = False,
) -> dict:
    result = await uc.execute(session.employee_number, force_refresh=force_refresh)
    return slot_payload(
        table_id=TABLE_ID_MY_HOLD,
        rows=result.rows,
        diff=False,
        last_updated=clock.now(),
        last_run_at=result.last_run_at,
    )
