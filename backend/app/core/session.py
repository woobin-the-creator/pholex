from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Protocol
from uuid import uuid4

from app.db.redis import create_redis_client
from app.schemas.auth import SessionUser


@dataclass(slots=True)
class StoredSession:
    session_id: str
    user: SessionUser


class SessionStore(Protocol):
    async def create_session(self, user: SessionUser, ttl_seconds: int) -> StoredSession: ...
    async def get_session(self, session_id: str) -> SessionUser | None: ...
    async def delete_session(self, session_id: str) -> None: ...
    async def store_nonce(self, nonce: str, ttl_seconds: int) -> None: ...
    async def consume_nonce(self, nonce: str) -> bool: ...
    async def close(self) -> None: ...


class InMemorySessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, str] = {}
        self._nonces: set[str] = set()

    async def create_session(self, user: SessionUser, ttl_seconds: int) -> StoredSession:
        del ttl_seconds
        session_id = str(uuid4())
        self._sessions[session_id] = user.model_dump_json()
        return StoredSession(session_id=session_id, user=user)

    async def get_session(self, session_id: str) -> SessionUser | None:
        raw = self._sessions.get(session_id)
        if raw is None:
            return None
        return SessionUser.model_validate_json(raw)

    async def delete_session(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    async def store_nonce(self, nonce: str, ttl_seconds: int) -> None:
        del ttl_seconds
        self._nonces.add(nonce)

    async def consume_nonce(self, nonce: str) -> bool:
        if nonce not in self._nonces:
            return False
        self._nonces.remove(nonce)
        return True

    async def close(self) -> None:
        return None


class RedisSessionStore:
    def __init__(self, redis_url: str) -> None:
        self._client = create_redis_client(redis_url)

    async def create_session(self, user: SessionUser, ttl_seconds: int) -> StoredSession:
        session_id = str(uuid4())
        await self._client.setex(
            f"session:{session_id}",
            ttl_seconds,
            user.model_dump_json(),
        )
        return StoredSession(session_id=session_id, user=user)

    async def get_session(self, session_id: str) -> SessionUser | None:
        raw = await self._client.get(f"session:{session_id}")
        if raw is None:
            return None
        return SessionUser.model_validate_json(raw)

    async def delete_session(self, session_id: str) -> None:
        await self._client.delete(f"session:{session_id}")

    async def store_nonce(self, nonce: str, ttl_seconds: int) -> None:
        await self._client.setex(f"nonce:{nonce}", ttl_seconds, "1")

    async def consume_nonce(self, nonce: str) -> bool:
        key = f"nonce:{nonce}"
        if await self._client.get(key) is None:
            return False
        await self._client.delete(key)
        return True

    async def close(self) -> None:
        await self._client.aclose()


def create_session_store(session_backend: str, redis_url: str) -> SessionStore:
    if session_backend == "memory":
        return InMemorySessionStore()
    return RedisSessionStore(redis_url)

