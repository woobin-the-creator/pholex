from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse

from app.api.deps import sso_verifier_dep
from app.config import settings
from app.ports.sso_verifier import SsoVerifier
from app.usecases.sso import (
    CompleteSsoLogin,
    InitSsoLogin,
    VerifySessionToken,
    identity_to_session_user,
)


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _session_token_for(employee_number: str) -> str:
    # MVP: session token == employee_number. Production would use signed JWT.
    return employee_number


def _set_session_cookie(response: Response, employee_number: str) -> None:
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=_session_token_for(employee_number),
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


@router.get("/sso/init")
async def sso_init(
    sso: Annotated[SsoVerifier, Depends(sso_verifier_dep)],
) -> RedirectResponse:
    uc = InitSsoLogin(sso)
    url = await uc.execute(settings.SSO_RETURN_URL)
    return RedirectResponse(url=url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get("/sso/callback")
async def sso_callback(
    code: str,
    state: str,
    sso: Annotated[SsoVerifier, Depends(sso_verifier_dep)],
) -> RedirectResponse:
    uc = CompleteSsoLogin(sso)
    user = await uc.execute(code, state)
    response = RedirectResponse(url=settings.SSO_RETURN_URL, status_code=status.HTTP_303_SEE_OTHER)
    _set_session_cookie(response, user.employee_number)
    return response


@router.get("/session")
async def get_session(
    pholex_session: Annotated[str | None, Cookie(alias=settings.SESSION_COOKIE_NAME)] = None,
    sso: SsoVerifier = Depends(sso_verifier_dep),
) -> dict:
    if not pholex_session:
        return {"authenticated": False, "user": None}
    try:
        uc = VerifySessionToken(sso)
        user = await uc.execute(pholex_session)
    except PermissionError:
        return {"authenticated": False, "user": None}
    return {
        "authenticated": True,
        "user": {
            "employee_number": user.employee_number,
            "username": user.username,
            "email": user.email,
            "auth": user.auth_level.value,
        },
    }


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(key=settings.SESSION_COOKIE_NAME, path="/")
    return {"ok": True}
