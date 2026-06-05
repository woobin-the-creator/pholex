from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.ports.dto import UserRecordDTO


@runtime_checkable
class UserRepository(Protocol):
    """SSO 로그인 시 사용자 자동 프로비저닝 (자동 등록 + last_login 갱신).

    Real adapter는 Pholex Postgres의 `users` 테이블에 `employee_number`(sabun)를 unique 키로
    INSERT … ON CONFLICT DO UPDATE 한다 (docs/auth.md §3, §5-5). Fake adapter는 인메모리.
    IdP는 별도 고유 ID(sub/oid)를 주지 않으므로 sabun이 유일 식별자다.

    UnitOfWork(트랜잭션 경계)와 분리한다 — users 저장은 lot 캐시와 무관한 별도 관심사다.
    """

    async def upsert(self, user: UserRecordDTO) -> None:
        """employee_number(sabun) 기준 upsert. 신규면 INSERT, 기존이면 last_login 등 갱신."""
        ...
