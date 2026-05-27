from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator


LotStatusLiteral = Literal["run", "wait", "hold"]
AuthLevelLiteral = Literal["ENGINEER", "ADMIN"]
ChangeTypeLiteral = Literal["status", "hold", "comment", "created", "removed"]
SeverityLiteral = Literal["info", "warning", "critical"]


def _require_tz_aware(value: datetime) -> datetime:
    # Adapters must hand timezone-aware datetimes across the Port. tz-naive values
    # break wire serialization (isoformat without offset) and severity ordering.
    if value.tzinfo is None:
        raise ValueError("datetime must be timezone-aware (got naive)")
    return value


class LotRowDTO(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    lot_id: str
    status: LotStatusLiteral
    equipment: str | None = None
    process_step: str | None = None
    hold_comment: str | None = None
    updated_at: datetime
    is_held_by_me: bool

    _validate_updated_at = field_validator("updated_at")(_require_tz_aware)


class LotChangeEventDTO(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    lot_id: str
    change_type: ChangeTypeLiteral
    previous_status: LotStatusLiteral | None = None
    new_status: LotStatusLiteral | None = None
    new_hold_comment: str | None = None
    occurred_at: datetime
    event_id: str

    _validate_occurred_at = field_validator("occurred_at")(_require_tz_aware)


class ChangeWithSeverity(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    event: LotChangeEventDTO
    severity: SeverityLiteral


class SsoIdentityDTO(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    employee_number: str
    username: str
    email: str
    auth_level: AuthLevelLiteral


class MailSendResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    success: bool
    message_id: str | None = None
    error: str | None = None
