from __future__ import annotations

import pytest

from app.adapters.fake.lot_repository import InMemoryLotRepository
from app.adapters.fake.lot_source import InMemoryLotSource
from app.adapters.fake.mail_sender import LogMailSender
from app.adapters.fake.sso_verifier import DevSsoVerifier
from app.ports.lot_repository import LotRepository
from app.ports.lot_source import LotSource
from app.ports.mail_sender import MailSender
from app.ports.sso_verifier import SsoVerifier


# Contract tests are parameterized to run against Fake adapters only in Claude's repo.
# 사내 AI는 이 conftest를 수정해 ["fake", "real"]로 확장하고 fixture를 추가한다.
ADAPTER_PARAMS = ["fake"]


@pytest.fixture(params=ADAPTER_PARAMS)
def lot_source(request) -> LotSource:
    if request.param == "fake":
        return InMemoryLotSource()
    raise NotImplementedError(f"Adapter '{request.param}' not configured in this repo")


@pytest.fixture(params=ADAPTER_PARAMS)
def lot_repository(request) -> LotRepository:
    if request.param == "fake":
        return InMemoryLotRepository()
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
