from __future__ import annotations

from app.ports.keyword_preset_repository import KeywordPresetRepository


class DeleteKeywordPreset:
    """프리셋 삭제 (idempotent — 없으면 무시)."""

    def __init__(self, repo: KeywordPresetRepository) -> None:
        self._repo = repo

    async def execute(self, employee_number: str, preset_id: int) -> None:
        await self._repo.delete(employee_number, preset_id)
