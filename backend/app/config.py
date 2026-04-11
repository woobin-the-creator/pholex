from __future__ import annotations

import os
from collections.abc import Mapping
from typing import Any, Optional, Union

from pydantic import BaseModel, ConfigDict


def _as_bool(value: Optional[Union[str, bool]], default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")

    app_name: str = "pholex-backend"
    database_url: str = "sqlite+aiosqlite:///./pholex.db"
    redis_url: str = "redis://localhost:6379/0"
    session_backend: str = "redis"
    session_cookie_name: str = "pholex_sid"
    session_ttl_seconds: int = 14 * 24 * 60 * 60
    cookie_secure: bool = False
    cache_ttl_seconds: int = 5
    ws_poll_interval: float = 1.0

    dev_sso_bypass: bool = False
    dev_sso_user_id: str = "test001"
    dev_sso_username: str = "테스트엔지니어"
    dev_sso_employee_number: str = "99999"
    dev_sso_email: Optional[str] = "test@dev.local"
    dev_sso_auth: str = "ENGINEER"

    sso_idp_entity_id: str = ""
    sso_client_id: str = ""
    sso_base_url: str = "http://localhost:8080"
    sso_cert: str = ""
    sso_employee_id_claim: str = "employee_id"
    sso_employee_number_claim: str = "employee_number"
    sso_username_claim: str = "username"
    sso_email_claim: str = "email"
    sso_auth_claim: str = "auth"

    @classmethod
    def from_env(cls, overrides: Optional[Mapping[str, Any]] = None) -> "Settings":
        data: dict[str, Any] = {
            "database_url": os.getenv("DATABASE_URL", cls.model_fields["database_url"].default),
            "redis_url": os.getenv("REDIS_URL", cls.model_fields["redis_url"].default),
            "session_backend": os.getenv(
                "SESSION_BACKEND",
                cls.model_fields["session_backend"].default,
            ),
            "session_cookie_name": os.getenv(
                "SESSION_COOKIE_NAME",
                cls.model_fields["session_cookie_name"].default,
            ),
            "session_ttl_seconds": int(
                os.getenv(
                    "SESSION_TTL_SECONDS",
                    str(cls.model_fields["session_ttl_seconds"].default),
                )
            ),
            "cookie_secure": _as_bool(
                os.getenv("COOKIE_SECURE"),
                cls.model_fields["cookie_secure"].default,
            ),
            "cache_ttl_seconds": int(
                os.getenv(
                    "CACHE_TTL_SECONDS",
                    str(cls.model_fields["cache_ttl_seconds"].default),
                )
            ),
            "ws_poll_interval": float(
                os.getenv(
                    "WS_POLL_INTERVAL",
                    str(cls.model_fields["ws_poll_interval"].default),
                )
            ),
            "dev_sso_bypass": _as_bool(
                os.getenv("DEV_SSO_BYPASS"),
                cls.model_fields["dev_sso_bypass"].default,
            ),
            "dev_sso_user_id": os.getenv(
                "DEV_SSO_USER_ID",
                cls.model_fields["dev_sso_user_id"].default,
            ),
            "dev_sso_username": os.getenv(
                "DEV_SSO_USERNAME",
                cls.model_fields["dev_sso_username"].default,
            ),
            "dev_sso_employee_number": os.getenv(
                "DEV_SSO_EMPLOYEE_NUMBER",
                cls.model_fields["dev_sso_employee_number"].default,
            ),
            "dev_sso_email": os.getenv(
                "DEV_SSO_EMAIL",
                cls.model_fields["dev_sso_email"].default,
            ),
            "dev_sso_auth": os.getenv(
                "DEV_SSO_AUTH",
                cls.model_fields["dev_sso_auth"].default,
            ),
            "sso_idp_entity_id": os.getenv(
                "SSO_IDP_ENTITY_ID",
                cls.model_fields["sso_idp_entity_id"].default,
            ),
            "sso_client_id": os.getenv(
                "SSO_CLIENT_ID",
                cls.model_fields["sso_client_id"].default,
            ),
            "sso_base_url": os.getenv(
                "SSO_BASE_URL",
                cls.model_fields["sso_base_url"].default,
            ),
            "sso_cert": os.getenv("SSO_CERT", cls.model_fields["sso_cert"].default),
            "sso_employee_id_claim": os.getenv(
                "SSO_EMPLOYEE_ID_CLAIM",
                cls.model_fields["sso_employee_id_claim"].default,
            ),
            "sso_employee_number_claim": os.getenv(
                "SSO_EMPLOYEE_NUMBER_CLAIM",
                cls.model_fields["sso_employee_number_claim"].default,
            ),
            "sso_username_claim": os.getenv(
                "SSO_USERNAME_CLAIM",
                cls.model_fields["sso_username_claim"].default,
            ),
            "sso_email_claim": os.getenv(
                "SSO_EMAIL_CLAIM",
                cls.model_fields["sso_email_claim"].default,
            ),
            "sso_auth_claim": os.getenv(
                "SSO_AUTH_CLAIM",
                cls.model_fields["sso_auth_claim"].default,
            ),
        }
        if overrides:
            data.update(overrides)
        return cls(**data)
