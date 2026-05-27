from __future__ import annotations


class InMemoryUnitOfWork:
    """Fake UnitOfWork — no-op context (no real transaction)."""

    async def __aenter__(self) -> "InMemoryUnitOfWork":
        return self

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None:
        if exc_type is not None:
            await self.rollback()

    async def commit(self) -> None:
        return None

    async def rollback(self) -> None:
        return None
