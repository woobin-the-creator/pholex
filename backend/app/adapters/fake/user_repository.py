from __future__ import annotations

from app.ports.dto import UserRecordDTO


class InMemoryUserRepository:
    """Fake UserRepository — employee_id 키 인메모리 dict.

    dev/test에서 SSO 프로비저닝이 동작하는 것처럼 보이게 하되 실제 DB는 쓰지 않는다.
    """

    def __init__(self) -> None:
        self._users: dict[str, UserRecordDTO] = {}

    async def upsert(self, user: UserRecordDTO) -> None:
        self._users[user.employee_number] = user
