from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class SessionUser(BaseModel):
    id: Optional[int] = None
    employee_id: str
    employee_number: Optional[str] = None
    username: str
    email: Optional[str] = None
    auth: str = "ENGINEER"


class SessionResponse(BaseModel):
    authenticated: bool
    user: Optional[SessionUser] = None
