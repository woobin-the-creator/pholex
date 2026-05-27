from __future__ import annotations

from app.config import settings
from app.ports.dto import SsoIdentityDTO


class DevSsoVerifier:
    """Fake SsoVerifier — 개발/테스트용 고정 사용자.

    `dev_bypass`는 Port에 노출되지 않고 이 어댑터 내부 정책으로 존재.
    DI가 ADAPTER_MODE=fake 또는 DEV_SSO_BYPASS=true일 때 이 어댑터를 주입.
    """

    def __init__(self) -> None:
        self._identity = SsoIdentityDTO(
            employee_number=settings.DEV_USER_EMPLOYEE_NUMBER,
            username=settings.DEV_USER_NAME,
            email=settings.DEV_USER_EMAIL,
            auth_level=settings.DEV_USER_AUTH_LEVEL,
        )

    async def init_login(self, return_url: str) -> str:
        # In dev bypass we don't actually go to an IdP; the controller just creates a session
        # and redirects back. This URL is a no-op marker.
        return f"/api/auth/sso/callback?code=dev&state={return_url}"

    async def verify_callback(self, code: str, state: str) -> SsoIdentityDTO:
        return self._identity

    async def verify_session_token(self, token: str) -> SsoIdentityDTO:
        if not token:
            raise PermissionError("empty session token")
        return self._identity
