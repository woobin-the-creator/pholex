from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Optional


@dataclass
class CacheEntry:
    value: Any
    expires_at: float


class CacheService:
    def __init__(self, ttl_seconds: int) -> None:
        self._ttl_seconds = ttl_seconds
        self._entries: dict[str, CacheEntry] = {}

    async def get(self, key: str) -> Optional[Any]:
        entry = self._entries.get(key)
        now = time.monotonic()
        if entry is None or entry.expires_at <= now:
            self._entries.pop(key, None)
            return None
        return entry.value

    async def set(self, key: str, value: Any) -> None:
        self._entries[key] = CacheEntry(
            value=value,
            expires_at=time.monotonic() + self._ttl_seconds,
        )

    async def invalidate(self, key: str) -> None:
        self._entries.pop(key, None)
