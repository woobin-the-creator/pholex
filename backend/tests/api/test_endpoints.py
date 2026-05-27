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


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
    assert r.json()["adapter_mode"] == "fake"


def test_my_hold_requires_session(client):
    r = client.get("/api/lots/my-hold")
    assert r.status_code == 401


def test_my_hold_returns_slot_payload(client):
    r = _authed(client).get("/api/lots/my-hold")
    assert r.status_code == 200
    payload = r.json()
    assert payload["tableId"] == 1
    assert payload["diff"] is False
    assert payload["lastUpdated"]
    assert len(payload["rows"]) == 3
    first = payload["rows"][0]
    assert set(first.keys()) == {"lotId", "status", "equipment", "processStep", "holdComment", "updatedAt"}
    assert all(row["status"] == "hold" for row in payload["rows"])


def test_my_hold_force_refresh(client):
    r = _authed(client).get("/api/lots/my-hold?force_refresh=true")
    assert r.status_code == 200
    assert len(r.json()["rows"]) == 3


def test_session_unauthenticated(client):
    r = client.get("/api/auth/session")
    assert r.status_code == 200
    assert r.json() == {"authenticated": False, "user": None}


def test_session_authenticated(client):
    r = _authed(client).get("/api/auth/session")
    assert r.status_code == 200
    body = r.json()
    assert body["authenticated"] is True
    assert body["user"]["employee_number"] == settings.DEV_USER_EMPLOYEE_NUMBER
    assert body["user"]["auth"] in ("ENGINEER", "ADMIN")


def test_logout(client):
    _authed(client)
    r = client.post("/api/auth/logout", json={})
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_ws_table_update_full_snapshot(client):
    _authed(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "subscribe", "payload": {"tableId": 1}})
        message = ws.receive_json()
        assert message["type"] == "table_update"
        payload = message["payload"]
        assert payload["tableId"] == 1
        assert payload["diff"] is False
        assert len(payload["rows"]) == 3


def test_ws_refresh_returns_snapshot(client):
    _authed(client)
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "subscribe", "payload": {"tableId": 1}})
        ws.receive_json()  # initial snapshot
        ws.send_json({"type": "refresh", "payload": {"tableId": 1}})
        message = ws.receive_json()
        assert message["type"] == "table_update"
        assert len(message["payload"]["rows"]) == 3


def test_ws_rejects_unauthenticated():
    from fastapi.testclient import TestClient as _TC
    from starlette.websockets import WebSocketDisconnect

    c = _TC(create_app())
    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect("/ws"):
            pass
