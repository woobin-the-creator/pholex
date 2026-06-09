from __future__ import annotations

import pytest

from datetime import datetime, timezone

from app.domain.lot import KNOWN_STATUSES, LotStatus
from app.domain.session import AuthLevel
from app.ports.dto import LotRowDTO


def test_lot_status_known_raw_values():
    # 검증용 closed set이 아니라 "현재 아는 raw 값" 상수 모음.
    assert {s.value for s in LotStatus} == {"Active", "Hold", "PreActive"}
    assert KNOWN_STATUSES == {"Active", "Hold", "PreActive"}


def test_lot_status_hold_anchor():
    # 슬롯[1] hold 판정의 단일 앵커 — source 필터·KPI·severity가 공유한다.
    assert LotStatus.HOLD == "Hold"


def test_status_is_open_set_at_dto():
    # status는 열린 집합 — 알려지지 않은 raw 값도 변환·드랍 없이 그대로 받는다.
    row = LotRowDTO(
        lot_id="L1",
        status="SomeFutureMesValue",
        updated_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        is_held_by_me=False,
    )
    assert row.status == "SomeFutureMesValue"


def test_auth_level_values_are_closed_set():
    assert set(AuthLevel) == {AuthLevel.ENGINEER, AuthLevel.ADMIN}
    assert {s.value for s in AuthLevel} == {"ENGINEER", "ADMIN"}


def test_auth_level_invalid_value_raises():
    with pytest.raises(ValueError):
        AuthLevel("OPERATOR")
