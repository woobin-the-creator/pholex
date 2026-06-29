from __future__ import annotations

from app.config import settings
from app.ports.dto import SsoIdentityDTO, UserRecordDTO
from app.ports.sso_verifier import SsoVerifier
from app.ports.user_repository import UserRepository


def _admin_emails() -> set[str]:
    return {e.strip().lower() for e in settings.ADMIN_EMAILS.split(",") if e.strip()}


def _resolve_auth_level(identity: SsoIdentityDTO) -> str:
    # IdP 는 auth claim 을 주지 않아 항상 ENGINEER. Pholex 가 ADMIN_EMAILS 로 승격.
    if identity.email and identity.email.lower() in _admin_emails():
        return "ADMIN"
    return identity.auth_level


class InitSsoLogin:
    def __init__(self, sso: SsoVerifier) -> None:
        self._sso = sso

    async def execute(self, return_url: str) -> str:
        return await self._sso.init_login(return_url)


class CompleteSsoLogin:
    """콜백 검증 → 권한 산정(ADMIN_EMAILS) → 사용자 provisioning → 최종 identity 반환."""

    def __init__(self, sso: SsoVerifier, user_repo: UserRepository) -> None:
        self._sso = sso
        self._user_repo = user_repo

    async def execute(self, code: str, id_token: str, state: str) -> SsoIdentityDTO:
        identity = await self._sso.verify_callback(code, id_token, state)
        final = identity.model_copy(update={"auth_level": _resolve_auth_level(identity)})
        await self._user_repo.upsert(
            UserRecordDTO(
                employee_number=final.employee_number,
                username=final.username,
                email=final.email,
                auth_level=final.auth_level,
            )
        )
        return final


class VerifySessionToken:
    def __init__(self, sso: SsoVerifier) -> None:
        self._sso = sso

    async def execute(self, token: str) -> SsoIdentityDTO:
        return await self._sso.verify_session_token(token)
