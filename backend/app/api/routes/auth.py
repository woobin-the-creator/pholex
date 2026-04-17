from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db_session
from app.core.auth import (
    AuthError,
    build_authorize_url,
    build_dev_claims,
    build_nonce,
    validate_id_token,
)
from app.models.user import User
from app.schemas.auth import SessionResponse, SessionUser


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["auth"])


async def upsert_user(session: AsyncSession, claims) -> SessionUser:
    result = await session.execute(select(User).where(User.employee_id == claims.employee_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            employee_id=claims.employee_id,
            employee_number=claims.employee_number,
            username=claims.username,
            email=claims.email,
            auth=claims.auth,
        )
        session.add(user)
    else:
        user.employee_number = claims.employee_number
        user.username = claims.username
        user.email = claims.email
        user.auth = claims.auth
    await session.flush()
    await session.commit()
    await session.refresh(user)
    return SessionUser(
        id=user.id,
        employee_id=user.employee_id,
        employee_number=user.employee_number,
        username=user.username,
        email=user.email,
        auth=user.auth,
    )


def apply_session_cookie(response: Response, session_id: str, request: Request) -> None:
    settings = request.app.state.settings
    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_id,
        httponly=True,
        samesite="lax",
        secure=settings.cookie_secure,
        path="/",
        max_age=settings.session_ttl_seconds,
    )


@router.get("/sso/init")
async def sso_init(request: Request, session: AsyncSession = Depends(get_db_session)) -> Response:
    settings = request.app.state.settings
    if settings.dev_sso_bypass:
        claims = build_dev_claims(settings)
        user = await upsert_user(session, claims)
        stored_session = await request.app.state.session_store.create_session(
            user,
            settings.session_ttl_seconds,
        )
        response = RedirectResponse("/", status_code=302)
        apply_session_cookie(response, stored_session.session_id, request)
        logger.info("auth_bootstrap", extra={"event": "auth_bootstrap", "outcome": "dev_bypass"})
        return response

    nonce = build_nonce()
    await request.app.state.session_store.store_nonce(nonce, 300)
    return RedirectResponse(build_authorize_url(nonce, settings), status_code=302)


@router.post("/sso/callback")
async def sso_callback(
    request: Request,
    id_token: str = Form(...),
    nonce: str = Form(...),
    session: AsyncSession = Depends(get_db_session),
) -> Response:
    if not await request.app.state.session_store.consume_nonce(nonce):
        raise HTTPException(status_code=400, detail="Invalid nonce")
    try:
        claims = validate_id_token(id_token, expected_nonce=nonce, settings=request.app.state.settings)
    except AuthError as exc:
        logger.warning(
            "oidc_validation_failed",
            extra={"event": "oidc_validation_failed", "reason": str(exc)},
        )
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    user = await upsert_user(session, claims)
    stored_session = await request.app.state.session_store.create_session(
        user,
        request.app.state.settings.session_ttl_seconds,
    )
    response = RedirectResponse("/", status_code=302)
    apply_session_cookie(response, stored_session.session_id, request)
    return response


@router.get("/session", response_model=SessionResponse)
async def session_info(user: SessionUser = Depends(get_current_user)) -> SessionResponse:
    return SessionResponse(authenticated=True, user=user)


@router.post("/logout")
async def logout(request: Request) -> Response:
    session_id = request.cookies.get(request.app.state.settings.session_cookie_name)
    if session_id:
        await request.app.state.session_store.delete_session(session_id)
        logger.info("session_deleted", extra={"event": "session_deleted", "session_id": session_id})
    response = Response(status_code=200)
    response.delete_cookie(request.app.state.settings.session_cookie_name, path="/")
    return response

