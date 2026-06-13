from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.di import container as di
from app.main import create_app
from app.ports.dto import LotRowDTO

_CFG = {"groups": [{"conditions": [{"field": "equipment", "value": "ETCH"}]}]}


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def _authed(client: TestClient) -> TestClient:
    client.cookies.set(settings.SESSION_COOKIE_NAME, settings.DEV_USER_EMPLOYEE_NUMBER)
    return client


def _seed_lot(lot_id: str, *, equipment: str | None = None, status: str = "Active") -> None:
    # 요청이 읽는 것과 동일한 lot_repository 싱글톤(lru_cache)에 직접 적재.
    # InMemory는 순수 dict 연산이라 별도 loop에서 적재해도 안전.
    repo = di.get_lot_repository()
    row = LotRowDTO(
        lot_id=lot_id,
        status=status,
        equipment=equipment,
        process_step=None,
        hold_comment=None,
        updated_at=datetime.now(tz=timezone.utc),
        is_held_by_me=False,
    )
    asyncio.run(repo.upsert_lot(row))


def test_search_requires_session(client):
    assert client.post("/api/special-hold/search", json={"config": _CFG}).status_code == 401


def test_search_empty_when_no_data(client):
    r = _authed(client).post("/api/special-hold/search", json={"config": _CFG})
    assert r.status_code == 200
    body = r.json()
    assert body["tableId"] == 5
    assert body["rows"] == [] and body["total"] == 0


def test_search_returns_matches(client):
    _seed_lot("L1", equipment="ETCH-01")
    _seed_lot("L2", equipment="CVD-02")
    r = _authed(client).post("/api/special-hold/search", json={"config": _CFG, "pageSize": 100})
    assert r.status_code == 200
    body = r.json()
    assert [row["lotId"] for row in body["rows"]] == ["L1"]
    assert body["total"] == 1


def test_search_invalid_config_422(client):
    r = _authed(client).post("/api/special-hold/search", json={"config": {"groups": "bad"}})
    assert r.status_code == 422
