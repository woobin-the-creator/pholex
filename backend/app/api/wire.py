"""Wire format mapping — internal DTO (snake_case) → frontend JSON (camelCase).

Centralized here so that wire format changes are localized and regression-tested
in tests/api/test_ws_wire_format.py. DTO/use-case/domain code never touches
camelCase keys.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from app.ports.dto import ChangeWithSeverity, LotRowDTO


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def lot_row_to_wire(row: LotRowDTO) -> dict[str, Any]:
    return {
        "lotId": row.lot_id,
        "status": row.status,
        "equipment": row.equipment,
        "processStep": row.process_step,
        "holdComment": row.hold_comment,
        "updatedAt": _iso(row.updated_at),
    }


def slot_payload(
    *,
    table_id: int,
    rows: list[LotRowDTO],
    diff: bool,
    last_updated: datetime,
) -> dict[str, Any]:
    return {
        "tableId": table_id,
        "rows": [lot_row_to_wire(r) for r in rows],
        "diff": diff,
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
    if e.change_type == "status" and e.new_status == "hold":
        return f"{e.lot_id}: {e.previous_status or '?'} → hold"
    return f"{e.lot_id}: {e.change_type}"
