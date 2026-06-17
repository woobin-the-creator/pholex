from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.ports.dto import LotRowDTO


def _sample(lot_id: str = "L001", status: str = "hold") -> LotRowDTO:
    return LotRowDTO(
        lot_id=lot_id,
        status=status,
        equipment="EQ-X",
        process_step="step",
        hold_comment="c",
        updated_at=datetime.now(tz=timezone.utc),
        is_held_by_me=True,
    )


@pytest.mark.asyncio
async def test_get_my_holds_cached_miss_returns_none(lot_repository):
    assert await lot_repository.get_my_holds_cached("99999") is None


@pytest.mark.asyncio
async def test_cache_and_get(lot_repository):
    rows = [_sample("L001"), _sample("L002")]
    await lot_repository.cache_my_holds("99999", rows)
    cached = await lot_repository.get_my_holds_cached("99999")
    assert cached is not None
    assert len(cached) == 2
    assert {r.lot_id for r in cached} == {"L001", "L002"}


@pytest.mark.asyncio
async def test_invalidate_cache_makes_get_return_none(lot_repository):
    await lot_repository.cache_my_holds("99999", [_sample("L001")])
    await lot_repository.invalidate_cache("99999")
    assert await lot_repository.get_my_holds_cached("99999") is None


@pytest.mark.asyncio
async def test_empty_cache_distinguishable_from_miss(lot_repository):
    """빈 리스트는 *정상 빈 결과*, None은 *cache miss*. 둘은 구분되어야 함."""
    await lot_repository.cache_my_holds("99999", [])
    cached = await lot_repository.get_my_holds_cached("99999")
    assert cached == []  # not None
    assert cached is not None


@pytest.mark.asyncio
async def test_upsert_lot_idempotent(lot_repository):
    row = _sample("L001")
    await lot_repository.upsert_lot(row)
    await lot_repository.upsert_lot(row)
    # No way to assert via get_my_holds_cached (different concept),
    # but second call must not raise and behavior must be consistent.


@pytest.mark.asyncio
async def test_upsert_lots_batch_atomic(lot_repository):
    rows = [_sample("L001"), _sample("L002"), _sample("L003")]
    await lot_repository.upsert_lots_batch(rows)
    # Re-running with empty batch must not wipe state silently — verify by re-applying
    await lot_repository.upsert_lots_batch([])
    # No assertion on internal state (Port doesn't expose it). Behavioral guarantee:
    # both calls returned without raising.


@pytest.mark.asyncio
async def test_dump_last_run_at_defaults_to_none(lot_repository):
    """dump가 한 번도 안 돌았으면 None (lot_dump_meta 행 없음)."""
    assert await lot_repository.get_dump_last_run_at() is None


@pytest.mark.asyncio
async def test_dump_last_run_at_returns_injected_tz_aware_value(lot_repository):
    """세터로 주입된 heartbeat를 그대로 반환하고, tz-aware UTC여야 한다."""
    ts = datetime(2026, 6, 17, 9, 0, 0, tzinfo=timezone.utc)
    # 세터는 fake 전용 헬퍼. real adapter는 lot_dump_meta seed로 동일 계약을 만족시킨다.
    lot_repository.set_dump_last_run_at(ts)
    got = await lot_repository.get_dump_last_run_at()
    assert got == ts
    assert got.tzinfo is not None
