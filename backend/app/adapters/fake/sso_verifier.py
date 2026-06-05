from __future__ import annotations

from app.config import settings
from app.ports.dto import SsoIdentityDTO


class DevSsoVerifier:
    """Fake SsoVerifier — 개발/테스트용 고정 사용자.

    `dev_bypass`는 Port 에 노출되지 않고 이 어댑터 내부 정책으로 존재.
    DI 가 ADAPTER_MODE=fake 또는 DEV_SSO_BYPASS=true 일 때 이 어댑터를 주입.
    세션 토큰은 서명 없는 plain(사번) — dev 전용. 운영(real)은 서명 JWT.
    """

    def __init__(self) -> None:
        self._identity = SsoIdentityDTO(
            employee_number=settings.DEV_USER_EMPLOYEE_NUMBER,
            username=settings.DEV_USER_NAME,
            email=settings.DEV_USER_EMAIL,
            auth_level=settings.DEV_USER_AUTH_LEVEL,
        )

    async def init_login(self, return_url: str) -> str:
        # dev bypass 에선 실제 IdP 로 가지 않는다. controller(sso_init)가 DEV_SSO_BYPASS 일 때
        # 콜백 없이 세션을 바로 만든다. 이 URL 은 no-op 마커.
        return f"/api/auth/callback?code=dev&state={return_url}"

    async def verify_callback(self, code: str, id_token: str, state: str) -> SsoIdentityDTO:
        return self._identity

    async def create_session_token(self, identity: SsoIdentityDTO) -> str:
        # dev: 서명 없는 plain 토큰(사번). 운영(real)은 HS256 JWT.
        return identity.employee_number

    async def verify_session_token(self, token: str) -> SsoIdentityDTO:
        if not token:
            raise PermissionError("empty session token")
        return self._identity
