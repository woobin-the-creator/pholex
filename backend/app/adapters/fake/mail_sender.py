from __future__ import annotations

import logging

from ulid import ULID

from app.ports.dto import MailSendResult


logger = logging.getLogger(__name__)


class LogMailSender:
    """Fake MailSender — stdout 로그만 남기고 항상 성공 응답."""

    def __init__(self) -> None:
        self.sent: list[dict[str, str]] = []

    async def send(self, *, to: str, subject: str, body: str) -> MailSendResult:
        message_id = str(ULID())
        record = {"to": to, "subject": subject, "body": body, "message_id": message_id}
        self.sent.append(record)
        logger.info("FAKE_MAIL to=%s subject=%s id=%s", to, subject, message_id)
        return MailSendResult(success=True, message_id=message_id, error=None)
