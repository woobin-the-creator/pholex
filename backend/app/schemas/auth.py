from __future__ import annotations

from pydantic import BaseModel


class SessionUser(BaseModel):
    id: int | None = None
    employee_id: str
    employee_number: str | None = None
    username: str
    email: str | None = None
    auth: str = "ENGINEER"


class SessionResponse(BaseModel):
    authenticated: bool
    user: SessionUser | None = None

