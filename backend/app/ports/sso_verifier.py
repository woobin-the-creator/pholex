from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.ports.dto import SsoIdentityDTO


@runtime_checkable
class SsoVerifier(Protocol):
    """사내 SSO/OIDC 추상화. dev_bypass는 Port에 없다 — Fake adapter 내부 결정."""

    async def init_login(self, return_url: str) -> str:
        """OIDC authorization URL 반환 (브라우저 리다이렉트 대상)."""
        ...

    async def verify_callback(self, code: str, state: str) -> SsoIdentityDTO:
        """authorization code → ID token 검증 → identity 반환."""
        ...

    async def verify_session_token(self, token: str) -> SsoIdentityDTO:
        """세션 토큰(쿠키) 검증 → identity 반환. WebSocket 인증 등에서 사용."""
        ...
