from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field

from app.api.deps import clock_dep, require_session, search_special_hold_uc
from app.api.wire import special_hold_payload
from app.domain.keyword import KeywordError
from app.domain.session import SessionUser
from app.ports.clock import Clock
from app.usecases.search_special_hold import SearchSpecialHold


router = APIRouter(prefix="/api/special-hold", tags=["special-hold"])

TABLE_ID_SPECIAL_HOLD = 5


class SearchBody(BaseModel):
    # config = DNF JSONB(domain.keyword 형식). 프리셋 저장 없이 즉석 드래프트로도 검색 가능.
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    config: dict
    page: int = 1
    page_size: int = Field(default=100, alias="pageSize")


@router.post("/search")
async def search(
    body: SearchBody,
    session: Annotated[SessionUser, Depends(require_session)],
    uc: Annotated[SearchSpecialHold, Depends(search_special_hold_uc)],
    clock: Annotated[Clock, Depends(clock_dep)],
) -> dict:
    try:
        result = await uc.execute(body.config, page=body.page, page_size=body.page_size)
    except KeywordError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    return special_hold_payload(
        table_id=TABLE_ID_SPECIAL_HOLD,
        rows=result.rows,
        total=result.total,
        page=result.page,
        page_size=result.page_size,
        last_updated=clock.now(),
    )
