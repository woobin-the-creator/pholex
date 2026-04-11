from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlencode
from uuid import uuid4

from jose import JWTError, jwt

from app.config import Settings


class AuthError(ValueError):
    pass


@dataclass
class IdentityClaims:
    employee_id: str
    employee_number: Optional[str]
    username: str
    email: Optional[str]
    auth: str = "ENGINEER"


def build_dev_claims(settings: Settings) -> IdentityClaims:
    return IdentityClaims(
        employee_id=settings.dev_sso_user_id,
        employee_number=settings.dev_sso_employee_number,
        username=settings.dev_sso_username,
        email=settings.dev_sso_email,
        auth=settings.dev_sso_auth,
    )


def extract_claims(payload: dict[str, Any], settings: Settings) -> IdentityClaims:
    employee_id = payload.get(settings.sso_employee_id_claim) or payload.get("sub")
    employee_number = payload.get(settings.sso_employee_number_claim)
    username = payload.get(settings.sso_username_claim)
    email = payload.get(settings.sso_email_claim)
    auth = payload.get(settings.sso_auth_claim, "ENGINEER")

    if not employee_id:
        raise AuthError("missing employee id claim")
    if employee_number in (None, ""):
        raise AuthError("missing employee number claim")
    if not username:
        raise AuthError("missing username claim")

    return IdentityClaims(
        employee_id=str(employee_id),
        employee_number=str(employee_number),
        username=str(username),
        email=str(email) if email not in (None, "") else None,
        auth=str(auth),
    )


def validate_id_token(
    id_token: str,
    *,
    expected_nonce: str,
    settings: Settings,
) -> IdentityClaims:
    if not settings.sso_cert:
        raise AuthError("SSO_CERT is not configured")
    try:
        payload = jwt.decode(
            id_token,
            settings.sso_cert,
            algorithms=["RS256"],
            audience=settings.sso_client_id or None,
            options={"verify_aud": bool(settings.sso_client_id)},
        )
    except JWTError as exc:  # pragma: no cover - exercised via tests
        raise AuthError(f"invalid id_token: {exc}") from exc

    if payload.get("nonce") != expected_nonce:
        raise AuthError("invalid nonce")

    return extract_claims(payload, settings)


def build_nonce() -> str:
    return str(uuid4())


def build_authorize_url(nonce: str, settings: Settings) -> str:
    query = urlencode(
        {
            "client_id": settings.sso_client_id,
            "redirect_uri": f"{settings.sso_base_url}/api/auth/sso/callback",
            "response_mode": "form_post",
            "response_type": "code id_token",
            "scope": "openid profile",
            "nonce": nonce,
        }
    )
    return f"{settings.sso_idp_entity_id}?{query}"
