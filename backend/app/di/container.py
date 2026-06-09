from __future__ import annotations

import importlib
from functools import lru_cache

from app.adapters.fake.clock import SystemClock
from app.adapters.fake.lot_repository import InMemoryLotRepository
from app.adapters.fake.lot_source import InMemoryLotSource
from app.adapters.fake.lot_watchlist_repository import InMemoryLotWatchlistRepository
from app.adapters.fake.mail_sender import LogMailSender
from app.adapters.fake.sso_verifier import DevSsoVerifier
from app.adapters.fake.unit_of_work import InMemoryUnitOfWork
from app.adapters.fake.user_repository import InMemoryUserRepository
from app.config import settings
from app.ports.clock import Clock
from app.ports.lot_repository import LotRepository
from app.ports.lot_source import LotSource
from app.ports.lot_watchlist_repository import LotWatchlistRepository
from app.ports.mail_sender import MailSender
from app.ports.sso_verifier import SsoVerifier
from app.ports.unit_of_work import UnitOfWork
from app.ports.user_repository import UserRepository


# Naming convention for Real adapters (사내 AI 합의):
#   app/adapters/real/{module}.py  →  class Real{ClassSuffix}
ADAPTER_NAMING: dict[str, tuple[str, str]] = {
    "LotSource":             ("lot_source",             "LotSource"),
    "LotRepository":         ("lot_repository",         "LotRepository"),
    "LotWatchlistRepository": ("lot_watchlist_repository", "LotWatchlistRepository"),
    "MailSender":            ("mail_sender",            "MailSender"),
    "SsoVerifier":    ("sso_verifier",    "SsoVerifier"),
    "UserRepository": ("user_repository", "UserRepository"),
}


def _load_real(port_name: str):
    mod_name, cls_suffix = ADAPTER_NAMING[port_name]
    mod = importlib.import_module(f"{settings.ADAPTER_REAL_MODULE_PREFIX}.{mod_name}")
    cls = getattr(mod, f"Real{cls_suffix}")
    return cls()


def _is_fake() -> bool:
    return settings.ADAPTER_MODE == "fake"


@lru_cache(maxsize=1)
def get_lot_source() -> LotSource:
    if _is_fake():
        if settings.FAKE_LOT_SOURCE == "postgres":
            from app.adapters.fake.pg_lot_source import PgSampleLotSource

            return PgSampleLotSource()
        return InMemoryLotSource()
    return _load_real("LotSource")


@lru_cache(maxsize=1)
def get_lot_repository() -> LotRepository:
    if _is_fake():
        return InMemoryLotRepository()
    return _load_real("LotRepository")


@lru_cache(maxsize=1)
def get_lot_watchlist_repository() -> LotWatchlistRepository:
    if _is_fake():
        return InMemoryLotWatchlistRepository()
    return _load_real("LotWatchlistRepository")


@lru_cache(maxsize=1)
def get_mail_sender() -> MailSender:
    if _is_fake():
        return LogMailSender()
    return _load_real("MailSender")


@lru_cache(maxsize=1)
def get_sso_verifier() -> SsoVerifier:
    if _is_fake() or settings.DEV_SSO_BYPASS:
        return DevSsoVerifier()
    return _load_real("SsoVerifier")


def get_unit_of_work() -> UnitOfWork:
    """New UoW per request — do not cache.

    Fake mode: in-memory no-op. Real mode: 사내 AI's `RealLotRepository` may expose a
    `unit_of_work()` method that returns a SQLAlchemy session-bound UoW. If it doesn't,
    fall back to no-op (operations still commit per-statement, which is safe for the
    MVP read-heavy workload).
    """
    if _is_fake():
        return InMemoryUnitOfWork()
    repo = get_lot_repository()  # use cached singleton, do not instantiate twice
    factory = getattr(repo, "unit_of_work", None)
    if factory is None:
        return InMemoryUnitOfWork()
    return factory()


@lru_cache(maxsize=1)
def get_user_repository() -> UserRepository:
    if _is_fake():
        return InMemoryUserRepository()
    return _load_real("UserRepository")


@lru_cache(maxsize=1)
def get_clock() -> Clock:
    return SystemClock()


def reset_for_tests() -> None:
    """Clear all lru_cache entries. Tests must call this after mutating settings."""
    get_lot_source.cache_clear()
    get_lot_repository.cache_clear()
    get_lot_watchlist_repository.cache_clear()
    get_mail_sender.cache_clear()
    get_sso_verifier.cache_clear()
    get_user_repository.cache_clear()
    get_clock.cache_clear()
