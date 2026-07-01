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
    # [Phase 2] email 로컬파트(split '@')가 "내 hold" 매칭 AD id다(operator_ad_id). golden
    # dataset의 뷰어 AD id(gd01.hong)와 일치시켜야 통합테스트가 3건을 집계한다(CONTRACT-1).
    DEV_USER_EMAIL: str = "gd01.hong@pholex.local"
    DEV_USER_AUTH_LEVEL: Literal["ENGINEER", "ADMIN"] = "ENGINEER"

    # ── SSO (real adapter) — IdP/세션. 값은 .env(.prod)로 주입(커밋 금지) ──
    IDP_LOGIN_URL: str = ""
    IDP_LOGOUT_URL: str = ""
    IDP_CLIENT_ID: str = ""
    IDP_JWKS_URI: str = ""
    SSO_CERT_PATH: str = ""        # IdP id_token RS256 검증용 공개 인증서 경로
    APP_BASE_URL: str = ""         # redirect_uri 구성 기준 (예: https://pholex.사내:10004)

    # 세션 쿠키 토큰 = 서명 JWT (real). dev는 plain(사번).
    JWT_SECRET: str = "dev-insecure-change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 180

    # IdP는 권한 claim을 주지 않음 → 이 이메일들만 ADMIN 으로 승격 (콤마 구분)
    ADMIN_EMAILS: str = ""

    @property
    def cors_origins_list(self) -> list[str]:
        if not self.CORS_ORIGINS:
            return []
        return [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]


settings = Settings()
