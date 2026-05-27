from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class AuthLevel(StrEnum):
    ENGINEER = "ENGINEER"
    ADMIN = "ADMIN"


@dataclass(frozen=True, slots=True)
class SessionUser:
    employee_number: str
    username: str
    email: str
    auth_level: AuthLevel
