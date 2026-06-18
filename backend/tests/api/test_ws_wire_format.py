from __future__ import annotations

from datetime import datetime, timezone

from app.api.wire import change_to_wire, lot_row_to_wire, slot_payload
from app.ports.dto import ChangeWithSeverity, LotChangeEventDTO, LotRowDTO


_DT = datetime(2026, 4, 28, 7, 42, 11, tzinfo=timezone.utc)


def _row(lot_id: str = "LOT-A2948") -> LotRowDTO:
    return LotRowDTO(
        lot_id=lot_id,
        status="hold",
        equipment="CMP-03",
        process_step="CMP / 슬러리 모니터",
        hold_comment="Pad life 초과 의심",
        updated_at=_DT,
        is_held_by_me=True,
    )


def test_lot_row_uses_camelcase_keys():
    """Frontend types (services/api.ts, types/lot.ts)와 동치 키만 보낸다."""
    wire = lot_row_to_wire(_row())
    assert set(wire.keys()) == {"lotId", "status", "equipment", "processStep", "holdComment", "updatedAt"}
    assert wire["lotId"] == "LOT-A2948"
    assert wire["status"] == "hold"
    assert wire["processStep"] == "CMP / 슬러리 모니터"
    assert wire["holdComment"] == "Pad life 초과 의심"
    assert wire["updatedAt"] == "2026-04-28T07:42:11+00:00"
    # is_held_by_me는 wire에 노출 안 함 (frontend types에 없음)
    assert "is_held_by_me" not in wire
    assert "isHeldByMe" not in wire


def test_slot_payload_camelcase():
    payload = slot_payload(
        table_id=1,
        rows=[_row("L001"), _row("L002")],
        diff=False,
        last_updated=_DT,
    )
    assert set(payload.keys()) == {"tableId", "rows", "diff", "lastUpdated", "dumpMeta"}
    assert payload["tableId"] == 1
    assert payload["diff"] is False
    assert payload["lastUpdated"] == "2026-04-28T07:42:11+00:00"
    assert len(payload["rows"]) == 2


def test_slot_payload_dump_meta_default_thresholds_and_null_last_run():
    """last_run_at 미지정(dump 미실행) → lastRunAt=None, 임계값은 기본 30/60."""
    payload = slot_payload(
        table_id=1,
        rows=[_row("L001")],
        diff=False,
        last_updated=_DT,
    )
    dump_meta = payload["dumpMeta"]
    assert set(dump_meta.keys()) == {"lastRunAt", "freshMaxMinutes", "staleMinMinutes"}
    assert dump_meta["lastRunAt"] is None
    assert dump_meta["freshMaxMinutes"] == 30
    assert dump_meta["staleMinMinutes"] == 60


def test_slot_payload_dump_meta_serializes_last_run_at_iso():
    run_at = datetime(2026, 6, 17, 9, 0, 0, tzinfo=timezone.utc)
    payload = slot_payload(
        table_id=1,
        rows=[_row("L001")],
        diff=False,
        last_updated=_DT,
        last_run_at=run_at,
    )
    assert payload["dumpMeta"]["lastRunAt"] == "2026-06-17T09:00:00+00:00"


def test_change_to_wire_alert_format():
    envelope = ChangeWithSeverity(
        event=LotChangeEventDTO(
            lot_id="LOT-1",
            change_type="status",
            previous_status="wait",
            new_status="hold",
            new_hold_comment=None,
            occurred_at=_DT,
            event_id="01ABC",
        ),
        severity="critical",
    )
    wire = change_to_wire(envelope)
    assert wire["type"] == "alert"
    assert wire["payload"]["lotId"] == "LOT-1"
    assert wire["payload"]["severity"] == "critical"
    assert wire["payload"]["previousStatus"] == "wait"
    assert wire["payload"]["newStatus"] == "hold"
    # eventId/occurredAt must ride the alert too — the alarm dock dedupes by
    # eventId and orders its log by occurredAt, and criticals arrive only as alerts.
    assert wire["payload"]["eventId"] == "01ABC"
    assert wire["payload"]["occurredAt"] == _DT.isoformat()


def test_change_to_wire_info_uses_change_type():
    envelope = ChangeWithSeverity(
        event=LotChangeEventDTO(
            lot_id="LOT-1",
            change_type="comment",
            previous_status=None,
            new_status=None,
            new_hold_comment="updated",
            occurred_at=_DT,
            event_id="01ABC",
        ),
        severity="info",
    )
    wire = change_to_wire(envelope)
    assert wire["type"] == "change"
    assert wire["payload"]["changeType"] == "comment"
    assert wire["payload"]["newHoldComment"] == "updated"
