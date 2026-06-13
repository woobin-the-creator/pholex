from __future__ import annotations

from app.domain.keyword import query_from_config, query_to_config
from app.ports.dto import KeywordPresetDTO
from app.ports.keyword_preset_repository import KeywordPresetRepository


class SaveKeywordPreset:
    """프리셋 생성(preset_id=None) 또는 덮어쓰기. config는 저장 전 DNF로 검증·정규화한다.

    드래프트 + 명시 저장 모델 — 프론트의 [저장](preset_id 지정)/[새 프리셋으로 저장](preset_id=None).
    """

    def __init__(self, repo: KeywordPresetRepository) -> None:
        self._repo = repo

    async def execute(
        self,
        employee_number: str,
        *,
        name: str,
        config: dict,
        is_default: bool = False,
        preset_id: int | None = None,
    ) -> KeywordPresetDTO:
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("preset name must be non-empty")
        # 검증(KeywordError) + 값 trim 정규화 → 정규화된 config를 저장
        normalized = query_to_config(query_from_config(config))
        if preset_id is None:
            return await self._repo.create(
                employee_number, clean_name, normalized, is_default=is_default
            )
        return await self._repo.update(
            employee_number, preset_id, name=clean_name, config=normalized, is_default=is_default
        )
