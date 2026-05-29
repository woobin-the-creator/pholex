"""Async engine singleton for the Postgres-backed fake source.

엔진은 프로세스당 하나만 만든다. 요청마다 `create_async_engine`을 부르면 connection
pool이 매번 새로 생겨 고갈되고 504로 이어진다 (사내 real adapter의 S2 장애 원인).
사내 AI가 real/_engine.py에 그대로 미러링할 reference 구조다.
"""

from __future__ import annotations

from functools import lru_cache

from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine

from app.config import settings


@lru_cache(maxsize=1)
def get_engine() -> AsyncEngine:
    return create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)


async def dispose_engine() -> None:
    """테스트/종료 시 pool 정리. 다음 get_engine 호출은 새 엔진을 만든다."""
    engine = get_engine()
    get_engine.cache_clear()
    await engine.dispose()
