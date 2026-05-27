from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.adapters.fake.lot_repository import InMemoryLotRepository
from app.adapters.fake.lot_source import InMemoryLotSource
from app.adapters.fake.unit_of_work import InMemoryUnitOfWork
from app.ports.dto import LotRowDTO
from app.usecases.fetch_my_holds import FetchMyHolds


def _make_uc() -> tuple[FetchMyHolds, InMemoryLotSource, InMemoryLotRepository]:
    source = InMemoryLotSource()
    repo = InMemoryLotRepository()
    uow = InMemoryUnitOfWork()
    return FetchMyHolds(source=source, repo=repo, uow=uow), source, repo


@pytest.mark.asyncio
async def test_first_call_fetches_from_source():
    uc, _, _ = _make_uc()
    rows = await uc.execute("99999")
    assert len(rows) == 3


@pytest.mark.asyncio
async def test_second_call_hits_cache():
    uc, _, repo = _make_uc()
    await uc.execute("99999")  # primes cache
    cached_before = await repo.get_my_holds_cached("99999")
    assert cached_before is not None and len(cached_before) == 3
    # second call returns from cache (no source roundtrip needed)
    rows2 = await uc.execute("99999")
    assert len(rows2) == 3


@pytest.mark.asyncio
async def test_force_refresh_bypasses_cache():
    uc, _, repo = _make_uc()
    # Prime cache with a stale value
    stale = [
        LotRowDTO(
            lot_id="STALE",
            status="hold",
            equipment=None,
            process_step=None,
            hold_comment=None,
            updated_at=datetime.now(tz=timezone.utc),
            is_held_by_me=True,
        )
    ]
    await repo.cache_my_holds("99999", stale)
    # force_refresh should NOT return the stale value
    rows = await uc.execute("99999", force_refresh=True)
    assert "STALE" not in {r.lot_id for r in rows}


@pytest.mark.asyncio
async def test_unknown_employee_returns_empty():
    uc, _, _ = _make_uc()
    rows = await uc.execute("00000")
    assert rows == []
