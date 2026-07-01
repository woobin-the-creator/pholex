from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from app.ports.dto import LotChangeEventDTO, LotRowDTO

# [Phase 2] 매칭 키 = AD id(operator_ad_id). golden dataset 오라클:
#   gd01.hong → 2 lot(LOT-A2948·LOT-B1175), 3 hold (LOT-A2948에 2건, LOT-B1175에 1건)
#   pk02.kim  → LOT-A2948에 1건 (gd01.hong 결과에 섞이면 안 됨)
_VIEWER = "gd01.hong"
_OTHER = "pk02.kim"


@pytest.mark.asyncio
async def test_fetch_returns_list_of_dto(lot_source):
    rows = await lot_source.fetch_my_holds(_VIEWER)
    assert isinstance(rows, list)
    assert all(isinstance(r, LotRowDTO) for r in rows)
    assert len(rows) > 0  # golden dataset 보장


@pytest.mark.asyncio
async def test_fetch_only_returns_hold_status(lot_source):
    rows = await lot_source.fetch_my_holds(_VIEWER)
    assert all(r.status == "Hold" for r in rows)  # raw 값 그대로


@pytest.mark.asyncio
async def test_golden_oracle_lot_and_hold_counts(lot_source):
    """gd01.hong은 2 lot / 3 hold. lot 단위 1행, my_holds에 hold가 집계된다."""
    rows = await lot_source.fetch_my_holds(_VIEWER)
    assert len(rows) == 2  # lot 단위 행
    total_holds = sum(len(r.my_holds) for r in rows)
    assert total_holds == 3  # LOT-A2948 2건 + LOT-B1175 1건


@pytest.mark.asyncio
async def test_one_to_many_same_operator_same_lot(lot_source):
    """1:N 핵심 — 같은 담당자가 한 lot에 다른 사유로 여러 hold를 걸면 my_holds에 다 담긴다."""
    rows = await lot_source.fetch_my_holds(_VIEWER)
    by_lot = {r.lot_id: r for r in rows}
    lot_a = by_lot["LOT-A2948"]
    assert len(lot_a.my_holds) == 2
    # 같은 담당자, 다른 사유(item_type/comment).
    assert all(h.operator_ad_id == _VIEWER for h in lot_a.my_holds)
    assert {h.item_type for h in lot_a.my_holds} == {"USER", "SPC"}


@pytest.mark.asyncio
async def test_fetch_filters_other_operators(lot_source):
    """Cross-contamination — pk02.kim의 LOT-A2948 hold가 gd01.hong의 my_holds에 섞이면 안 됨."""
    rows = await lot_source.fetch_my_holds(_VIEWER)
    all_holds = [h for r in rows for h in r.my_holds]
    assert all(h.operator_ad_id == _VIEWER for h in all_holds)
    assert all(h.operator_ad_id != _OTHER for h in all_holds)


@pytest.mark.asyncio
async def test_other_operator_sees_only_own_hold(lot_source):
    """pk02.kim은 LOT-A2948에 1건만 (같은 lot이라도 남의 hold는 안 보임)."""
    rows = await lot_source.fetch_my_holds(_OTHER)
    assert len(rows) == 1
    lot_a = rows[0]
    assert lot_a.lot_id == "LOT-A2948"
    assert len(lot_a.my_holds) == 1
    assert lot_a.my_holds[0].operator_ad_id == _OTHER


@pytest.mark.asyncio
async def test_my_holds_all_belong_to_queried_operator(lot_source):
    """fetch_my_holds(X)의 모든 hold는 operator_ad_id == X (real adapter도 동일 계약)."""
    rows = await lot_source.fetch_my_holds(_VIEWER)
    all_holds = [h for r in rows for h in r.my_holds]
    assert len(all_holds) > 0
    assert all(h.operator_ad_id == _VIEWER for h in all_holds)


@pytest.mark.asyncio
async def test_unknown_operator_returns_empty(lot_source):
    """Empty trap: 미등록 AD id는 빈 리스트, 등록 AD id는 비어있지 않아야 함."""
    rows_known = await lot_source.fetch_my_holds(_VIEWER)
    rows_unknown = await lot_source.fetch_my_holds("nobody.here")
    assert len(rows_known) > 0
    assert rows_unknown == []


@pytest.mark.asyncio
async def test_fetch_substantive_fields_populated(lot_source):
    """None trick: 실제 데이터가 채워졌는지 (모두 None이면 안 됨)."""
    rows = await lot_source.fetch_my_holds(_VIEWER)
    all_holds = [h for r in rows for h in r.my_holds]
    assert any(r.process_step is not None for r in rows), "최소 한 lot은 process_step 채워야 함"
    assert any(h.comment is not None for h in all_holds), "최소 한 hold는 comment 채워야 함"
    assert any(h.operator_name is not None for h in all_holds), "최소 한 hold는 operator_name 채워야 함"


@pytest.mark.asyncio
async def test_fetch_ordering_deterministic(lot_source):
    r1 = await lot_source.fetch_my_holds(_VIEWER)
    r2 = await lot_source.fetch_my_holds(_VIEWER)
    assert [x.lot_id for x in r1] == [x.lot_id for x in r2]
    assert [x.lot_id for x in r1] == sorted(x.lot_id for x in r1)  # lot_id ASC


@pytest.mark.asyncio
async def test_fetch_idempotent(lot_source):
    r1 = await lot_source.fetch_my_holds(_VIEWER)
    r2 = await lot_source.fetch_my_holds(_VIEWER)
    assert r1 == r2


@pytest.mark.asyncio
async def test_subscribe_multi_subscriber_fanout(lot_source):
    """동시 두 구독자에게 같은 이벤트가 fan-out으로 전달되어야 함."""
    if not hasattr(lot_source, "emit"):
        pytest.skip("Real adapter는 emit 헬퍼가 없으므로 별도 테스트 방식 필요")

    sub_a = lot_source.subscribe_changes(_VIEWER).__aiter__()
    sub_b = lot_source.subscribe_changes(_VIEWER).__aiter__()

    event = LotChangeEventDTO(
        lot_id="LOT-TEST",
        change_type="status",
        previous_status="wait",
        new_status="hold",
        new_hold_comment=None,
        occurred_at=datetime.now(tz=timezone.utc),
        event_id="01TEST",
    )
    await lot_source.emit(_VIEWER, event)

    e_a = await asyncio.wait_for(sub_a.__anext__(), timeout=1.0)
    e_b = await asyncio.wait_for(sub_b.__anext__(), timeout=1.0)
    assert e_a.lot_id == "LOT-TEST"
    assert e_b.lot_id == "LOT-TEST"
    assert e_a == e_b
