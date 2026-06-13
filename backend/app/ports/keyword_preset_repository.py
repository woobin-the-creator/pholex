from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.ports.dto import KeywordPresetDTO


@runtime_checkable
class KeywordPresetRepository(Protocol):
    """슬롯[5] 'Special hold' 키워드 프리셋 저장소 (사용자별 명명 프리셋).

    Real adapter는 Pholex Postgres(keyword_presets 테이블)에 붙는다. Fake는 인메모리.
    config는 DNF JSONB(domain.keyword.query_to_config 형식)이며, 저장소는 이를 불투명
    blob으로 다룬다 — 검증/해석은 usecase/domain이 한다.
    """

    async def list_by_employee(self, employee_number: str) -> list[KeywordPresetDTO]:
        """사번의 모든 프리셋. created_at ASC(생성 순) 정렬, 없으면 빈 리스트."""
        ...

    async def get(self, employee_number: str, preset_id: int) -> KeywordPresetDTO | None:
        """프리셋 1건. 없거나 다른 사번 소유면 None."""
        ...

    async def create(
        self, employee_number: str, name: str, config: dict, *, is_default: bool
    ) -> KeywordPresetDTO:
        """새 프리셋 생성. is_default=True면 같은 사번의 기존 default를 해제. 반환=생성된 프리셋(id 포함)."""
        ...

    async def update(
        self, employee_number: str, preset_id: int, *, name: str, config: dict, is_default: bool
    ) -> KeywordPresetDTO:
        """기존 프리셋 덮어쓰기. 없거나 다른 사번 소유면 KeyError. is_default=True면 기존 default 해제."""
        ...

    async def delete(self, employee_number: str, preset_id: int) -> None:
        """삭제. 없거나 다른 사번 소유면 조용히 무시(idempotent)."""
        ...
