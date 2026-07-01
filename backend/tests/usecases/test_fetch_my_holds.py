from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.adapters.fake.lot_repository import InMemoryLotRepository
from app.adapters.fake.lot_source import InMemoryLotSource
from app.adapters.fake.unit_of_work import InMemoryUnitOfWork
from app.ports.dto import HoldDTO, LotRowDTO
from app.usecases.fetch_my_holds import FetchMyHolds

# [Phase 2] 매칭 키 = AD id. gd01.hong은 2 lot / 3 hold (golden dataset).
_VIEWER = "gd01.hong"


def _make_uc() -> tuple[FetchMyHolds, InMemoryLotSource, InMemoryLotRepository]:
    source = InMemoryLotSource()
    repo = InMemoryLotRepository()
    uow = InMemoryUnitOfWork()
    return FetchMyHolds(source=source, repo=repo, uow=uow), source, repo


@pytest.mark.asyncio
async def test_first_call_fetches_from_source():
    uc, _, _ = _make_uc()
    result = await uc.execute(_VIEWER)
    assert len(result.rows) == 2  # lot 단위 2행
    assert sum(len(r.my_holds) for r in result.rows) == 3  # hold 3건


@pytest.mark.asyncio
async def test_second_call_hits_cache():
    uc, _, repo = _make_uc()
    await uc.execute(_VIEWER)  # primes cache
    cached_before = await repo.get_my_holds_cached(_VIEWER)
    assert cached_before is not None and len(cached_before) == 2
    # second call returns from cache (no source roundtrip needed)
    result2 = await uc.execute(_VIEWER)
    assert len(result2.rows) == 2


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
            updated_at=datetime.now(tz=timezone.utc),
            my_holds=[HoldDTO(operator_ad_id=_VIEWER)],
        )
    ]
    await repo.cache_my_holds(_VIEWER, stale)
    # force_refresh should NOT return the stale value
    result = await uc.execute(_VIEWER, force_refresh=True)
    assert "STALE" not in {r.lot_id for r in result.rows}


@pytest.mark.asyncio
async def test_unknown_operator_returns_empty():
    uc, _, _ = _make_uc()
    result = await uc.execute("nobody.here")
    assert result.rows == []


@pytest.mark.asyncio
async def test_last_run_at_none_when_dump_never_ran():
    uc, _, _ = _make_uc()
    result = await uc.execute(_VIEWER)
    assert result.last_run_at is None


@pytest.mark.asyncio
async def test_last_run_at_returned_on_cache_hit_and_miss():
    # last_run_at은 캐시 hit/miss·force_refresh 무관하게 항상 repo에서 읽혀야 한다.
    uc, _, repo = _make_uc()
    ts = datetime(2026, 6, 17, 9, 0, 0, tzinfo=timezone.utc)
    repo.set_dump_last_run_at(ts)

    miss = await uc.execute(_VIEWER)  # cache miss → source
    assert miss.last_run_at == ts

    hit = await uc.execute(_VIEWER)  # cache hit
    assert hit.last_run_at == ts

    forced = await uc.execute(_VIEWER, force_refresh=True)
    assert forced.last_run_at == ts


@pytest.mark.asyncio
async def test_empty_holds_does_not_call_batch_ops(monkeypatch):
    # hold 0건이면 upsert_lots_batch/cache_my_holds 를 호출하면 안 된다.
    # real 어댑터에서 빈 INSERT VALUES 가 lot_id NOT NULL 위반(500)을 냈던 회귀 방지.
    # (fake 어댑터는 인메모리라 이 SQL 함정이 없어 test_unknown_employee_returns_empty 로는 못 잡힌다.)
    uc, _, repo = _make_uc()
    called = {"upsert": 0, "cache": 0}
    orig_upsert, orig_cache = repo.upsert_lots_batch, repo.cache_my_holds

    async def spy_upsert(rows):
        called["upsert"] += 1
        return await orig_upsert(rows)

    async def spy_cache(employee_number, rows):
        called["cache"] += 1
        return await orig_cache(employee_number, rows)

    monkeypatch.setattr(repo, "upsert_lots_batch", spy_upsert)
    monkeypatch.setattr(repo, "cache_my_holds", spy_cache)

    result = await uc.execute("00000")  # 없는 사번 → source 가 [] 반환

    assert result.rows == []
    assert called["upsert"] == 0
    assert called["cache"] == 0
