from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_get_empty_returns_empty_list(lot_watchlist_repository):
    assert await lot_watchlist_repository.get("99999") == []


@pytest.mark.asyncio
async def test_save_and_get_preserves_order(lot_watchlist_repository):
    await lot_watchlist_repository.save("99999", ["L3", "L1", "L2"])
    assert await lot_watchlist_repository.get("99999") == ["L3", "L1", "L2"]


@pytest.mark.asyncio
async def test_save_is_full_replace(lot_watchlist_repository):
    await lot_watchlist_repository.save("99999", ["L1", "L2"])
    await lot_watchlist_repository.save("99999", ["L9"])
    assert await lot_watchlist_repository.get("99999") == ["L9"]


@pytest.mark.asyncio
async def test_save_empty_clears(lot_watchlist_repository):
    await lot_watchlist_repository.save("99999", ["L1"])
    await lot_watchlist_repository.save("99999", [])
    assert await lot_watchlist_repository.get("99999") == []


@pytest.mark.asyncio
async def test_isolated_per_employee(lot_watchlist_repository):
    await lot_watchlist_repository.save("99999", ["L1"])
    await lot_watchlist_repository.save("88888", ["L2"])
    assert await lot_watchlist_repository.get("99999") == ["L1"]
    assert await lot_watchlist_repository.get("88888") == ["L2"]
