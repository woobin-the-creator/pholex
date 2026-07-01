from __future__ import annotations

from typing import AsyncIterator, Literal

from app.domain.lot import LotStatus
from app.ports.dto import ChangeWithSeverity, LotChangeEventDTO
from app.ports.lot_repository import LotRepository
from app.ports.lot_source import LotSource


class StreamHoldChanges:
    """Subscribe to lot change events, classify severity, invalidate cache.

    Severity policy is *domain*, not adapter (see docs/backend.md §7):
    - status `* → Hold` (into Hold from non-Hold) = critical
    - any other *actual* status transition (previous != new) = warning
    - same-status status event (re-entry) or non-status change = info

    Cache invalidation happens unconditionally on every event so the next REST
    refresh sees fresh data.
    """

    def __init__(self, source: LotSource, repo: LotRepository) -> None:
        self._source = source
        self._repo = repo

    async def execute(self, operator_ad_id: str) -> AsyncIterator[ChangeWithSeverity]:
        # [Phase 2] subscribe/invalidate 키가 사번→AD id로 바뀜 (port 시그니처 일치).
        async for event in self._source.subscribe_changes(operator_ad_id):
            await self._repo.invalidate_cache(operator_ad_id)
            severity = self._classify_severity(event)
            yield ChangeWithSeverity(event=event, severity=severity)

    @staticmethod
    def _classify_severity(event: LotChangeEventDTO) -> Literal["info", "warning", "critical"]:
        if event.change_type != "status":
            return "info"
        if event.new_status == LotStatus.HOLD and event.previous_status != LotStatus.HOLD:
            return "critical"
        if event.previous_status != event.new_status:
            return "warning"
        return "info"
