from __future__ import annotations

import os

import pytest

from app.adapters.fake.keyword_preset_repository import InMemoryKeywordPresetRepository
from app.adapters.fake.lot_repository import InMemoryLotRepository
from app.adapters.fake.lot_source import InMemoryLotSource
from app.adapters.fake.lot_watchlist_repository import InMemoryLotWatchlistRepository
from app.adapters.fake.mail_sender import LogMailSender
from app.adapters.fake.sso_verifier import DevSsoVerifier
from app.ports.keyword_preset_repository import KeywordPresetRepository
from app.ports.lot_repository import LotRepository
from app.ports.lot_source import LotSource
from app.ports.lot_watchlist_repository import LotWatchlistRepository
from app.ports.mail_sender import MailSender
from app.ports.sso_verifier import SsoVerifier


# Contract tests are parameterized to run against Fake adapters only in Claude's repo.
# 사내 AI는 이 conftest를 수정해 ["fake", "real"]로 확장하고 fixture를 추가한다.
#
# "pg"는 로컬 20k mock(PgSampleLotSource) 검증용. Postgres가 필요하므로 기본 off이고,
# 컨테이너 + seed 준비 후 PHOLEX_TEST_PG=1 로 켠다. CI 기본 게이트는 "fake"만 돈다.
ADAPTER_PARAMS = ["fake"]
if os.getenv("PHOLEX_TEST_PG") == "1":
    ADAPTER_PARAMS.append("pg")


@pytest.fixture(autouse=True)
async def _dispose_pg_engine_per_test():
    """pytest-asyncio는 test마다 새 event loop을 만든다. lru_cache engine singleton이
    이전 loop에 묶이면 'Event loop is closed'가 난다 (운영 단일 loop에선 없는 문제).
    각 test 후 engine을 dispose해 다음 test가 자기 loop에서 새로 만들게 한다."""
    yield
    from app.adapters.fake.pg_engine import dispose_engine, get_engine

    if get_engine.cache_info().currsize:
        await dispose_engine()


@pytest.fixture(params=ADAPTER_PARAMS)
def lot_source(request) -> LotSource:
    if request.param == "fake":
        return InMemoryLotSource()
    if request.param == "pg":
        from app.adapters.fake.pg_lot_source import PgSampleLotSource

        return PgSampleLotSource()
    raise NotImplementedError(f"Adapter '{request.param}' not configured in this repo")


@pytest.fixture(params=ADAPTER_PARAMS)
def lot_repository(request) -> LotRepository:
    if request.param == "fake":
        return InMemoryLotRepository()
    raise NotImplementedError(f"Adapter '{request.param}' not configured in this repo")


@pytest.fixture(params=ADAPTER_PARAMS)
def lot_watchlist_repository(request) -> LotWatchlistRepository:
    if request.param == "fake":
        return InMemoryLotWatchlistRepository()
    raise NotImplementedError(f"Adapter '{request.param}' not configured in this repo")


@pytest.fixture(params=ADAPTER_PARAMS)
def mail_sender(request) -> MailSender:
    if request.param == "fake":
        return LogMailSender()
    raise NotImplementedError(f"Adapter '{request.param}' not configured in this repo")


@pytest.fixture(params=ADAPTER_PARAMS)
def sso_verifier(request) -> SsoVerifier:
    if request.param == "fake":
        return DevSsoVerifier()
    raise NotImplementedError(f"Adapter '{request.param}' not configured in this repo")


@pytest.fixture(params=ADAPTER_PARAMS)
def keyword_preset_repository(request) -> KeywordPresetRepository:
    if request.param == "fake":
        return InMemoryKeywordPresetRepository()
    raise NotImplementedError(f"Adapter '{request.param}' not configured in this repo")
