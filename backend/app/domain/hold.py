from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True, slots=True)
class Hold:
    lot_id: str
    operator_employee_number: str
    comment: str | None
    held_at: datetime
