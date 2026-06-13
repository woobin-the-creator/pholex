from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import create_app

_CFG = {"groups": [{"conditions": [{"field": "equipment", "value": "ETCH"}]}]}


@pytest.fixture
def client() -> TestClient:
    return TestClient(create_app())


def _authed(client: TestClient) -> TestClient:
    client.cookies.set(settings.SESSION_COOKIE_NAME, settings.DEV_USER_EMPLOYEE_NUMBER)
    return client


def test_list_requires_session(client):
    assert client.get("/api/keyword-presets").status_code == 401


def test_create_list_update_delete_roundtrip(client):
    c = _authed(client)
    assert c.get("/api/keyword-presets").json()["presets"] == []

    r = c.post("/api/keyword-presets", json={"name": "p1", "config": _CFG, "isDefault": True})
    assert r.status_code == 200
    created = r.json()
    pid = created["id"]
    assert created["name"] == "p1" and created["isDefault"] is True

    listed = c.get("/api/keyword-presets").json()["presets"]
    assert [p["id"] for p in listed] == [pid]

    u = c.put(f"/api/keyword-presets/{pid}", json={"name": "p1b", "config": _CFG})
    assert u.status_code == 200 and u.json()["name"] == "p1b"

    assert c.delete(f"/api/keyword-presets/{pid}").status_code == 204
    assert c.get("/api/keyword-presets").json()["presets"] == []


def test_create_rejects_invalid_config(client):
    bad = {"groups": [{"conditions": [{"field": "nope", "value": "x"}]}]}
    r = _authed(client).post("/api/keyword-presets", json={"name": "p", "config": bad})
    assert r.status_code == 422


def test_update_missing_returns_404(client):
    r = _authed(client).put("/api/keyword-presets/999", json={"name": "p", "config": _CFG})
    assert r.status_code == 404
