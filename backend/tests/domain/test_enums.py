from __future__ import annotations

import pytest

from app.domain.lot import LotStatus
from app.domain.session import AuthLevel


def test_lot_status_values_are_closed_set():
    assert set(LotStatus) == {LotStatus.RUN, LotStatus.WAIT, LotStatus.HOLD}
    assert {s.value for s in LotStatus} == {"run", "wait", "hold"}


def test_lot_status_invalid_value_raises():
    with pytest.raises(ValueError):
        LotStatus("review")  # 명시적으로 closed set 외 값은 거부


def test_auth_level_values_are_closed_set():
    assert set(AuthLevel) == {AuthLevel.ENGINEER, AuthLevel.ADMIN}
    assert {s.value for s in AuthLevel} == {"ENGINEER", "ADMIN"}


def test_auth_level_invalid_value_raises():
    with pytest.raises(ValueError):
        AuthLevel("OPERATOR")
