from __future__ import annotations

from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from app.ports.dto import LotChangeEventDTO, LotRowDTO


def _base_row(**overrides):
    payload = dict(
        lot_id="L001",
        status="Hold",
        equipment=None,
        process_step=None,
        hold_comment=None,
        updated_at=datetime.now(tz=timezone.utc),
        is_held_by_me=True,
    )
    payload.update(overrides)
    return payload


def test_lot_row_dto_rejects_extra_field():
    with pytest.raises(ValidationError):
        LotRowDTO(**_base_row(), extra_field="x")  # type: ignore[call-arg]


def test_lot_row_dto_rejects_naive_datetime():
    naive = datetime.now()  # tz-naive
    with pytest.raises(ValidationError) as exc_info:
        LotRowDTO(**_base_row(updated_at=naive))
    assert "timezone-aware" in str(exc_info.value).lower() or "naive" in str(exc_info.value).lower()


def test_lot_row_dto_is_frozen():
    row = LotRowDTO(**_base_row())
    with pytest.raises(ValidationError):
        row.lot_id = "L999"  # type: ignore[misc]


def test_lot_row_dto_accepts_arbitrary_status():
    # status는 열린 집합 — 사내 MES의 새 raw 값을 변환·드랍 없이 그대로 받는다.
    # (closed Literal이던 시절엔 reject했지만, unknown→wait 위조를 막기 위해 개방함)
    row = LotRowDTO(**_base_row(status="SomeNewMesValue"))
    assert row.status == "SomeNewMesValue"
    assert LotRowDTO(**_base_row(status="PreActive")).status == "PreActive"


def test_change_event_dto_rejects_naive_datetime():
    with pytest.raises(ValidationError):
        LotChangeEventDTO(
            lot_id="L001",
            change_type="status",
            previous_status="wait",
            new_status="hold",
            new_hold_comment=None,
            occurred_at=datetime.now(),  # tz-naive
            event_id="01ABC",
        )


def test_change_event_dto_rejects_invalid_change_type():
    with pytest.raises(ValidationError):
        LotChangeEventDTO(
            lot_id="L001",
            change_type="renamed",  # not in literal
            previous_status="wait",
            new_status="hold",
            new_hold_comment=None,
            occurred_at=datetime.now(tz=timezone.utc),
            event_id="01ABC",
        )
