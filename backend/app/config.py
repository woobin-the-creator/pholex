from __future__ import annotations

from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    ADAPTER_MODE: Literal["fake", "real"] = "fake"
    # fake 모드에서 LotSource 백엔드 선택. "postgres"는 사내 sample 테이블을 모방한
    # 로컬 20k mock(PgSampleLotSource)을 쓴다. "memory"는 golden dataset in-memory.
    FAKE_LOT_SOURCE: Literal["memory", "postgres"] = "memory"
    DEV_SSO_BYPASS: bool = True

    DATABASE_URL: str = "postgresql+asyncpg://pholex:pholex@postgres:5432/pholex"
    REDIS_URL: str = ""
    CORS_ORIGINS: str = ""

    ADAPTER_REAL_MODULE_PREFIX: str = "app.adapters.real"

    SESSION_COOKIE_NAME: str = "pholex_session"
    SESSION_COOKIE_SECURE: bool = False

    SSO_RETURN_URL: str = "/"

    DEV_USER_EMPLOYEE_NUMBER: str = "99999"
    DEV_USER_NAME: str = "테스트 엔지니어"
    DEV_USER_EMAIL: str = "test@pholex.local"
    DEV_USER_AUTH_LEVEL: Literal["ENGINEER", "ADMIN"] = "ENGINEER"

    @property
    def cors_origins_list(self) -> list[str]:
        if not self.CORS_ORIGINS:
            return []
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
