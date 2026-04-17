from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.api.deps import get_current_user
from app.schemas.auth import SessionUser
from app.schemas.lot import SlotPayload


router = APIRouter(prefix="/api/lots", tags=["lots"])


@router.get("/my-hold", response_model=SlotPayload)
async def my_hold(request: Request, user: SessionUser = Depends(get_current_user)) -> SlotPayload:
    async with request.app.state.session_factory() as session:
        return await request.app.state.lot_service.get_my_hold_payload(
            session,
            user,
            cache_service=request.app.state.cache_service,
            force_refresh=False,
        )

