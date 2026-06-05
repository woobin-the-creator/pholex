from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.ports.dto import SsoIdentityDTO


@runtime_checkable
class SsoVerifier(Protocol):
    """사내 SSO/OIDC 추상화 (Hybrid Flow: form_post 로 code+id_token+state 수신).

    dev_bypass 는 Port 에 없다 — Fake adapter 내부 정책.
    세션 토큰(create/verify)도 이 Port 가 담당한다: real=서명 JWT(HS256), dev=plain(사번).
    """

    async def init_login(self, return_url: str) -> str:
        """OIDC authorization URL 반환 (브라우저 리다이렉트 대상)."""
        ...

    async def verify_callback(self, code: str, id_token: str, state: str) -> SsoIdentityDTO:
        """form_post 콜백 검증: id_token RS256 서명 + nonce(Redis 소비) + claim 추출 → identity.

        IdP 가 POST 하는 폼 필드: code, id_token, state. nonce 는 id_token claim 안에 있고
        init_login 단계에서 Redis 에 저장해 둔 값과 대조 후 소비(삭제)한다.
        """
        ...

    async def create_session_token(self, identity: SsoIdentityDTO) -> str:
        """로그인 성공 후 세션 쿠키에 담을 토큰 생성.

        real: HS256 서명 JWT (claims: employee_number/username/email/auth_level/iat/exp).
        dev: 서명 없는 plain(사번).
        """
        ...

    async def verify_session_token(self, token: str) -> SsoIdentityDTO:
        """세션 토큰(쿠키) 검증 → identity. 위조/만료 시 PermissionError. (세션 조회·WS 인증)."""
        ...
