from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.main import create_app
from app.models.lot import LotStatus
from app.models.user import User
from tests.conftest import run_async


def make_client(tmp_path: Path) -> TestClient:
    db_path = tmp_path / "pholex.db"
    app = create_app(
        {
            "database_url": f"sqlite+aiosqlite:///{db_path}",
            "dev_sso_bypass": True,
            "session_backend": "memory",
            "ws_poll_interval": 0.05,
        }
    )
    return TestClient(app)


def seed_rows(client: TestClient) -> None:
    async def _seed() -> None:
        async with client.app.state.session_factory() as session:
            user = User(
                employee_id="test001",
                employee_number="99999",
                username="테스트엔지니어",
                email="test@dev.local",
                auth="ENGINEER",
            )
            session.add(user)
            session.add_all(
                [
                    LotStatus(
                        lot_id="LOT-HOLD-001",
                        status="hold",
                        equipment="EQ-CVD-01",
                        process_step="CVD-DEPO-10",
                        hold_comment="챔버 압력 이상",
                        hold_operator_id=99999,
                    ),
                    LotStatus(
                        lot_id="LOT-HOLD-OTHER-001",
                        status="hold",
                        equipment="EQ-CMP-01",
                        process_step="CMP-POLISH-3",
                        hold_comment="다른 사용자",
                        hold_operator_id=88888,
                    ),
                    LotStatus(
                        lot_id="LOT-RUN-001",
                        status="run",
                        equipment="EQ-ETCH-01",
                        process_step="ETCH-DRY-12",
                        hold_operator_id=99999,
                    ),
                ]
            )
            await session.commit()

    run_async(_seed())


def test_dev_sso_init_creates_session_and_logout_clears_it(tmp_path: Path) -> None:
    with make_client(tmp_path) as client:
        response = client.get("/api/auth/sso/init", follow_redirects=False)

        assert response.status_code == 302
        assert response.headers["location"] == "/"
        assert "pholex_sid" in response.cookies

        session_response = client.get("/api/auth/session")
        assert session_response.status_code == 200
        assert session_response.json()["authenticated"] is True
        assert session_response.json()["user"]["employee_number"] == "99999"

        logout_response = client.post("/api/auth/logout")
        assert logout_response.status_code == 200

        post_logout_response = client.get("/api/auth/session")
        assert post_logout_response.status_code == 401


def test_my_hold_api_filters_for_logged_in_operator(tmp_path: Path) -> None:
    with make_client(tmp_path) as client:
        client.get("/api/auth/sso/init")
        seed_rows(client)

        response = client.get("/api/lots/my-hold")

        assert response.status_code == 200
        payload = response.json()
        assert payload["tableId"] == 1
        assert [row["lotId"] for row in payload["rows"]] == ["LOT-HOLD-001"]


def test_websocket_rejects_missing_cookie(tmp_path: Path) -> None:
    with make_client(tmp_path) as client:
        with client.websocket_connect("/ws") as websocket:
            message = websocket.receive()

        assert message["type"] == "websocket.close"
        assert message["code"] == 1008


def test_websocket_subscribe_receives_updates_after_db_change(tmp_path: Path) -> None:
    with make_client(tmp_path) as client:
        client.get("/api/auth/sso/init")
        seed_rows(client)

        with client.websocket_connect("/ws") as websocket:
            websocket.send_json({"type": "subscribe", "payload": {"tableId": 1}})
            first_message = websocket.receive_json()
            assert first_message["type"] == "table_update"
            assert [row["lotId"] for row in first_message["payload"]["rows"]] == [
                "LOT-HOLD-001"
            ]

            async def _mutate() -> None:
                async with client.app.state.session_factory() as session:
                    lot = await session.get(LotStatus, "LOT-HOLD-001")
                    assert lot is not None
                    lot.hold_comment = "업데이트됨"
                    await session.commit()

                    result = await session.execute(
                        select(User).where(User.employee_id == "test001")
                    )
                    assert result.scalar_one().employee_number == "99999"

            run_async(_mutate())

            second_message = websocket.receive_json()
            assert second_message["type"] == "table_update"
            assert second_message["payload"]["rows"][0]["holdComment"] == "업데이트됨"
