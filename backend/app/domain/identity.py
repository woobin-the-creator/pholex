"""[Phase 2] 세션 identity → hold 매칭 키(AD id) 파생.

"내 hold"(슬롯[1]) 매칭 키가 사번→AD id로 바뀌었다(CONTRACT-1 개정). AD id는 `users.email`의
로컬파트(`split_part(email,'@',1)`, 예 `gd01.hong`)로, 소스 `opertr_id`의 '(' 앞부분과 매칭된다.
⚠️전제(미검증): email 로컬파트 == AD id (history/decisions.html era 6 revisit).
"""

from __future__ import annotations

from typing import Protocol


class _HasEmail(Protocol):
    email: str


def operator_ad_id_of(identity: _HasEmail) -> str:
    """세션 identity의 email 로컬파트를 hold 매칭 AD id로 반환.

    email이 비었거나 '@'가 없으면 원문을 그대로 돌려준다(매칭 안 되는 게 정상 — 손실 허용).
    """
    email = identity.email or ""
    return email.split("@", 1)[0]
