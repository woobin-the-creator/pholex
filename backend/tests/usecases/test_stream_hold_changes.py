from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from app.adapters.fake.lot_repository import InMemoryLotRepository
from app.adapters.fake.lot_source import InMemoryLotSource
from app.ports.dto import LotChangeEventDTO
from app.usecases.stream_hold_changes import StreamHoldChanges


def _ev(**kwargs) -> LotChangeEventDTO:
    base = dict(
        lot_id="LOT-1",
        change_type="status",
        previous_status="PreActive",
        new_status="Hold",
        new_hold_comment=None,
        occurred_at=datetime.now(tz=timezone.utc),
        event_id="01TEST",
    )
    base.update(kwargs)
    return LotChangeEventDTO(**base)


def test_severity_status_to_hold_is_critical():
    ev = _ev(previous_status="PreActive", new_status="Hold")
    assert StreamHoldChanges._classify_severity(ev) == "critical"


def test_severity_hold_to_hold_is_info():
    """동일 Hold → Hold 전환은 critical 아님 (재진입 방지)."""
    ev = _ev(previous_status="Hold", new_status="Hold")
    assert StreamHoldChanges._classify_severity(ev) == "info"


def test_severity_active_to_preactive_is_warning():
    """실제 status 전환(→Hold 제외)은 warning (§7)."""
    ev = _ev(previous_status="Active", new_status="PreActive")
    assert StreamHoldChanges._classify_severity(ev) == "warning"


def test_severity_comment_change_is_info():
    ev = _ev(change_type="comment", previous_status=None, new_status=None, new_hold_comment="new")
    assert StreamHoldChanges._classify_severity(ev) == "info"


@pytest.mark.asyncio
async def test_stream_invalidates_cache_on_each_event():
    source = InMemoryLotSource()
    repo = InMemoryLotRepository()
    await repo.cache_my_holds("99999", [])  # prime
    assert await repo.get_my_holds_cached("99999") is not None

    uc = StreamHoldChanges(source=source, repo=repo)
    received: list = []

    async def consume():
        async for envelope in uc.execute("99999"):
            received.append(envelope)
            if len(received) >= 1:
                break

    consumer = asyncio.create_task(consume())
    await asyncio.sleep(0.05)
    await source.emit("99999", _ev())
    await asyncio.wait_for(consumer, timeout=2.0)

    # Cache was invalidated by the use case
    assert await repo.get_my_holds_cached("99999") is None
    assert received[0].severity == "critical"
