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


class WatchlistRowDTO(BaseModel):
    """슬롯[2] "내 관심 랏" 표시 행. watchlist lot_id ⨝ lot_status 결과.

    `found=False`는 등록한 lot_id가 아직 `lot_status`(30분 dump 캐시)에 없는 상태("조회 대기/없음").
    다음 dump에서 채워지면 found=True로 바뀐다. found=False면 lot 데이터 필드는 모두 None.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    lot_id: str
    found: bool
    status: LotStatusLiteral | None = None
    equipment: str | None = None
    process_step: str | None = None
    hold_comment: str | None = None
    updated_at: datetime | None = None

    @field_validator("updated_at")
    @classmethod
    def _tz_aware_if_present(cls, value: datetime | None) -> datetime | None:
        return _require_tz_aware(value) if value is not None else None


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


class UserRecordDTO(BaseModel):
    """SSO 프로비저닝 대상 사용자 레코드. employee_number(sabun)를 unique 키로 upsert.

    SsoIdentityDTO와 필드는 같지만 의미가 다르다 — auth_level은 IdP가 준 값(항상 ENGINEER)이
    아니라 Pholex가 ADMIN_EMAILS 등으로 산정한 최종 권한이 들어갈 수 있다 (docs/auth.md §3).
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    employee_number: str      # 사번 (sabun) — unique 프로비저닝 키 (IdP 별도 고유 ID 없음)
    username: str
    email: str
    auth_level: AuthLevelLiteral


class MailSendResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    success: bool
    message_id: str | None = None
    error: str | None = None
