"""Golden dataset for Fake adapters and Contract tests.

[Phase 2] hold는 1:N — 한 lot에 여러 담당자가 각자 사유로 hold를 건다. 매칭 키는 사번이 아니라
**AD id**(`operator_ad_id`, `opertr_id`의 '(' 앞부분, `users.email` 로컬파트와 매칭 — CONTRACT-1 개정).

각 행은 **explode된 hold 한 건**(lot_hold 1행)이다. 같은 lot이 여러 행으로 나타날 수 있다:
- 여러 담당자가 같은 lot에 hold를 걸거나,
- 같은 담당자가 같은 lot에 다른 사유로 여러 건 걸거나.

동일 fixture를 사내 dev DB에 시드해 Real adapter Contract test에 쓴다 (docs/dump-job-spec.md §7).

뷰어(테스트 사용자)와 cross-contamination:
- `gd01.hong`(뷰어) → LOT-A2948에 2건(다른 사유) + LOT-B1175에 1건 = **2 lot, 3 hold**
- `pk02.kim`          → LOT-A2948에 1건 — `gd01.hong` 결과에 섞이면 안 됨(cross-contamination)
- `sk03.lee`          → LOT-C3320에 1건 — 또 다른 담당자(뷰어와 무관)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import TypedDict


class GoldenRow(TypedDict):
    """explode된 hold 한 건 (lot_hold 1행 + 소속 lot의 lot_status 필드).

    lot_status 필드(status/equipment/process_step/updated_at)는 같은 lot_id 행끼리 동일하다
    (lot당 1행으로 dedup되는 값). hold 고유 필드는 operator_ad_id/operator_name/item_type/
    issue_comment/issue_date.
    """

    lot_id: str
    status: str
    equipment: str | None
    process_step: str | None
    updated_at: datetime
    operator_ad_id: str
    operator_name: str | None
    item_type: str | None
    issue_comment: str | None
    issue_date: datetime | None


# Deterministic ISO timestamps for ordering tests
_T = lambda iso: datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)

GOLDEN_ROWS: list[GoldenRow] = [
    # LOT-A2948 — 뷰어(gd01.hong)가 2건(다른 사유) + pk02.kim이 1건 (한 lot 다수 담당자·다수 사유)
    {
        "lot_id": "LOT-A2948",
        "status": "Hold",
        "equipment": None,  # hold lot=stocker 적재 → NULL 정상
        "process_step": "CMP / 슬러리 모니터",
        "updated_at": _T("2026-04-28T07:42:11"),
        "operator_ad_id": "gd01.hong",
        "operator_name": "홍길동",
        "item_type": "USER",
        "issue_comment": "Pad life 초과 의심 — 측정값 확인 필요",
        "issue_date": _T("2026-04-28T07:42:11"),
    },
    {
        "lot_id": "LOT-A2948",
        "status": "Hold",
        "equipment": None,
        "process_step": "CMP / 슬러리 모니터",
        "updated_at": _T("2026-04-28T07:42:11"),
        "operator_ad_id": "gd01.hong",  # 같은 담당자·같은 lot·다른 사유 (1:N 핵심 케이스)
        "operator_name": "홍길동",
        "item_type": "SPC",
        "issue_comment": "SPC 한계 재검토 요청",
        "issue_date": _T("2026-04-28T07:50:03"),
    },
    {
        "lot_id": "LOT-A2948",
        "status": "Hold",
        "equipment": None,
        "process_step": "CMP / 슬러리 모니터",
        "updated_at": _T("2026-04-28T07:42:11"),
        "operator_ad_id": "pk02.kim",  # 다른 담당자 — gd01.hong 결과에 섞이면 안 됨
        "operator_name": "김판교",
        "item_type": "DEFECT",
        "issue_comment": "Defect map 확인 필요",
        "issue_date": _T("2026-04-28T07:31:00"),
    },
    # LOT-B1175 — 뷰어(gd01.hong)가 1건 (뷰어의 두 번째 lot). item_type/comment nullable edge
    {
        "lot_id": "LOT-B1175",
        "status": "Hold",
        "equipment": None,
        "process_step": "Dry Etch / Poly",
        "updated_at": _T("2026-04-28T07:31:54"),
        "operator_ad_id": "gd01.hong",
        "operator_name": "홍길동",
        "item_type": None,           # nullable item_type edge
        "issue_comment": None,       # nullable comment edge
        "issue_date": _T("2026-04-28T07:31:54"),
    },
    # LOT-C3320 — sk03.lee 1건 (뷰어와 무관한 또 다른 담당자). operator_name None edge
    {
        "lot_id": "LOT-C3320",
        "status": "Hold",
        "equipment": None,
        "process_step": "Implant / NWell",
        "updated_at": _T("2026-04-28T06:58:02"),
        "operator_ad_id": "sk03.lee",
        "operator_name": None,       # 괄호 없는 opertr_id → operator_name NULL edge
        "item_type": "L·L",
        "issue_comment": "Dose 검증 재측정 요청",
        "issue_date": _T("2026-04-28T06:58:02"),
    },
]

# 뷰어(테스트 사용자)의 AD id. DEV_USER_EMAIL 로컬파트(config)와 일치해야 API 통합테스트가
# 이 fixture의 hold를 "내 hold"로 집계한다. 아래 두 상수는 계약 검증 오라클로 쓴다.
VIEWER_AD_ID = "gd01.hong"                          # 2 lot, 3 hold
CROSS_CONTAM_AD_ID = "pk02.kim"                      # LOT-A2948에 1건 (뷰어 결과에 섞이면 안 됨)
