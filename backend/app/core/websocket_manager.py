from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from dataclasses import dataclass, field
from typing import Any

from fastapi import WebSocket
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.schemas.auth import SessionUser
from app.services.cache_service import CacheService
from app.services.lot_service import LotService


logger = logging.getLogger(__name__)


@dataclass(eq=False)
class ConnectionState:
    websocket: WebSocket
    user: SessionUser
    subscriptions: set[int] = field(default_factory=set)
    poll_task: asyncio.Task[None] | None = None
    last_payload_signature: str | None = None


class WebSocketManager:
    def __init__(
        self,
        *,
        session_factory: async_sessionmaker,
        lot_service: LotService,
        cache_service: CacheService,
        poll_interval: float,
    ) -> None:
        self._session_factory = session_factory
        self._lot_service = lot_service
        self._cache_service = cache_service
        self._poll_interval = poll_interval
        self._connections: set[ConnectionState] = set()

    async def register(self, websocket: WebSocket, user: SessionUser) -> ConnectionState:
        await websocket.accept()
        state = ConnectionState(websocket=websocket, user=user)
        self._connections.add(state)
        return state

    async def reject(self, websocket: WebSocket, code: int = 1008) -> None:
        await websocket.accept()
        await websocket.close(code=code)
        logger.info("ws_rejected", extra={"event": "ws_rejected", "code": code})

    async def subscribe(self, connection: ConnectionState, table_id: int) -> None:
        if table_id != 1:
            return
        connection.subscriptions.add(table_id)
        await self._send_update(connection, force_refresh=True)
        if connection.poll_task is None:
            connection.poll_task = asyncio.create_task(self._poll(connection))

    async def unsubscribe(self, connection: ConnectionState, table_id: int) -> None:
        connection.subscriptions.discard(table_id)
        if not connection.subscriptions and connection.poll_task is not None:
            connection.poll_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await connection.poll_task
            connection.poll_task = None

    async def refresh(self, connection: ConnectionState, table_id: int) -> None:
        logger.info("ws_refresh", extra={"event": "ws_refresh", "tableId": table_id})
        await self._send_update(connection, force_refresh=True)

    async def send_heartbeat_ack(self, connection: ConnectionState) -> None:
        await connection.websocket.send_json({"type": "heartbeat_ack"})

    async def disconnect(self, connection: ConnectionState) -> None:
        if connection.poll_task is not None:
            connection.poll_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await connection.poll_task
        self._connections.discard(connection)

    async def shutdown(self) -> None:
        for connection in list(self._connections):
            await self.disconnect(connection)

    async def _poll(self, connection: ConnectionState) -> None:
        try:
            while connection.subscriptions:
                await asyncio.sleep(self._poll_interval)
                await self._send_update(connection, force_refresh=True)
        except asyncio.CancelledError:  # pragma: no cover - lifecycle cleanup
            raise

    async def _send_update(
        self,
        connection: ConnectionState,
        *,
        force_refresh: bool,
    ) -> None:
        async with self._session_factory() as session:
            payload = await self._lot_service.get_my_hold_payload(
                session,
                connection.user,
                cache_service=self._cache_service,
                force_refresh=force_refresh,
            )
        signature = json.dumps(
            payload.model_dump(mode="json", by_alias=True),
            sort_keys=True,
            ensure_ascii=False,
        )
        if signature == connection.last_payload_signature:
            return
        connection.last_payload_signature = signature
        logger.info(
            "table_update",
            extra={
                "event": "table_update",
                "tableId": 1,
                "row_count": len(payload.rows),
            },
        )
        await connection.websocket.send_json(
            {"type": "table_update", "payload": payload.model_dump(by_alias=True, mode="json")}
        )
