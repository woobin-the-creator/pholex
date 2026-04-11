from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, Request, WebSocket
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.auth import SessionUser


async def get_db_session(request: Request) -> AsyncSession:
    async with request.app.state.session_factory() as session:
        yield session


async def get_current_user(request: Request) -> SessionUser:
    session_id = request.cookies.get(request.app.state.settings.session_cookie_name)
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = await request.app.state.session_store.get_session(session_id)
    if user is None:
        raise HTTPException(status_code=401, detail="Not authenticated")

    async with request.app.state.session_factory() as session:
        result = await session.execute(
            select(User).where(User.employee_id == user.employee_id)
        )
        db_user = result.scalar_one_or_none()
        if db_user is None:
            await request.app.state.session_store.delete_session(session_id)
            raise HTTPException(status_code=401, detail="Not authenticated")

        return SessionUser(
            id=db_user.id,
            employee_id=db_user.employee_id,
            employee_number=db_user.employee_number,
            username=db_user.username,
            email=db_user.email,
            auth=db_user.auth,
        )


async def get_current_user_from_websocket(websocket: WebSocket) -> Optional[SessionUser]:
    session_id = websocket.cookies.get(websocket.app.state.settings.session_cookie_name)
    if not session_id:
        return None
    return await websocket.app.state.session_store.get_session(session_id)
