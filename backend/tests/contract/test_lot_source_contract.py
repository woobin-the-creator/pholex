from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest

from app.ports.dto import LotChangeEventDTO, LotRowDTO


@pytest.mark.asyncio
async def test_fetch_returns_list_of_dto(lot_source):
    rows = await lot_source.fetch_my_holds("99999")
    assert isinstance(rows, list)
    assert all(isinstance(r, LotRowDTO) for r in rows)
    assert len(rows) > 0  # golden dataset 보장


@pytest.mark.asyncio
async def test_fetch_only_returns_hold_status(lot_source):
    rows = await lot_source.fetch_my_holds("99999")
    assert all(r.status == "Hold" for r in rows)  # raw 값 그대로


@pytest.mark.asyncio
async def test_golden_oracle_exact_counts(lot_source):
    """Golden oracle: 99999는 정확히 3 holds, 88888은 1 hold (합성 행이 섞여도 불변)."""
    assert len(await lot_source.fetch_my_holds("99999")) == 3
    assert len(await lot_source.fetch_my_holds("88888")) == 1


@pytest.mark.asyncio
async def test_fetch_filters_other_employees(lot_source):
    """Cross-employee contamination: 88888의 hold가 99999 결과에 섞이면 안 됨."""
    rows_99999 = await lot_source.fetch_my_holds("99999")
    rows_88888 = await lot_source.fetch_my_holds("88888")
    assert all(r.is_held_by_me for r in rows_99999)
    assert all(r.is_held_by_me for r in rows_88888)
    ids_99999 = {r.lot_id for r in rows_99999}
    ids_88888 = {r.lot_id for r in rows_88888}
    assert ids_99999.isdisjoint(ids_88888), "lot_id가 두 사번 결과에 모두 나타나면 안 됨"


@pytest.mark.asyncio
async def test_hold_operator_id_is_the_queried_employee(lot_source):
    """fetch_my_holds(X)는 lot_hold_user_id == X 로 거르므로, 모든 row의
    hold_operator_id는 채워져 있고 조회 사번과 같아야 한다 (real adapter도 동일 계약)."""
    rows = await lot_source.fetch_my_holds("99999")
    assert len(rows) > 0
    assert all(r.hold_operator_id == "99999" for r in rows)
    assert all(r.hold_operator_id is not None for r in rows)


@pytest.mark.asyncio
async def test_unknown_employee_returns_empty(lot_source):
    """Empty trap: 미등록 사번은 빈 리스트, 등록 사번은 비어있지 않아야 함."""
    rows_known = await lot_source.fetch_my_holds("99999")
    rows_unknown = await lot_source.fetch_my_holds("00000")
    assert len(rows_known) > 0
    assert rows_unknown == []


@pytest.mark.asyncio
async def test_fetch_substantive_fields_populated(lot_source):
    """None trick: 모든 row에 모든 nullable 필드가 None이면 안 됨 (실제 데이터 검증)."""
    rows = await lot_source.fetch_my_holds("99999")
    assert any(r.equipment is not None for r in rows), "최소 한 row는 equipment 채워야 함"
    assert any(r.hold_comment is not None for r in rows), "최소 한 row는 hold_comment 채워야 함"
    assert any(r.process_step is not None for r in rows), "최소 한 row는 process_step 채워야 함"


@pytest.mark.asyncio
async def test_fetch_ordering_deterministic(lot_source):
    r1 = await lot_source.fetch_my_holds("99999")
    r2 = await lot_source.fetch_my_holds("99999")
    assert [x.lot_id for x in r1] == [x.lot_id for x in r2]


@pytest.mark.asyncio
async def test_fetch_idempotent(lot_source):
    r1 = await lot_source.fetch_my_holds("99999")
    r2 = await lot_source.fetch_my_holds("99999")
    assert r1 == r2


@pytest.mark.asyncio
async def test_subscribe_multi_subscriber_fanout(lot_source):
    """동시 두 구독자에게 같은 이벤트가 fan-out으로 전달되어야 함."""
    if not hasattr(lot_source, "emit"):
        pytest.skip("Real adapter는 emit 헬퍼가 없으므로 별도 테스트 방식 필요")

    sub_a = lot_source.subscribe_changes("99999").__aiter__()
    sub_b = lot_source.subscribe_changes("99999").__aiter__()

    event = LotChangeEventDTO(
        lot_id="LOT-TEST",
        change_type="status",
        previous_status="wait",
        new_status="hold",
        new_hold_comment=None,
        occurred_at=datetime.now(tz=timezone.utc),
        event_id="01TEST",
    )
    await lot_source.emit("99999", event)

    e_a = await asyncio.wait_for(sub_a.__anext__(), timeout=1.0)
    e_b = await asyncio.wait_for(sub_b.__anext__(), timeout=1.0)
    assert e_a.lot_id == "LOT-TEST"
    assert e_b.lot_id == "LOT-TEST"
    assert e_a == e_b
