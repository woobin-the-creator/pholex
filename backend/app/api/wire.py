"""Wire format mapping — internal DTO (snake_case) → frontend JSON (camelCase).

Centralized here so that wire format changes are localized and regression-tested
in tests/api/test_ws_wire_format.py. DTO/use-case/domain code never touches
camelCase keys.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.domain.lot import LotStatus
from app.ports.dto import (
    ChangeWithSeverity,
    HoldDTO,
    KeywordPresetDTO,
    LotRowDTO,
    WatchlistRowDTO,
)


# 신선도 임계값 (분). 프론트가 last_run_at + 이 값으로 색·카운터를 계산한다.
# fresh_max: 이 이하면 🟡 캐시 신선 / stale_min: 이 이상이면 🔴 stale·down (dump 주기 2배).
DUMP_FRESH_MAX_MINUTES = 30
DUMP_STALE_MIN_MINUTES = 60


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def hold_to_wire(hold: HoldDTO) -> dict[str, Any]:
    # [Phase 2] hold 한 건 → 프론트 JSON. operator_ad_id/이름/item_type/comment/issue_date.
    return {
        "operatorAdId": hold.operator_ad_id,
        "operatorName": hold.operator_name,
        "itemType": hold.item_type,
        "comment": hold.comment,
        "issueDate": _iso(hold.issue_date) if hold.issue_date is not None else None,
    }


def lot_row_to_wire(row: LotRowDTO) -> dict[str, Any]:
    # [Phase 2] hold는 1:N — 단일 holdComment 대신 myHolds 배열을 싣는다.
    return {
        "lotId": row.lot_id,
        "status": row.status,
        "equipment": row.equipment,
        "processStep": row.process_step,
        "updatedAt": _iso(row.updated_at),
        "myHolds": [hold_to_wire(h) for h in row.my_holds],
    }


def watchlist_row_to_wire(row: WatchlistRowDTO) -> dict[str, Any]:
    return {
        "lotId": row.lot_id,
        "found": row.found,
        "status": row.status,
        "equipment": row.equipment,
        "processStep": row.process_step,
        "holdComment": row.hold_comment,
        "updatedAt": _iso(row.updated_at) if row.updated_at is not None else None,
    }


def watchlist_payload(
    *,
    table_id: int,
    rows: list[WatchlistRowDTO],
    last_updated: datetime,
) -> dict[str, Any]:
    return {
        "tableId": table_id,
        "rows": [watchlist_row_to_wire(r) for r in rows],
        "lastUpdated": _iso(last_updated),
    }


def slot_payload(
    *,
    table_id: int,
    rows: list[LotRowDTO],
    diff: bool,
    last_updated: datetime,
    last_run_at: datetime | None = None,
) -> dict[str, Any]:
    return {
        "tableId": table_id,
        "rows": [lot_row_to_wire(r) for r in rows],
        "diff": diff,
        "lastUpdated": _iso(last_updated),
        "dumpMeta": {
            "lastRunAt": _iso(last_run_at) if last_run_at is not None else None,
            "freshMaxMinutes": DUMP_FRESH_MAX_MINUTES,
            "staleMinMinutes": DUMP_STALE_MIN_MINUTES,
        },
    }


def keyword_preset_to_wire(preset: KeywordPresetDTO) -> dict[str, Any]:
    return {
        "id": preset.id,
        "name": preset.name,
        "config": preset.config,
        "isDefault": preset.is_default,
        "createdAt": _iso(preset.created_at) if preset.created_at is not None else None,
    }


def special_hold_payload(
    *,
    table_id: int,
    rows: list[LotRowDTO],
    total: int,
    page: int,
    page_size: int,
    last_updated: datetime,
) -> dict[str, Any]:
    return {
        "tableId": table_id,
        "rows": [lot_row_to_wire(r) for r in rows],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "lastUpdated": _iso(last_updated),
    }


def change_to_wire(envelope: ChangeWithSeverity) -> dict[str, Any]:
    e = envelope.event
    if envelope.severity in ("warning", "critical"):
        return {
            "type": "alert",
            "payload": {
                "lotId": e.lot_id,
                "severity": envelope.severity,
                "changeType": e.change_type,
                "previousStatus": e.previous_status,
                "newStatus": e.new_status,
                "eventId": e.event_id,
                "occurredAt": _iso(e.occurred_at),
                "message": _alert_message(envelope),
            },
        }
    return {
        "type": "change",
        "payload": {
            "lotId": e.lot_id,
            "changeType": e.change_type,
            "previousStatus": e.previous_status,
            "newStatus": e.new_status,
            "newHoldComment": e.new_hold_comment,
            "occurredAt": _iso(e.occurred_at),
            "eventId": e.event_id,
        },
    }


def _alert_message(envelope: ChangeWithSeverity) -> str:
    e = envelope.event
    if e.change_type == "status" and e.new_status == LotStatus.HOLD:
        return f"{e.lot_id}: {e.previous_status or '?'} → {LotStatus.HOLD}"
    return f"{e.lot_id}: {e.change_type}"
