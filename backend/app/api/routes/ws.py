from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import get_current_user_from_websocket


router = APIRouter(tags=["ws"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    user = await get_current_user_from_websocket(websocket)
    manager = websocket.app.state.websocket_manager
    if user is None:
        await manager.reject(websocket, code=1008)
        return

    connection = await manager.register(websocket, user)
    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type")
            payload = message.get("payload", {})
            if message_type == "subscribe":
                await manager.subscribe(connection, int(payload.get("tableId", 0)))
            elif message_type == "unsubscribe":
                await manager.unsubscribe(connection, int(payload.get("tableId", 0)))
            elif message_type == "refresh":
                await manager.refresh(connection, int(payload.get("tableId", 0)))
            elif message_type == "heartbeat":
                await manager.send_heartbeat_ack(connection)
    except WebSocketDisconnect:
        await manager.disconnect(connection)

