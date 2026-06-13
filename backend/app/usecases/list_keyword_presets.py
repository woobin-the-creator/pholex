from __future__ import annotations

from app.ports.dto import KeywordPresetDTO
from app.ports.keyword_preset_repository import KeywordPresetRepository


class ListKeywordPresets:
    """슬롯[5] 'Special hold' — 사용자의 키워드 프리셋 목록."""

    def __init__(self, repo: KeywordPresetRepository) -> None:
        self._repo = repo

    async def execute(self, employee_number: str) -> list[KeywordPresetDTO]:
        return await self._repo.list_by_employee(employee_number)
