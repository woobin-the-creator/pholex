from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum


class LotStatus(StrEnum):
    """알려진 raw `lot_status_seg` 값 + hold 앵커(`LotStatus.HOLD`).

    주의: 실제 status는 **열린 집합**이다 — 사내 MES가 새 값을 추가할 수 있어,
    매핑/변환 없이 raw 값을 그대로 저장·표시한다(unknown→wait 위조 방지).
    이 enum은 검증용 closed set이 *아니라*, 우리가 아는 값의 상수와 슬롯[1]
    hold 판정 앵커를 제공할 뿐이다. DTO/도메인의 status 필드는 임의 문자열을 허용한다.
    """

    ACTIVE = "Active"
    HOLD = "Hold"
    PREACTIVE = "PreActive"


# 표시 레지스트리·필터 초기값에 쓰는 "현재 아는 값". 검증용 아님(열린 집합).
KNOWN_STATUSES: frozenset[str] = frozenset(s.value for s in LotStatus)


@dataclass(frozen=True, slots=True)
class Lot:
    lot_id: str
    status: str  # 열린 집합 — raw lot_status_seg 값 그대로
    equipment: str | None
    process_step: str | None
    updated_at: datetime
