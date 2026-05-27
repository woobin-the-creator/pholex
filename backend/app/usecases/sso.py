from __future__ import annotations

from app.domain.session import AuthLevel, SessionUser
from app.ports.dto import SsoIdentityDTO
from app.ports.sso_verifier import SsoVerifier


def identity_to_session_user(identity: SsoIdentityDTO) -> SessionUser:
    return SessionUser(
        employee_number=identity.employee_number,
        username=identity.username,
        email=identity.email,
        auth_level=AuthLevel(identity.auth_level),
    )


class InitSsoLogin:
    def __init__(self, sso: SsoVerifier) -> None:
        self._sso = sso

    async def execute(self, return_url: str) -> str:
        return await self._sso.init_login(return_url)


class CompleteSsoLogin:
    def __init__(self, sso: SsoVerifier) -> None:
        self._sso = sso

    async def execute(self, code: str, state: str) -> SessionUser:
        identity = await self._sso.verify_callback(code, state)
        return identity_to_session_user(identity)


class VerifySessionToken:
    def __init__(self, sso: SsoVerifier) -> None:
        self._sso = sso

    async def execute(self, token: str) -> SessionUser:
        identity = await self._sso.verify_session_token(token)
        return identity_to_session_user(identity)
