from __future__ import annotations

from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status

from app.config import settings
from app.di.container import (
    get_clock,
    get_lot_repository,
    get_lot_source,
    get_mail_sender,
    get_sso_verifier,
    get_unit_of_work,
    get_user_repository,
)
from app.domain.session import SessionUser
from app.ports.clock import Clock
from app.ports.lot_repository import LotRepository
from app.ports.lot_source import LotSource
from app.ports.mail_sender import MailSender
from app.ports.sso_verifier import SsoVerifier
from app.ports.unit_of_work import UnitOfWork
from app.ports.user_repository import UserRepository
from app.usecases.fetch_my_holds import FetchMyHolds
from app.usecases.sso import VerifySessionToken
from app.usecases.stream_hold_changes import StreamHoldChanges


def lot_source_dep() -> LotSource:
    return get_lot_source()


def lot_repository_dep() -> LotRepository:
    return get_lot_repository()


def mail_sender_dep() -> MailSender:
    return get_mail_sender()


def sso_verifier_dep() -> SsoVerifier:
    return get_sso_verifier()


def unit_of_work_dep() -> UnitOfWork:
    return get_unit_of_work()


def user_repository_dep() -> UserRepository:
    return get_user_repository()


def clock_dep() -> Clock:
    return get_clock()


def fetch_my_holds_uc(
    source: Annotated[LotSource, Depends(lot_source_dep)],
    repo: Annotated[LotRepository, Depends(lot_repository_dep)],
    uow: Annotated[UnitOfWork, Depends(unit_of_work_dep)],
) -> FetchMyHolds:
    return FetchMyHolds(source=source, repo=repo, uow=uow)


def stream_hold_changes_uc(
    source: Annotated[LotSource, Depends(lot_source_dep)],
    repo: Annotated[LotRepository, Depends(lot_repository_dep)],
) -> StreamHoldChanges:
    return StreamHoldChanges(source=source, repo=repo)


def verify_session_uc(
    sso: Annotated[SsoVerifier, Depends(sso_verifier_dep)],
) -> VerifySessionToken:
    return VerifySessionToken(sso)


async def require_session(
    pholex_session: Annotated[str | None, Cookie(alias=settings.SESSION_COOKIE_NAME)] = None,
    verify_uc: VerifySessionToken = Depends(verify_session_uc),
) -> SessionUser:
    if not pholex_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No session cookie")
    try:
        return await verify_uc.execute(pholex_session)
    except PermissionError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
