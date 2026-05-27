from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class LotStatus(StrEnum):
    RUN = "run"
    WAIT = "wait"
    HOLD = "hold"


@dataclass(frozen=True, slots=True)
class Lot:
    lot_id: str
    status: LotStatus
    equipment: str | None
    process_step: str | None
    updated_at: datetime
