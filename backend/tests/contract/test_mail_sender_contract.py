from __future__ import annotations

import pytest


@pytest.mark.asyncio
async def test_send_returns_result(mail_sender):
    result = await mail_sender.send(to="user@test", subject="s", body="b")
    assert result.success is True
    assert result.message_id is not None
    assert result.error is None


@pytest.mark.asyncio
async def test_send_does_not_raise_on_normal_path(mail_sender):
    # Contract: send returns MailSendResult; failures encoded as success=False, not raise.
    await mail_sender.send(to="user@test", subject="s", body="b")
