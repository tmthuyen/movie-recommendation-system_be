"""Unit test cho ``src/api/routes/health.py``.

Dựng một ``FastAPI()`` nhỏ + ``include_router`` (không import app thật trong
``src/api/server.py``) và dùng ``fastapi.testclient.TestClient``.

- ``/health``: envelope ``success`` + dữ liệu ``check_infra`` (mock).
- ``/tracing``: proxy tới backend (mock ``requests.get``, không gọi mạng).
- ``/test-auth``: dependency ``get_current_user`` được override, không cần JWT.
"""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.routes import health as health_module
from src.api.schemas import CurrentUser

PREFIX = "/api/recommendations"
BACKEND_HEALTH_URL = "http://localhost:8081/api/health"

INFRA = {
    "pid": 1234,
    "total_ram_gb": 16.0,
    "available_ram_gb": 8.0,
    "used_percent": 50.0,
    "app_rss_gb": 0.5,
}


@pytest.fixture
def app() -> FastAPI:
    application = FastAPI()
    application.include_router(health_module.router, prefix=PREFIX)
    return application


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def current_user() -> CurrentUser:
    return CurrentUser(
        sub="user-7",
        email="user7@example.com",
        fullName="Tran Thi B",
        scopes=["movie:read"],
        jti="jti-7",
    )


# ─────────────────────────────────────────────────────────────────────────────
# GET /health
# ─────────────────────────────────────────────────────────────────────────────


class TestHealthEndpoint:
    def test_returns_success_envelope_with_status_up(self, client, monkeypatch):
        monkeypatch.setattr(health_module, "check_infra", lambda: dict(INFRA))

        response = client.get(f"{PREFIX}/health")

        assert response.status_code == 200
        assert response.json() == {
            "success": True,
            "statusCode": 200,
            "message": "Health check successful",
            "result": {"status": "up", "infrastructure": INFRA},
        }

    def test_forwards_infrastructure_payload_verbatim(self, client, monkeypatch):
        monkeypatch.setattr(health_module, "check_infra", lambda: dict(INFRA))

        body = client.get(f"{PREFIX}/health").json()

        assert body["result"]["infrastructure"] == INFRA

    def test_calls_check_infra_once(self, client, monkeypatch):
        check_infra = MagicMock(return_value=dict(INFRA))
        monkeypatch.setattr(health_module, "check_infra", check_infra)

        client.get(f"{PREFIX}/health")

        check_infra.assert_called_once_with()


# ─────────────────────────────────────────────────────────────────────────────
# GET /tracing
# ─────────────────────────────────────────────────────────────────────────────


class TestTracingEndpoint:
    def test_returns_downstream_payload_in_envelope(self, client, monkeypatch):
        payload = {"success": True, "statusCode": 200, "result": {"status": "up"}}
        fake_requests = SimpleNamespace(
            get=MagicMock(return_value=SimpleNamespace(json=lambda: dict(payload)))
        )
        monkeypatch.setattr(health_module, "requests", fake_requests)

        response = client.get(f"{PREFIX}/tracing")

        assert response.status_code == 200
        assert response.json() == {
            "success": True,
            "statusCode": 200,
            "message": "Success",
            "result": payload,
        }

    def test_calls_backend_health_url(self, client, monkeypatch):
        get = MagicMock(return_value=SimpleNamespace(json=lambda: {}))
        monkeypatch.setattr(health_module, "requests", SimpleNamespace(get=get))

        client.get(f"{PREFIX}/tracing")

        get.assert_called_once_with(BACKEND_HEALTH_URL)

    def test_backend_failure_returns_500(self, client, monkeypatch):
        get = MagicMock(side_effect=RuntimeError("connection refused"))
        monkeypatch.setattr(health_module, "requests", SimpleNamespace(get=get))

        response = client.get(f"{PREFIX}/tracing")

        assert response.status_code == 500


# ─────────────────────────────────────────────────────────────────────────────
# GET /test-auth
# ─────────────────────────────────────────────────────────────────────────────


class TestTestAuthEndpoint:
    def test_returns_authenticated_user(
        self, app, client, current_user, monkeypatch
    ):
        app.dependency_overrides[health_module.get_current_user] = (
            lambda: current_user
        )

        response = client.get(f"{PREFIX}/test-auth")

        assert response.status_code == 200
        assert response.json() == {
            "success": True,
            "statusCode": 200,
            "message": "Success",
            "result": {
                "sub": "user-7",
                "email": "user7@example.com",
                "fullName": "Tran Thi B",
                "scopes": ["movie:read"],
                "jti": "jti-7",
            },
        }

    def test_requires_authentication_when_no_override(self, client):
        response = client.get(f"{PREFIX}/test-auth")

        assert response.status_code == 401
        assert response.json() == {"detail": "Chưa đăng nhập"}
        assert response.headers["WWW-Authenticate"] == "Bearer"

    def test_dependency_override_is_used_instead_of_request_state(
        self, app, client
    ):
        app.dependency_overrides[health_module.get_current_user] = lambda: CurrentUser(
            sub="override-user",
            email="override@example.com",
            fullName="Override",
            scopes=[],
        )

        body = client.get(f"{PREFIX}/test-auth").json()

        assert body["result"]["sub"] == "override-user"
        # ``success()`` dùng ``exclude_none=True`` nên ``jti=None`` bị loại bỏ.
        assert body["result"].get("jti") is None


# ─────────────────────────────────────────────────────────────────────────────
# Router shape
# ─────────────────────────────────────────────────────────────────────────────


class TestHealthRouter:
    def test_registers_all_public_routes_as_get(self):
        routes = {
            route.path: route.methods for route in health_module.router.routes
        }

        assert routes == {
            "/health": {"GET"},
            "/tracing": {"GET"},
            "/test-auth": {"GET"},
        }
