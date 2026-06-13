from __future__ import annotations

import copy
from datetime import datetime, timezone

from app.ports.dto import KeywordPresetDTO


class InMemoryKeywordPresetRepository:
    """Fake KeywordPresetRepository — id 자동증가 + 사번별 격리. config는 deepcopy 보관."""

    def __init__(self) -> None:
        self._by_id: dict[int, dict] = {}
        self._seq = 0

    def _next_id(self) -> int:
        self._seq += 1
        return self._seq

    def _to_dto(self, rec: dict) -> KeywordPresetDTO:
        return KeywordPresetDTO(
            id=rec["id"],
            name=rec["name"],
            config=copy.deepcopy(rec["config"]),
            is_default=rec["is_default"],
            created_at=rec["created_at"],
        )

    def _clear_defaults(self, employee_number: str) -> None:
        for rec in self._by_id.values():
            if rec["employee_number"] == employee_number:
                rec["is_default"] = False

    async def list_by_employee(self, employee_number: str) -> list[KeywordPresetDTO]:
        recs = [r for r in self._by_id.values() if r["employee_number"] == employee_number]
        recs.sort(key=lambda r: (r["created_at"], r["id"]))
        return [self._to_dto(r) for r in recs]

    async def get(self, employee_number: str, preset_id: int) -> KeywordPresetDTO | None:
        rec = self._by_id.get(preset_id)
        if rec is None or rec["employee_number"] != employee_number:
            return None
        return self._to_dto(rec)

    async def create(
        self, employee_number: str, name: str, config: dict, *, is_default: bool
    ) -> KeywordPresetDTO:
        if is_default:
            self._clear_defaults(employee_number)
        rec = {
            "id": self._next_id(),
            "employee_number": employee_number,
            "name": name,
            "config": copy.deepcopy(config),
            "is_default": is_default,
            "created_at": datetime.now(tz=timezone.utc),
        }
        self._by_id[rec["id"]] = rec
        return self._to_dto(rec)

    async def update(
        self, employee_number: str, preset_id: int, *, name: str, config: dict, is_default: bool
    ) -> KeywordPresetDTO:
        rec = self._by_id.get(preset_id)
        if rec is None or rec["employee_number"] != employee_number:
            raise KeyError(preset_id)
        if is_default:
            self._clear_defaults(employee_number)
        rec["name"] = name
        rec["config"] = copy.deepcopy(config)
        rec["is_default"] = is_default
        return self._to_dto(rec)

    async def delete(self, employee_number: str, preset_id: int) -> None:
        rec = self._by_id.get(preset_id)
        if rec is not None and rec["employee_number"] == employee_number:
            del self._by_id[preset_id]
