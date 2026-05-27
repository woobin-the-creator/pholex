from __future__ import annotations

import pytest

from app.ports.dto import SsoIdentityDTO


@pytest.mark.asyncio
async def test_init_login_returns_url_string(sso_verifier):
    url = await sso_verifier.init_login("/")
    assert isinstance(url, str)
    assert len(url) > 0


@pytest.mark.asyncio
async def test_verify_callback_returns_identity(sso_verifier):
    identity = await sso_verifier.verify_callback("code123", "state")
    assert isinstance(identity, SsoIdentityDTO)
    assert identity.auth_level in ("ENGINEER", "ADMIN")


@pytest.mark.asyncio
async def test_verify_session_token_rejects_empty(sso_verifier):
    with pytest.raises(PermissionError):
        await sso_verifier.verify_session_token("")


@pytest.mark.asyncio
async def test_verify_session_token_returns_identity(sso_verifier):
    identity = await sso_verifier.verify_session_token("some-token")
    assert isinstance(identity, SsoIdentityDTO)
    assert identity.employee_number
