"""Unit test cho ``src/api/server.py``.

Hai nhóm kiểm thử:

1. ``lifespan``: mock **toàn bộ** hạ tầng nặng (``VectorStore``,
   ``RecommendService``, ``TrainingScheduler``, ``MessageQueue``,
   ``InteractionQueue``, ``RedisStore``, handlers, ``mapping_service``,
   ``threading.Thread``, ``update_metrics``, ``Path``) để không mở kết nối
   ChromaDB/RabbitMQ/Redis, không tạo thread thật, không ghi vào ``data/``.
   Assert state được gán, service được start/close đúng thứ tự.
2. App-level: ``/api/metrics`` trả Prometheus text, exception handler
   ``RequestValidationError``/``HTTPException`` trả envelope lỗi, CORS theo
   ``settings.allowed_origins`` và middleware auth hoạt động trên app thật.

Lưu ý: ``import src.api.server`` tạo ``app`` và đăng ký middleware ngay khi
import, nhưng **không** chạy lifespan/thread (thread chỉ được tạo trong
``lifespan``). Test app-level dùng ``TestClient`` không mở context manager nên
lifespan không được kích hoạt.
"""

import asyncio
import json
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from jose import jwt
from starlette.requests import Request as StarletteRequest

from src.api import server

PREFIX = "/api/recommendations"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers cho lifespan
# ─────────────────────────────────────────────────────────────────────────────


class FakeThread:
    """Thay ``threading.Thread``: không chạy target thật, join là async."""

    instances: list["FakeThread"] = []

    def __init__(self, target=None, args=(), name=None, daemon=None):
        self.target = target
        self.args = args
        self.name = name
        self.daemon = daemon
        self.started = False
        self.joined_with = None
        FakeThread.instances.append(self)

    def start(self) -> None:
        self.started = True

    async def join(self, timeout=None) -> None:
        self.joined_with = timeout


@pytest.fixture
def lifespan_env(monkeypatch, tmp_path):
    """Patch toàn bộ dependency của ``server.lifespan`` và trả về mock."""
    FakeThread.instances.clear()
    close_order: list[str] = []

    def install(attr_name: str, label: str, extra_mocks: tuple[str, ...] = ()):
        instance = MagicMock(name=f"{label}-instance")
        instance.start = AsyncMock(name=f"{label}.start")
        instance.close = AsyncMock(
            name=f"{label}.close",
            side_effect=lambda *args, **kwargs: close_order.append(label),
        )
        for extra in extra_mocks:
            setattr(instance, extra, MagicMock(name=f"{label}.{extra}"))
        klass = MagicMock(name=f"{attr_name}-class", return_value=instance)
        monkeypatch.setattr(server, attr_name, klass)
        return klass, instance

    vector_cls, vector_store = install("VectorStore", "vector_store")
    recommend_cls, recommend_svc = install("RecommendService", "recommend_service")
    movie_handler_cls, movie_handler = install(
        "MovieEventHandler", "movie_event_handler"
    )
    scheduler_cls, scheduler = install("TrainingScheduler", "training_scheduler")
    interaction_handler_cls, interaction_handler = install(
        "InteractionEventHandler", "interaction_handler"
    )
    mq_cls, mq = install("MessageQueue", "message_queue", extra_mocks=("set_handler",))
    interaction_mq_cls, interaction_mq = install(
        "InteractionQueue", "interaction_queue", extra_mocks=("set_handler",)
    )
    redis_cls, redis_store = install("RedisStore", "redis_store")

    update_metrics = MagicMock(name="update_metrics")
    monkeypatch.setattr(server, "update_metrics", update_metrics)
    monkeypatch.setattr(
        server,
        "threading",
        SimpleNamespace(Thread=FakeThread, Event=threading.Event),
    )

    def fake_path(raw):
        return tmp_path / raw

    monkeypatch.setattr(server, "Path", fake_path)

    mapping_service = MagicMock(name="mapping_service")
    monkeypatch.setattr(server, "mapping_service", mapping_service)

    return SimpleNamespace(
        vector_cls=vector_cls,
        vector_store=vector_store,
        recommend_cls=recommend_cls,
        recommend_svc=recommend_svc,
        movie_handler_cls=movie_handler_cls,
        movie_handler=movie_handler,
        scheduler_cls=scheduler_cls,
        scheduler=scheduler,
        interaction_handler_cls=interaction_handler_cls,
        interaction_handler=interaction_handler,
        mq_cls=mq_cls,
        mq=mq,
        interaction_mq_cls=interaction_mq_cls,
        interaction_mq=interaction_mq,
        redis_cls=redis_cls,
        redis_store=redis_store,
        update_metrics=update_metrics,
        mapping_service=mapping_service,
        tmp_path=tmp_path,
        close_order=close_order,
    )


def run_lifespan(app: FastAPI) -> FastAPI:
    """Chạy lifespan trọn vòng (startup + shutdown) rồi trả lại app."""

    async def scenario() -> FastAPI:
        async with server.lifespan(app):
            pass
        return app

    return asyncio.run(scenario())


def make_request(path: str) -> StarletteRequest:
    return StarletteRequest(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode(),
            "query_string": b"",
            "root_path": "",
            "headers": [],
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
    )


# ─────────────────────────────────────────────────────────────────────────────
# lifespan
# ─────────────────────────────────────────────────────────────────────────────


class TestLifespan:
    def test_assigns_every_service_to_app_state(self, lifespan_env):
        app = FastAPI()

        async def scenario():
            async with server.lifespan(app):
                assert app.state.vector_store is lifespan_env.vector_store
                assert app.state.recommend_service is lifespan_env.recommend_svc
                assert app.state.message_queue is lifespan_env.mq
                assert app.state.interaction_queue is lifespan_env.interaction_mq
                assert app.state.redis is lifespan_env.redis_store
                assert app.state.training_scheduler is lifespan_env.scheduler

        asyncio.run(scenario())

    def test_constructs_services_with_expected_dependencies(self, lifespan_env):
        app = FastAPI()
        run_lifespan(app)

        lifespan_env.vector_cls.assert_called_once_with(server.settings)
        lifespan_env.recommend_cls.assert_called_once_with(
            vector_store=lifespan_env.vector_store,
            embedding_service=server.embedding_service,
        )
        lifespan_env.movie_handler_cls.assert_called_once_with(
            recommend_service=lifespan_env.recommend_svc
        )
        lifespan_env.scheduler_cls.assert_called_once_with(
            server.settings, app_state=app.state
        )
        lifespan_env.interaction_handler_cls.assert_called_once_with(
            vector_store=lifespan_env.vector_store,
            training_scheduler=lifespan_env.scheduler,
        )
        lifespan_env.mq_cls.assert_called_once_with(server.settings)
        lifespan_env.mq.set_handler.assert_called_once_with(
            lifespan_env.movie_handler
        )
        lifespan_env.interaction_mq_cls.assert_called_once_with(server.settings)
        lifespan_env.interaction_mq.set_handler.assert_called_once_with(
            lifespan_env.interaction_handler
        )
        lifespan_env.redis_cls.assert_called_once_with(server.settings)

    def test_starts_every_external_service(self, lifespan_env):
        run_lifespan(FastAPI())

        lifespan_env.vector_store.start.assert_awaited_once_with()
        lifespan_env.scheduler.start.assert_awaited_once_with()
        lifespan_env.mq.start.assert_awaited_once_with()
        lifespan_env.interaction_mq.start.assert_awaited_once_with()
        lifespan_env.redis_store.start.assert_awaited_once_with()

    def test_starts_metrics_thread_as_daemon(self, lifespan_env):
        run_lifespan(FastAPI())

        assert len(FakeThread.instances) == 1
        thread = FakeThread.instances[0]
        assert thread.started is True
        assert thread.daemon is True
        assert thread.name == "system-metrics"
        assert thread.target is lifespan_env.update_metrics
        assert isinstance(thread.args[0], threading.Event)

    def test_shutdown_sets_stop_event_and_joins_metrics_thread(self, lifespan_env):
        run_lifespan(FastAPI())

        thread = FakeThread.instances[0]
        assert thread.args[0].is_set() is True
        assert thread.joined_with == 2

    def test_shutdown_closes_services_in_reverse_order(self, lifespan_env):
        run_lifespan(FastAPI())

        assert lifespan_env.close_order == [
            "training_scheduler",
            "redis_store",
            "interaction_queue",
            "message_queue",
            "vector_store",
        ]

    def test_loads_mapping_from_storage(self, lifespan_env):
        run_lifespan(FastAPI())

        lifespan_env.mapping_service.load_mapping_from_storage.assert_called_once_with(
            "models/mappings.json", "data/training/models/mappings.json"
        )

    def test_creates_training_model_directory(self, lifespan_env):
        run_lifespan(FastAPI())

        assert (
            lifespan_env.tmp_path / "data" / "training" / "models"
        ).is_dir()

    def test_does_not_create_real_metrics_thread(self, lifespan_env):
        """Đảm bảo test không khởi động thread thật: mọi thread đều là FakeThread."""
        run_lifespan(FastAPI())

        assert all(isinstance(t, FakeThread) for t in FakeThread.instances)
        assert len(FakeThread.instances) == 1


# ─────────────────────────────────────────────────────────────────────────────
# App-level
# ─────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def client() -> TestClient:
    # Không dùng context manager ⇒ lifespan (và thread metrics thật) không chạy.
    return TestClient(server.app, raise_server_exceptions=False)


class TestMetricsEndpoint:
    def test_returns_prometheus_text(self, client):
        response = client.get("/api/metrics")

        assert response.status_code == 200
        assert "# HELP" in response.text
        assert "python_info" in response.text

    def test_content_type_is_prometheus_text(self, client):
        response = client.get("/api/metrics")

        assert response.headers["content-type"].startswith("text/plain")

    def test_does_not_require_authentication(self, client):
        response = client.get("/api/metrics")

        assert response.status_code == 200

    def test_passes_through_logging_middleware(self, client):
        response = client.get("/api/metrics")

        assert float(response.headers["X-Process-Time"]) >= 0.0


class TestExceptionHandlers:
    def test_validation_error_returns_error_envelope(self, client):
        response = client.get(f"{PREFIX}/similar/not-a-number")

        assert response.status_code == 422
        body = response.json()
        assert body["statusCode"] == 422
        assert body["message"] == "Request validation failed"
        assert body["errorCode"] == "VALIDATION_ERROR"
        assert body["errors"][0]["loc"] == ["path", "movie_id"]
        assert body["errors"][0]["type"] == "int_parsing"

    def test_validation_exception_handler_direct(self):
        errors = [
            {
                "type": "missing",
                "loc": ("query", "keyword"),
                "msg": "Field required",
                "input": None,
            }
        ]
        exc = RequestValidationError(errors)

        response = asyncio.run(
            server.validation_exception_handler(
                make_request(f"{PREFIX}/semantic-search"), exc
            )
        )

        assert response.status_code == 422
        body = json.loads(response.body)
        assert body["statusCode"] == 422
        assert body["errorCode"] == "VALIDATION_ERROR"
        assert body["errors"] == [
            {
                "type": "missing",
                "loc": ["query", "keyword"],
                "msg": "Field required",
                "input": None,
            }
        ]

    def test_http_exception_handler_direct(self):
        exc = HTTPException(status_code=418, detail="I am a teapot")

        response = asyncio.run(
            server.http_exception_handler(make_request("/api/teapot"), exc)
        )

        assert response.status_code == 418
        assert json.loads(response.body) == {
            "statusCode": 418,
            "message": "I am a teapot",
            "errorCode": "HTTP_418",
        }

    def test_http_exception_from_route_returns_error_envelope(
        self, client, monkeypatch
    ):
        service = MagicMock(name="RecommendService")
        service.similar_movies = AsyncMock(
            side_effect=ValueError("Khong tim thay vector cho movieId=999")
        )
        monkeypatch.setattr(
            server.app.state, "recommend_service", service, raising=False
        )

        response = client.get(f"{PREFIX}/similar/999")

        assert response.status_code == 404
        assert response.json() == {
            "statusCode": 404,
            "message": "Khong tim thay vector cho movieId=999",
            "errorCode": "HTTP_404",
        }


class TestAuthOnServerApp:
    def test_protected_route_requires_token(self, client):
        response = client.get(f"{PREFIX}/test-auth")

        assert response.status_code == 401
        assert response.json() == {
            "statusCode": 401,
            "message": "Chưa đăng nhập",
            "errorCode": "HTTP_401",
        }

    def test_protected_route_accepts_valid_jwt(self, client):
        token = jwt.encode(
            {
                "sub": "user-9",
                "email": "user9@example.com",
                "fullName": "Le Van C",
                "scopes": ["movie:read"],
                "jti": "jti-9",
                "exp": 9_999_999_999,
            },
            server.settings.jwt_secret_key,
            algorithm=server.settings.jwt_algorithm,
        )

        response = client.get(
            f"{PREFIX}/test-auth",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 200
        assert response.json()["result"] == {
            "sub": "user-9",
            "email": "user9@example.com",
            "fullName": "Le Van C",
            "scopes": ["movie:read"],
            "jti": "jti-9",
        }
        assert float(response.headers["X-Process-Time"]) >= 0.0

    def test_protected_route_rejects_expired_jwt(self, client):
        token = jwt.encode(
            {
                "sub": "user-9",
                "email": "user9@example.com",
                "fullName": "Le Van C",
                "scopes": [],
                "exp": 1_000_000_000,
            },
            server.settings.jwt_secret_key,
            algorithm=server.settings.jwt_algorithm,
        )

        response = client.get(
            f"{PREFIX}/test-auth",
            headers={"Authorization": f"Bearer {token}"},
        )

        assert response.status_code == 401
        assert response.json()["errorCode"] == "TOKEN_EXPIRED"

    def test_health_endpoint_is_mounted_under_api_prefix(self, client, monkeypatch):
        monkeypatch.setattr(server.health, "check_infra", lambda: {"pid": 1})

        response = client.get(f"{PREFIX}/health")

        assert response.status_code == 200
        assert response.json()["result"] == {
            "status": "up",
            "infrastructure": {"pid": 1},
        }


class TestAppConfiguration:
    def test_title_and_version_come_from_settings(self):
        assert server.app.title == server.settings.app_name
        assert server.app.version == server.settings.app_version

    def test_cors_middleware_uses_settings_origins(self):
        cors_entries = [
            middleware
            for middleware in server.app.user_middleware
            if middleware.cls is CORSMiddleware
        ]

        assert len(cors_entries) == 1
        kwargs = cors_entries[0].kwargs
        assert kwargs["allow_origins"] == server.settings.allowed_origins
        assert kwargs["allow_credentials"] is True
        assert kwargs["allow_methods"] == ["*"]
        assert kwargs["allow_headers"] == ["*"]

    def test_cors_preflight_allows_configured_origin(self, client):
        origin = server.settings.allowed_origins[0]

        response = client.options(
            "/api/metrics",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
        assert response.headers["access-control-allow-credentials"] == "true"

    def test_cors_does_not_allow_unknown_origin(self, client):
        response = client.get(
            "/api/metrics", headers={"Origin": "http://evil.example"}
        )

        assert response.status_code == 200
        assert "access-control-allow-origin" not in response.headers
