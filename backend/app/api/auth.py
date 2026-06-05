from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, Form, Response, status
from fastapi.responses import RedirectResponse

from app.api.deps import sso_verifier_dep, user_repository_dep
from app.config import settings
from app.ports.sso_verifier import SsoVerifier
from app.ports.user_repository import UserRepository
from app.usecases.sso import CompleteSsoLogin, InitSsoLogin, VerifySessionToken


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=token,
        httponly=True,
        secure=settings.SESSION_COOKIE_SECURE,
        samesite="lax",
        path="/",
    )


@router.get("/sso/init")
async def sso_init(
    sso: Annotated[SsoVerifier, Depends(sso_verifier_dep)],
) -> RedirectResponse:
    # dev bypass: IdP/콜백 없이 세션을 즉시 생성하고 리다이렉트 (auth.md §5).
    if settings.DEV_SSO_BYPASS:
        identity = await sso.verify_session_token(settings.DEV_USER_EMPLOYEE_NUMBER)
        token = await sso.create_session_token(identity)
        response = RedirectResponse(
            url=settings.SSO_RETURN_URL, status_code=status.HTTP_303_SEE_OTHER
        )
        _set_session_cookie(response, token)
        return response
    url = await InitSsoLogin(sso).execute(settings.SSO_RETURN_URL)
    return RedirectResponse(url=url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.post("/callback")
async def sso_callback(
    sso: Annotated[SsoVerifier, Depends(sso_verifier_dep)],
    user_repo: Annotated[UserRepository, Depends(user_repository_dep)],
    code: Annotated[str, Form()],
    id_token: Annotated[str, Form()],
    state: Annotated[str, Form()] = "",
) -> RedirectResponse:
    # IdP Hybrid Flow form_post: code + id_token + state 를 본문(form)으로 받는다.
    # redirect_uri(real init_login) 와 IdP 등록 redirect_uri 가 이 경로와 일치해야 한다.
    identity = await CompleteSsoLogin(sso, user_repo).execute(code, id_token, state)
    token = await sso.create_session_token(identity)
    response = RedirectResponse(
        url=settings.SSO_RETURN_URL, status_code=status.HTTP_303_SEE_OTHER
    )
    _set_session_cookie(response, token)
    return response


@router.get("/session")
async def get_session(
    pholex_session: Annotated[str | None, Cookie(alias=settings.SESSION_COOKIE_NAME)] = None,
    sso: SsoVerifier = Depends(sso_verifier_dep),
) -> dict:
    if not pholex_session:
        return {"authenticated": False, "user": None}
    try:
        identity = await VerifySessionToken(sso).execute(pholex_session)
    except PermissionError:
        return {"authenticated": False, "user": None}
    return {
        "authenticated": True,
        "user": {
            "employee_number": identity.employee_number,
            "username": identity.username,
            "email": identity.email,
            "auth": identity.auth_level,
        },
    }


@router.post("/logout")
async def logout(response: Response) -> dict:
    response.delete_cookie(key=settings.SESSION_COOKIE_NAME, path="/")
    return {"ok": True}
