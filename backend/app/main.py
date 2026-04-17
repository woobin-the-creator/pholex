from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

from fastapi import FastAPI
from fastapi.exceptions import HTTPException
from fastapi.responses import JSONResponse

from app.api.routes.auth import router as auth_router
from app.api.routes.lots import router as lots_router
from app.api.routes.ws import router as ws_router
from app.config import Settings
from app.core.session import create_session_store
from app.core.websocket_manager import WebSocketManager
from app.db.database import create_engine_and_session_factory
from app.models.base import Base
from app.services.cache_service import CacheService
from app.services.lot_service import LotService


logging.basicConfig(level=logging.INFO)


def create_app(overrides: Optional[Dict[str, Any]] = None) -> FastAPI:
    settings = Settings.from_env(overrides)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine, session_factory = create_engine_and_session_factory(settings)
        app.state.settings = settings
        app.state.engine = engine
        app.state.session_factory = session_factory
        app.state.session_store = create_session_store(settings.session_backend, settings.redis_url)
        app.state.cache_service = CacheService(settings.cache_ttl_seconds)
        app.state.lot_service = LotService()
        app.state.websocket_manager = WebSocketManager(
            session_factory=session_factory,
            lot_service=app.state.lot_service,
            cache_service=app.state.cache_service,
            poll_interval=settings.ws_poll_interval,
        )

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

        yield

        await app.state.websocket_manager.shutdown()
        await app.state.session_store.close()
        await engine.dispose()

    app = FastAPI(title=settings.app_name, lifespan=lifespan)
    app.include_router(auth_router)
    app.include_router(lots_router)
    app.include_router(ws_router)

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.exception_handler(HTTPException)
    async def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    return app


app = create_app()
