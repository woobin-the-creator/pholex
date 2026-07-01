from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.adapters.fake.lot_repository import InMemoryLotRepository
from app.adapters.fake.lot_watchlist_repository import InMemoryLotWatchlistRepository
from app.ports.dto import LotRowDTO
from app.usecases.get_watchlist import GetWatchlist


def _lot(lot_id: str, status: str = "run") -> LotRowDTO:
    return LotRowDTO(
        lot_id=lot_id,
        status=status,
        equipment="EQ",
        process_step="step",
        updated_at=datetime.now(tz=timezone.utc),
        my_holds=[],
    )


def _make_uc() -> tuple[GetWatchlist, InMemoryLotWatchlistRepository, InMemoryLotRepository]:
    wl = InMemoryLotWatchlistRepository()
    lots = InMemoryLotRepository()
    return GetWatchlist(watchlist=wl, lots=lots), wl, lots


@pytest.mark.asyncio
async def test_empty_watchlist_returns_empty():
    uc, _, _ = _make_uc()
    assert await uc.execute("99999") == []


@pytest.mark.asyncio
async def test_joins_lot_data_and_preserves_order():
    uc, wl, lots = _make_uc()
    await lots.upsert_lot(_lot("L1", "hold"))
    await lots.upsert_lot(_lot("L2", "run"))
    await wl.save("99999", ["L2", "L1"])
    rows = await uc.execute("99999")
    assert [r.lot_id for r in rows] == ["L2", "L1"]
    assert all(r.found for r in rows)
    # L1 is the second row and is in hold
    assert rows[1].lot_id == "L1"
    assert rows[1].status == "hold"


@pytest.mark.asyncio
async def test_unknown_lot_marked_pending():
    uc, wl, lots = _make_uc()
    await lots.upsert_lot(_lot("L1"))
    await wl.save("99999", ["L1", "L-NOTYET"])
    rows = await uc.execute("99999")
    assert rows[0].found is True
    pending = rows[1]
    assert pending.lot_id == "L-NOTYET"
    assert pending.found is False
    assert pending.status is None
    assert pending.updated_at is None
