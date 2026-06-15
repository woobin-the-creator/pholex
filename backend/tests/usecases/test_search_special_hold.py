from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.adapters.fake.lot_repository import InMemoryLotRepository
from app.domain.keyword import KeywordError
from app.ports.dto import LotRowDTO
from app.usecases.search_special_hold import SearchSpecialHold

_CFG = {"groups": [{"conditions": [{"field": "equipment", "value": "X"}]}]}


def _lot(lot_id: str) -> LotRowDTO:
    return LotRowDTO(
        lot_id=lot_id,
        status="Active",
        equipment="X",
        process_step=None,
        hold_comment=None,
        updated_at=datetime.now(tz=timezone.utc),
        is_held_by_me=False,
    )


@pytest.mark.asyncio
async def test_paginates_and_reports_total():
    repo = InMemoryLotRepository()
    for i in range(3):
        await repo.upsert_lot(_lot(f"L{i}"))
    res = await SearchSpecialHold(repo).execute(_CFG, page=1, page_size=2)
    assert res.total == 3 and len(res.rows) == 2 and res.page == 1 and res.page_size == 2


@pytest.mark.asyncio
async def test_page_and_size_are_clamped():
    res = await SearchSpecialHold(InMemoryLotRepository()).execute(_CFG, page=0, page_size=99999)
    assert res.page == 1
    assert res.page_size == SearchSpecialHold.MAX_PAGE_SIZE


@pytest.mark.asyncio
async def test_invalid_config_raises():
    with pytest.raises(KeywordError):
        await SearchSpecialHold(InMemoryLotRepository()).execute({"groups": "bad"})
