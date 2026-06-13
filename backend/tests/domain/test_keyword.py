from __future__ import annotations

import pytest

from app.domain.keyword import (
    KeywordCondition,
    KeywordError,
    KeywordGroup,
    KeywordQuery,
    query_from_config,
    query_to_config,
)


def _fields(**kw) -> dict[str, str | None]:
    base = {
        "lot_id": None,
        "status": None,
        "equipment": None,
        "process_step": None,
        "hold_comment": None,
    }
    base.update(kw)
    return base


def test_condition_trims_value():
    assert KeywordCondition(field="equipment", value="  ETCH  ").value == "ETCH"


def test_condition_rejects_empty_after_trim():
    with pytest.raises(KeywordError):
        KeywordCondition(field="equipment", value="   ")


def test_condition_rejects_unknown_field():
    with pytest.raises(KeywordError):
        KeywordCondition(field="nope", value="x")


def test_text_field_is_case_insensitive_substring():
    c = KeywordCondition(field="hold_comment", value="spc")
    assert c.matches(_fields(hold_comment="SPC limit exceeded")) is True
    assert c.matches(_fields(hold_comment="nothing here")) is False
    assert c.matches(_fields(hold_comment=None)) is False


def test_status_is_exact_not_substring():
    # 핵심 함정: substring이면 'Active'가 'PreActive'를 오매칭 → exact여야 한다
    c = KeywordCondition(field="status", value="Active")
    assert c.matches(_fields(status="Active")) is True
    assert c.matches(_fields(status="PreActive")) is False


def test_group_is_and():
    g = KeywordGroup(
        conditions=(
            KeywordCondition(field="equipment", value="ETCH"),
            KeywordCondition(field="status", value="Hold"),
        )
    )
    assert g.matches(_fields(equipment="ETCH-01", status="Hold")) is True
    assert g.matches(_fields(equipment="ETCH-01", status="Active")) is False


def test_empty_group_rejected():
    with pytest.raises(KeywordError):
        KeywordGroup(conditions=())


def test_query_is_or_of_groups():
    q = KeywordQuery(
        groups=(
            KeywordGroup(conditions=(KeywordCondition(field="equipment", value="ETCH"),)),
            KeywordGroup(conditions=(KeywordCondition(field="process_step", value="PHOTO"),)),
        )
    )
    assert q.matches(_fields(equipment="ETCH-01")) is True
    assert q.matches(_fields(process_step="PHOTO-2")) is True
    assert q.matches(_fields(equipment="CVD", process_step="ETCH")) is False


def test_empty_query_matches_nothing():
    q = KeywordQuery(groups=())
    assert q.is_empty is True
    assert q.matches(_fields(equipment="ETCH")) is False


def test_matched_groups_returns_indices():
    q = KeywordQuery(
        groups=(
            KeywordGroup(conditions=(KeywordCondition(field="equipment", value="ETCH"),)),
            KeywordGroup(conditions=(KeywordCondition(field="status", value="Hold"),)),
        )
    )
    assert q.matched_groups(_fields(equipment="ETCH-1", status="Hold")) == [0, 1]
    assert q.matched_groups(_fields(equipment="ETCH-1", status="Active")) == [0]


def test_config_roundtrip_normalizes_values():
    config = {"groups": [{"conditions": [{"field": "equipment", "value": "  ETCH "}]}]}
    q = query_from_config(config)
    assert query_to_config(q) == {
        "groups": [{"conditions": [{"field": "equipment", "value": "ETCH"}]}]
    }


def test_config_rejects_bad_shapes():
    with pytest.raises(KeywordError):
        query_from_config({"groups": "nope"})
    with pytest.raises(KeywordError):
        query_from_config({"groups": [{"conditions": [{"field": "equipment"}]}]})  # no value
    with pytest.raises(KeywordError):
        query_from_config({"groups": [{"conditions": []}]})  # empty group
