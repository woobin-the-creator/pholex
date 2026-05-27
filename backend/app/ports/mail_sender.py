from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.ports.dto import MailSendResult


@runtime_checkable
class MailSender(Protocol):
    """사내 메일 전송 시스템 추상화.

    `send`는 raise하지 않는다. 실패는 `MailSendResult(success=False, error=...)`로 반환.
    호출자는 결과로 분기 (ai-prompts/260413-1430).
    """

    async def send(self, *, to: str, subject: str, body: str) -> MailSendResult: ...
