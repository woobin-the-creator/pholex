from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


# 키워드가 매칭될 수 있는 lot_status 컬럼.
#  - TEXT_FIELDS: 대소문자 무시 substring (ILIKE %값%)
#  - EXACT_FIELDS: 정확히 일치 (status는 열린 집합이라 substring이면 Active가 PreActive를 오매칭)
TEXT_FIELDS: frozenset[str] = frozenset({"equipment", "process_step", "hold_comment", "lot_id"})
EXACT_FIELDS: frozenset[str] = frozenset({"status"})
ALLOWED_FIELDS: frozenset[str] = TEXT_FIELDS | EXACT_FIELDS


class KeywordError(ValueError):
    """키워드 조건/쿼리 검증 실패."""


@dataclass(frozen=True, slots=True)
class KeywordCondition:
    """단일 키워드 = (필드, 값).

    text 필드는 대소문자 무시 substring, status는 정확히 일치. value는 생성 시 trim되고
    빈 값은 거부된다(frozen이라 object.__setattr__로 정규화 값 주입).
    """

    field: str
    value: str

    def __post_init__(self) -> None:
        if self.field not in ALLOWED_FIELDS:
            raise KeywordError(f"unknown field: {self.field!r}")
        trimmed = self.value.strip()
        if not trimmed:
            raise KeywordError("keyword value must be non-empty after trim")
        object.__setattr__(self, "value", trimmed)

    @property
    def is_exact(self) -> bool:
        return self.field in EXACT_FIELDS

    def matches(self, fields: Mapping[str, str | None]) -> bool:
        haystack = fields.get(self.field)
        if haystack is None:
            return False
        if self.is_exact:
            return haystack == self.value
        return self.value.casefold() in haystack.casefold()


@dataclass(frozen=True, slots=True)
class KeywordGroup:
    """AND 로 묶인 조건들. 빈 그룹은 허용 안 함."""

    conditions: tuple[KeywordCondition, ...]

    def __post_init__(self) -> None:
        if not self.conditions:
            raise KeywordError("group must have at least one condition")

    def matches(self, fields: Mapping[str, str | None]) -> bool:
        return all(c.matches(fields) for c in self.conditions)


@dataclass(frozen=True, slots=True)
class KeywordQuery:
    """DNF — 그룹들의 OR. 빈 쿼리(그룹 0개)는 아무것도 매칭하지 않는다."""

    groups: tuple[KeywordGroup, ...]

    @property
    def is_empty(self) -> bool:
        return not self.groups

    def matches(self, fields: Mapping[str, str | None]) -> bool:
        return any(g.matches(fields) for g in self.groups)

    def matched_groups(self, fields: Mapping[str, str | None]) -> list[int]:
        """매칭된 그룹 인덱스 — v2 '행별 매칭 배지'용 공짜 보험.

        그룹 predicate를 개별 접근 가능하게 유지하는 구조적 약속의 산물이다.
        """
        return [i for i, g in enumerate(self.groups) if g.matches(fields)]


def query_to_config(query: KeywordQuery) -> dict:
    """KeywordQuery → JSONB config dict (keyword_presets.config)."""
    return {
        "groups": [
            {"conditions": [{"field": c.field, "value": c.value} for c in g.conditions]}
            for g in query.groups
        ]
    }


def query_from_config(config: Mapping) -> KeywordQuery:
    """JSONB config dict → KeywordQuery (검증 + 값 정규화). 잘못된 모양이면 KeywordError."""
    if not isinstance(config, Mapping):
        raise KeywordError("config must be an object")
    raw_groups = config.get("groups", [])
    if not isinstance(raw_groups, list):
        raise KeywordError("config.groups must be a list")
    groups: list[KeywordGroup] = []
    for rg in raw_groups:
        raw_conds = rg.get("conditions") if isinstance(rg, Mapping) else None
        if not isinstance(raw_conds, list):
            raise KeywordError("group.conditions must be a list")
        conds: list[KeywordCondition] = []
        for rc in raw_conds:
            if not (isinstance(rc, Mapping) and "field" in rc and "value" in rc):
                raise KeywordError("condition must have field and value")
            conds.append(KeywordCondition(field=rc["field"], value=rc["value"]))
        groups.append(KeywordGroup(conditions=tuple(conds)))
    return KeywordQuery(groups=tuple(groups))
