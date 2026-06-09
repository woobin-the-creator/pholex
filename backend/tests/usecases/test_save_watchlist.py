from __future__ import annotations

import pytest

from app.adapters.fake.lot_watchlist_repository import InMemoryLotWatchlistRepository
from app.adapters.fake.unit_of_work import InMemoryUnitOfWork
from app.usecases.save_watchlist import SaveWatchlist


def _make_uc() -> tuple[SaveWatchlist, InMemoryLotWatchlistRepository]:
    repo = InMemoryLotWatchlistRepository()
    return SaveWatchlist(repo=repo, uow=InMemoryUnitOfWork()), repo


@pytest.mark.asyncio
async def test_save_persists_in_input_order():
    uc, repo = _make_uc()
    saved = await uc.execute("99999", ["L3", "L1", "L2"])
    assert saved == ["L3", "L1", "L2"]
    assert await repo.get("99999") == ["L3", "L1", "L2"]


@pytest.mark.asyncio
async def test_save_drops_empty_and_whitespace_and_trims():
    uc, repo = _make_uc()
    saved = await uc.execute("99999", ["L1", "  ", "", " L2 "])
    assert saved == ["L1", "L2"]
    assert await repo.get("99999") == ["L1", "L2"]


@pytest.mark.asyncio
async def test_save_dedupes_keeping_first_position():
    uc, repo = _make_uc()
    saved = await uc.execute("99999", ["L1", "L2", "L1", "L3", "L2"])
    assert saved == ["L1", "L2", "L3"]


@pytest.mark.asyncio
async def test_save_is_full_replace():
    uc, repo = _make_uc()
    await uc.execute("99999", ["L1", "L2"])
    await uc.execute("99999", ["L3"])
    assert await repo.get("99999") == ["L3"]


@pytest.mark.asyncio
async def test_save_empty_clears():
    uc, repo = _make_uc()
    await uc.execute("99999", ["L1"])
    saved = await uc.execute("99999", [])
    assert saved == []
    assert await repo.get("99999") == []


@pytest.mark.asyncio
async def test_save_isolated_per_employee():
    uc, repo = _make_uc()
    await uc.execute("99999", ["L1"])
    await uc.execute("88888", ["L2"])
    assert await repo.get("99999") == ["L1"]
    assert await repo.get("88888") == ["L2"]
