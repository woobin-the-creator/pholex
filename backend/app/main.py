from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import auth as auth_router
from app.api import lots as lots_router
from app.api import ws as ws_router
from app.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # DI is lazy via lru_cache; nothing to initialize eagerly in Fake mode.
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Pholex Backend", version="0.1.0", lifespan=lifespan)

    origins = settings.cors_origins_list
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    app.include_router(auth_router.router)
    app.include_router(lots_router.router)
    app.include_router(ws_router.router)

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "adapter_mode": settings.ADAPTER_MODE}

    return app


app = create_app()
