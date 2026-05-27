from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class UnitOfWork(Protocol):
    """트랜잭션 경계 추상화. 사용 패턴:

        async with uow:
            await repo.upsert_lots_batch(rows)
            await uow.commit()
    """

    async def __aenter__(self) -> "UnitOfWork": ...

    async def __aexit__(self, exc_type: object, exc: object, tb: object) -> None: ...

    async def commit(self) -> None: ...

    async def rollback(self) -> None: ...
