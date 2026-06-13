from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.domain.keyword import KeywordCondition, KeywordGroup, KeywordQuery
from app.ports.dto import LotRowDTO

_BASE = datetime(2026, 6, 13, tzinfo=timezone.utc)


def _lot(
    lot_id: str,
    *,
    status: str = "Active",
    equipment: str | None = None,
    process_step: str | None = None,
    hold_comment: str | None = None,
    minutes: int = 0,
) -> LotRowDTO:
    return LotRowDTO(
        lot_id=lot_id,
        status=status,
        equipment=equipment,
        process_step=process_step,
        hold_comment=hold_comment,
        updated_at=_BASE + timedelta(minutes=minutes),
        is_held_by_me=False,
    )


def _q(*groups: list[tuple[str, str]]) -> KeywordQuery:
    return KeywordQuery(
        groups=tuple(
            KeywordGroup(conditions=tuple(KeywordCondition(field=f, value=v) for f, v in g))
            for g in groups
        )
    )


@pytest.mark.asyncio
async def test_empty_query_returns_nothing(lot_repository):
    await lot_repository.upsert_lot(_lot("L1", equipment="ETCH"))
    rows, total = await lot_repository.search(KeywordQuery(groups=()), limit=100, offset=0)
    assert rows == [] and total == 0


@pytest.mark.asyncio
async def test_substring_match_is_case_insensitive(lot_repository):
    await lot_repository.upsert_lot(_lot("L1", equipment="ETCH-01"))
    await lot_repository.upsert_lot(_lot("L2", equipment="CVD-02"))
    rows, total = await lot_repository.search(_q([("equipment", "etch")]), limit=100, offset=0)
    assert [r.lot_id for r in rows] == ["L1"] and total == 1


@pytest.mark.asyncio
async def test_status_is_exact(lot_repository):
    await lot_repository.upsert_lot(_lot("L1", status="Active"))
    await lot_repository.upsert_lot(_lot("L2", status="PreActive"))
    rows, _ = await lot_repository.search(_q([("status", "Active")]), limit=100, offset=0)
    assert [r.lot_id for r in rows] == ["L1"]


@pytest.mark.asyncio
async def test_and_within_group(lot_repository):
    await lot_repository.upsert_lot(_lot("L1", equipment="ETCH", status="Hold"))
    await lot_repository.upsert_lot(_lot("L2", equipment="ETCH", status="Active"))
    rows, _ = await lot_repository.search(
        _q([("equipment", "ETCH"), ("status", "Hold")]), limit=100, offset=0
    )
    assert [r.lot_id for r in rows] == ["L1"]


@pytest.mark.asyncio
async def test_or_across_groups_dedups_by_lot_id(lot_repository):
    await lot_repository.upsert_lot(_lot("L1", equipment="ETCH", status="Hold"))  # 두 그룹 모두 매칭
    await lot_repository.upsert_lot(_lot("L2", process_step="PHOTO"))
    rows, total = await lot_repository.search(
        _q([("equipment", "ETCH")], [("status", "Hold")], [("process_step", "PHOTO")]),
        limit=100,
        offset=0,
    )
    assert sorted(r.lot_id for r in rows) == ["L1", "L2"] and total == 2


@pytest.mark.asyncio
async def test_sort_updated_desc_then_lot_asc(lot_repository):
    await lot_repository.upsert_lot(_lot("B", equipment="X", minutes=10))
    await lot_repository.upsert_lot(_lot("A", equipment="X", minutes=10))  # 동률 → lot_id ASC
    await lot_repository.upsert_lot(_lot("C", equipment="X", minutes=20))  # 최신
    rows, _ = await lot_repository.search(_q([("equipment", "X")]), limit=100, offset=0)
    assert [r.lot_id for r in rows] == ["C", "A", "B"]


@pytest.mark.asyncio
async def test_pagination_offset_limit(lot_repository):
    for i in range(5):
        await lot_repository.upsert_lot(_lot(f"L{i}", equipment="X", minutes=i))
    page1, total = await lot_repository.search(_q([("equipment", "X")]), limit=2, offset=0)
    page2, _ = await lot_repository.search(_q([("equipment", "X")]), limit=2, offset=2)
    assert total == 5
    assert [r.lot_id for r in page1] == ["L4", "L3"]  # 최신순
    assert [r.lot_id for r in page2] == ["L2", "L1"]
