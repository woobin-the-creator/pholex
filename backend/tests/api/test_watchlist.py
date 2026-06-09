from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def _authed(client: TestClient) -> TestClient:
    client.cookies.set(settings.SESSION_COOKIE_NAME, settings.DEV_USER_EMPLOYEE_NUMBER)
    return client


def test_get_requires_session(client):
    assert client.get("/api/watchlist").status_code == 401


def test_post_requires_session(client):
    assert client.post("/api/watchlist", json={"lotIds": ["L1"]}).status_code == 401


def test_get_empty_initially(client):
    r = _authed(client).get("/api/watchlist")
    assert r.status_code == 200
    payload = r.json()
    assert payload["tableId"] == 2
    assert payload["rows"] == []
    assert payload["lastUpdated"]


def test_save_then_get_roundtrip(client):
    c = _authed(client)
    r = c.post("/api/watchlist", json={"lotIds": ["L2", "L1", "  ", "L2"]})
    assert r.status_code == 200
    payload = r.json()
    assert payload["tableId"] == 2
    # dedupe + drop empty/whitespace, input order preserved
    assert [row["lotId"] for row in payload["rows"]] == ["L2", "L1"]
    # GET returns the same persisted list
    g = _authed(client).get("/api/watchlist")
    assert [row["lotId"] for row in g.json()["rows"]] == ["L2", "L1"]


def test_unknown_lot_is_pending(client):
    c = _authed(client)
    c.post("/api/watchlist", json={"lotIds": ["L-NOTYET"]})
    rows = _authed(client).get("/api/watchlist").json()["rows"]
    assert rows[0]["lotId"] == "L-NOTYET"
    assert rows[0]["found"] is False
    assert rows[0]["status"] is None


def test_save_is_full_replace(client):
    c = _authed(client)
    c.post("/api/watchlist", json={"lotIds": ["L1", "L2"]})
    c.post("/api/watchlist", json={"lotIds": ["L9"]})
    rows = _authed(client).get("/api/watchlist").json()["rows"]
    assert [row["lotId"] for row in rows] == ["L9"]
