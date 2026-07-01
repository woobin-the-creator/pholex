from __future__ import annotations

import asyncio
import contextlib
import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status

from app.api.deps import (
    clock_dep,
    fetch_my_holds_uc,
    lot_repository_dep,
    lot_source_dep,
    sso_verifier_dep,
    unit_of_work_dep,
    verify_session_uc,
)
from app.api.lots import TABLE_ID_MY_HOLD
from app.api.wire import change_to_wire, slot_payload
from app.config import settings
from app.domain.identity import operator_ad_id_of
from app.ports.clock import Clock
from app.ports.lot_repository import LotRepository
from app.ports.lot_source import LotSource
from app.ports.sso_verifier import SsoVerifier
from app.ports.unit_of_work import UnitOfWork
from app.usecases.fetch_my_holds import FetchMyHolds
from app.usecases.sso import VerifySessionToken
from app.usecases.stream_hold_changes import StreamHoldChanges


router = APIRouter()
logger = logging.getLogger(__name__)


async def _send_full_snapshot(
    ws: WebSocket,
    *,
    operator_ad_id: str,
    source: LotSource,
    repo: LotRepository,
    uow: UnitOfWork,
    clock: Clock,
) -> None:
    fetch_uc = FetchMyHolds(source=source, repo=repo, uow=uow)
    result = await fetch_uc.execute(operator_ad_id, force_refresh=True)
    payload = slot_payload(
        table_id=TABLE_ID_MY_HOLD,
        rows=result.rows,
        diff=False,
        last_updated=clock.now(),
        last_run_at=result.last_run_at,
    )
    await ws.send_json({"type": "table_update", "payload": payload})


async def _stream_changes(
    ws: WebSocket,
    *,
    operator_ad_id: str,
    source: LotSource,
    repo: LotRepository,
    uow: UnitOfWork,
    clock: Clock,
) -> None:
    stream_uc = StreamHoldChanges(source=source, repo=repo)
    iterator = stream_uc.execute(operator_ad_id)
    try:
        async for envelope in iterator:
            try:
                await ws.send_json(change_to_wire(envelope))
            except (WebSocketDisconnect, RuntimeError):
                return
            if envelope.event.change_type != "comment":
                try:
                    await _send_full_snapshot(
                        ws,
                        operator_ad_id=operator_ad_id,
                        source=source,
                        repo=repo,
                        uow=uow,
                        clock=clock,
                    )
                except (WebSocketDisconnect, RuntimeError):
                    return
    finally:
        # Force the underlying AsyncIterator to run its finally (unsubscribe).
        with contextlib.suppress(Exception):
            await iterator.aclose()


@router.websocket("/ws")
async def ws_endpoint(
    ws: WebSocket,
    sso: Annotated[SsoVerifier, Depends(sso_verifier_dep)],
    source: Annotated[LotSource, Depends(lot_source_dep)],
    repo: Annotated[LotRepository, Depends(lot_repository_dep)],
    uow: Annotated[UnitOfWork, Depends(unit_of_work_dep)],
    clock: Annotated[Clock, Depends(clock_dep)],
) -> None:
    token = ws.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    try:
        user = await VerifySessionToken(sso).execute(token)
    except PermissionError:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    # [Phase 2] "내 hold" 매칭 키 = email 로컬파트(AD id). 사번이 아니다(CONTRACT-1).
    operator_ad_id = operator_ad_id_of(user)

    await ws.accept()
    streamer_task: asyncio.Task[None] | None = None

    try:
        while True:
            try:
                message: dict[str, Any] = await ws.receive_json()
            except WebSocketDisconnect:
                break

            msg_type = message.get("type")
            if msg_type == "subscribe":
                await _send_full_snapshot(
                    ws,
                    operator_ad_id=operator_ad_id,
                    source=source,
                    repo=repo,
                    uow=uow,
                    clock=clock,
                )
                if streamer_task is None or streamer_task.done():
                    streamer_task = asyncio.create_task(
                        _stream_changes(
                            ws,
                            operator_ad_id=operator_ad_id,
                            source=source,
                            repo=repo,
                            uow=uow,
                            clock=clock,
                        )
                    )
            elif msg_type == "refresh":
                await _send_full_snapshot(
                    ws,
                    operator_ad_id=operator_ad_id,
                    source=source,
                    repo=repo,
                    uow=uow,
                    clock=clock,
                )
            else:
                logger.debug("ignored ws message type=%s", msg_type)
    finally:
        if streamer_task is not None and not streamer_task.done():
            streamer_task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await streamer_task
