"""Golden dataset for Fake adapters and Contract tests.

Same fixture must be seeded into 사내 dev DB for Real adapter Contract test
(see docs/adapter-spec.md). Two employees:
- 99999: 3 holds (테스트 사용자, 다양한 nullability/equipment 조합)
- 88888: 1 hold (cross-contamination 검증용 — 99999 결과에 섞이면 안 됨)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TypedDict


class GoldenRow(TypedDict):
    lot_id: str
    status: str
    equipment: str | None
    process_step: str | None
    hold_comment: str | None
    updated_at: datetime
    hold_operator_employee_number: str


# Deterministic ISO timestamps for ordering tests
_T = lambda iso: datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)

GOLDEN_ROWS: list[GoldenRow] = [
    {
        "lot_id": "LOT-A2948",
        "status": "hold",
        "equipment": "CMP-03",
        "process_step": "CMP / 슬러리 모니터",
        "hold_comment": "Pad life 초과 의심 — 측정값 확인 필요",
        "updated_at": _T("2026-04-28T07:42:11"),
        "hold_operator_employee_number": "99999",
    },
    {
        "lot_id": "LOT-B1175",
        "status": "hold",
        "equipment": "ETCH-11",
        "process_step": "Dry Etch / Poly",
        "hold_comment": None,  # nullable comment edge
        "updated_at": _T("2026-04-28T07:31:54"),
        "hold_operator_employee_number": "99999",
    },
    {
        "lot_id": "LOT-C3320",
        "status": "hold",
        "equipment": None,  # nullable equipment edge
        "process_step": "Implant / NWell",
        "hold_comment": "Dose 검증 재측정 요청",
        "updated_at": _T("2026-04-28T06:58:02"),
        "hold_operator_employee_number": "99999",
    },
    {
        "lot_id": "LOT-X9999",
        "status": "hold",
        "equipment": "LITHO-04",
        "process_step": "Photo / Mask 4",
        "hold_comment": "다른 사용자 hold (cross-contamination 검증용)",
        "updated_at": _T("2026-04-28T05:47:18"),
        "hold_operator_employee_number": "88888",
    },
]
