from __future__ import annotations

from typing import AsyncIterator, Literal

from app.domain.lot import LotStatus
from app.ports.dto import ChangeWithSeverity, LotChangeEventDTO
from app.ports.lot_repository import LotRepository
from app.ports.lot_source import LotSource


class StreamHoldChanges:
    """Subscribe to lot change events, classify severity, invalidate cache.

    Severity policy is *domain*, not adapter:
    - status: `* → hold` (transition into hold from non-hold) = critical
    - else = info

    Cache invalidation happens unconditionally on every event so the next REST
    refresh sees fresh data.
    """

    def __init__(self, source: LotSource, repo: LotRepository) -> None:
        self._source = source
        self._repo = repo

    async def execute(self, employee_number: str) -> AsyncIterator[ChangeWithSeverity]:
        async for event in self._source.subscribe_changes(employee_number):
            await self._repo.invalidate_cache(employee_number)
            severity = self._classify_severity(event)
            yield ChangeWithSeverity(event=event, severity=severity)

    @staticmethod
    def _classify_severity(event: LotChangeEventDTO) -> Literal["info", "warning", "critical"]:
        if (
            event.change_type == "status"
            and event.new_status == LotStatus.HOLD
            and event.previous_status != LotStatus.HOLD
        ):
            return "critical"
        return "info"
