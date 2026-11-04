"""Unit test cho ``src/api/middleware.py``.

Bao phủ:

- ``get_correlation_id``: lấy Trace ID từ OpenTelemetry (định dạng 32 hex,
  trace id ``0`` → chuỗi ``"None"``) và đọc 2 header ``X-Request-ID`` /
  ``X-Kong-Request-ID``.
- ``setup_middleware``: middleware logging (header ``X-Process-Time``, log
  correlation id) và middleware xác thực JWT.

Token JWT được tạo **thật** bằng ``python-jose`` với ``JWT_SECRET_KEY`` của
môi trường test — không mock ``jwt.decode``, không gọi mạng, không mở cổng.
"""

import time
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from jose import jwt
from starlette.requests import Request as StarletteRequest

from src.api import middleware

# Trace ID mẫu (32 ký tự hex) dùng trong các test.
SAMPLE_TRACE_ID = 0x4BF92F3577B34DA6A3CE929D0E0E4736
SAMPLE_TRACE_ID_HEX = "4bf92f3577b34da6a3ce929d0e0e4736"


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────


def make_request(headers: dict[str, str] | None = None) -> StarletteRequest:
    """Tạo ``Request`` tối thiểu (không cần HTTP server)."""
    raw_headers = [
        (key.lower().encode("latin-1"), value.encode("latin-1"))
        for key, value in (headers or {}).items()
    ]
    return StarletteRequest(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/",
            "raw_path": b"/",
            "query_string": b"",
            "root_path": "",
            "headers": raw_headers,
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
        }
    )


class FakeSpanContext:
    def __init__(self, trace_id: int) -> None:
        self.trace_id = trace_id


class FakeSpan:
    def __init__(self, trace_id: int) -> None:
        self._context = FakeSpanContext(trace_id)

    def get_span_context(self) -> FakeSpanContext:
        return self._context


def patch_current_span(monkeypatch: pytest.MonkeyPatch, trace_id: int) -> None:
    """Thay ``opentelemetry.trace`` trong module middleware bằng span giả."""
    fake_trace = SimpleNamespace(get_current_span=lambda: FakeSpan(trace_id))
    monkeypatch.setattr(middleware, "trace", fake_trace)


def build_client() -> TestClient:
    """App nhỏ gắn middleware thật + 2 route để quan sát ``request.state.user``."""
    app = FastAPI()

    @app.get("/public")
    async def public(request: Request) -> dict:
        return {"authenticated": request.state.user is not None}

    @app.get("/whoami")
    async def whoami(request: Request) -> dict:
        user = request.state.user
        if user is None:
            return {"authenticated": False}
        return {
            "authenticated": True,
            "sub": user.sub,
            "email": user.email,
            "fullName": user.fullName,
            "scopes": user.scopes,
            "jti": user.jti,
        }

    middleware.setup_middleware(app)
    # Không dùng context manager ⇒ không chạy lifespan (app không có lifespan).
    return TestClient(app, raise_server_exceptions=False)


class _RecordingCallable:
    """Ghi lại tham số của mọi lần gọi (thay cho ``unittest.mock.Mock``)."""

    def __init__(self) -> None:
        self.calls: list = []

    def __call__(self, *args, **kwargs):
        self.calls.append(args[0] if len(args) == 1 else args)
        return None


def make_token(**overrides) -> str:
    claims = {
        "sub": "user-1",
        "email": "user@example.com",
        "fullName": "Nguyen Van A",
        "scopes": ["movie:read"],
        "jti": "jti-1",
        "exp": int(time.time()) + 3600,
    }
    claims.update(overrides)
    return jwt.encode(
        claims,
        middleware.settings.jwt_secret_key,
        algorithm=middleware.settings.jwt_algorithm,
    )


# ─────────────────────────────────────────────────────────────────────────────
# get_correlation_id
# ─────────────────────────────────────────────────────────────────────────────


class TestGetCorrelationId:
    def test_returns_trace_id_and_both_request_headers(self, monkeypatch):
        patch_current_span(monkeypatch, SAMPLE_TRACE_ID)

        trace_id, request_id, kong_id = middleware.get_correlation_id(
            make_request(
                {
                    "X-Request-ID": "req-123",
                    "X-Kong-Request-ID": "kong-456",
                }
            )
        )

        assert trace_id == SAMPLE_TRACE_ID_HEX
        assert request_id == "req-123"
        assert kong_id == "kong-456"

    def test_missing_request_headers_return_none(self, monkeypatch):
        patch_current_span(monkeypatch, SAMPLE_TRACE_ID)

        trace_id, request_id, kong_id = middleware.get_correlation_id(make_request())

        assert trace_id == SAMPLE_TRACE_ID_HEX
        assert request_id is None
        assert kong_id is None

    def test_zero_trace_id_becomes_none_string(self, monkeypatch):
        patch_current_span(monkeypatch, 0)

        trace_id, _, _ = middleware.get_correlation_id(make_request())

        assert trace_id == "None"
        assert isinstance(trace_id, str)

    def test_trace_id_is_zero_padded_to_32_hex_chars(self, monkeypatch):
        patch_current_span(monkeypatch, 0x1)

        trace_id, _, _ = middleware.get_correlation_id(make_request())

        assert trace_id == "0" * 31 + "1"
        assert len(trace_id) == 32

    def test_warns_for_missing_request_and_kong_ids(self, monkeypatch):
        patch_current_span(monkeypatch, SAMPLE_TRACE_ID)
        logger = SimpleNamespace(warning=_RecordingCallable())
        monkeypatch.setattr(middleware, "logger", logger)

        middleware.get_correlation_id(make_request())

        assert logger.warning.calls == ["Missing request id", "Missing kong id"]

    def test_does_not_warn_when_headers_are_present(self, monkeypatch):
        patch_current_span(monkeypatch, SAMPLE_TRACE_ID)
        logger = SimpleNamespace(warning=_RecordingCallable())
        monkeypatch.setattr(middleware, "logger", logger)

        middleware.get_correlation_id(
            make_request({"X-Request-ID": "req-1", "X-Kong-Request-ID": "kong-1"})
        )

        assert logger.warning.calls == []

    def test_zero_trace_id_does_not_log_missing_traceparent(self, monkeypatch):
        """Bug tiềm ẩn: ``trace_id is None`` không bao giờ đúng vì đã đổi thành "None".

        Ghi nhận hành vi hiện tại: khi trace id = 0 thì KHÔNG có cảnh báo
        ``Missing traceparent`` (nhánh ``if trace_id is None`` là dead code).
        """
        patch_current_span(monkeypatch, 0)
        logger = SimpleNamespace(warning=_RecordingCallable())
        monkeypatch.setattr(middleware, "logger", logger)

        middleware.get_correlation_id(make_request())

        assert "Missing traceparent" not in logger.warning.calls


class TestSetupMiddleware:
    def test_valid_token_sets_request_state_user(self):
        client = build_client()

        response = client.get(
            "/whoami",
            headers={"Authorization": f"Bearer {make_token()}"},
        )

        assert response.status_code == 200
        assert response.json() == {
            "authenticated": True,
            "sub": "user-1",
            "email": "user@example.com",
            "fullName": "Nguyen Van A",
            "scopes": ["movie:read"],
            "jti": "jti-1",
        }

    def test_bearer_scheme_is_case_insensitive(self):
        client = build_client()

        response = client.get(
            "/whoami",
            headers={"Authorization": f"bearer {make_token()}"},
        )

        assert response.status_code == 200
        assert response.json()["sub"] == "user-1"

    def test_valid_token_without_optional_claims_uses_defaults(self):
        client = build_client()
        # Bỏ hẳn 2 claim tuỳ chọn khỏi payload.
        token = jwt.encode(
            {
                "sub": "user-1",
                "email": "user@example.com",
                "fullName": "Nguyen Van A",
                "exp": int(time.time()) + 3600,
            },
            middleware.settings.jwt_secret_key,
            algorithm=middleware.settings.jwt_algorithm,
        )

        response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 200
        assert response.json()["scopes"] == []
        assert response.json()["jti"] is None

    def test_expired_token_returns_401_envelope(self):
        client = build_client()
        expired = make_token(exp=int(time.time()) - 60)

        response = client.get(
            "/whoami", headers={"Authorization": f"Bearer {expired}"}
        )

        assert response.status_code == 401
        assert response.json() == {
            "statusCode": 401,
            "message": "Token đã hết hạn",
            "data": None,
            "errorCode": "TOKEN_EXPIRED",
        }
        assert response.headers["WWW-Authenticate"] == "Bearer"

    def test_invalid_signature_returns_401_invalid_token(self):
        client = build_client()
        forged = jwt.encode(
            {"sub": "user-1", "exp": int(time.time()) + 3600},
            "not-the-real-secret",
            algorithm=middleware.settings.jwt_algorithm,
        )

        response = client.get("/whoami", headers={"Authorization": f"Bearer {forged}"})

        assert response.status_code == 401
        assert response.json()["errorCode"] == "INVALID_TOKEN"

    def test_missing_authorization_header_is_treated_as_anonymous(self):
        client = build_client()

        response = client.get("/public")

        assert response.status_code == 200
        assert response.json() == {"authenticated": False}

    def test_authorization_header_without_bearer_scheme_returns_401(self):
        client = build_client()

        response = client.get(
            "/public", headers={"Authorization": "Basic dXNlcjpwYXNz"}
        )

        assert response.status_code == 401
        assert response.json() == {
            "statusCode": 401,
            "message": "Token không hợp lệ",
            "data": None,
            "errorCode": "INVALID_AUTHORIZATION",
        }
        assert response.headers["WWW-Authenticate"] == "Bearer"

    def test_malformed_authorization_header_returns_401(self):
        client = build_client()

        response = client.get(
            "/public", headers={"Authorization": "BearerOnlyToken"}
        )

        assert response.status_code == 401
        assert response.json()["errorCode"] == "INVALID_AUTHORIZATION"

    def test_valid_token_without_subject_returns_401_invalid_token(self):
        client = build_client()
        token = jwt.encode(
            {"email": "user@example.com", "exp": int(time.time()) + 3600},
            middleware.settings.jwt_secret_key,
            algorithm=middleware.settings.jwt_algorithm,
        )

        response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 401
        assert response.json()["errorCode"] == "INVALID_TOKEN"
        assert response.json()["message"] == "Token không hợp lệ"

    def test_token_without_email_causes_500(self):
        """Bug: token thiếu ``email`` làm ``CurrentUser(...)`` ném ValidationError.

        Middleware chỉ bắt ``ExpiredSignatureError``/``JWTError`` nên lỗi
        pydantic thoát ra thành HTTP 500 thay vì 401.
        """
        client = build_client()
        token = jwt.encode(
            {
                "sub": "user-1",
                "fullName": "Nguyen Van A",
                "exp": int(time.time()) + 3600,
            },
            middleware.settings.jwt_secret_key,
            algorithm=middleware.settings.jwt_algorithm,
        )

        response = client.get("/whoami", headers={"Authorization": f"Bearer {token}"})

        assert response.status_code == 500

    def test_logging_middleware_adds_process_time_header(self):
        client = build_client()

        response = client.get("/public")

        assert response.status_code == 200
        process_time = float(response.headers["X-Process-Time"])
        assert process_time >= 0.0

    def test_logging_middleware_logs_correlation_ids(self, monkeypatch):
        client = build_client()
        info = _RecordingCallable()
        monkeypatch.setattr(middleware, "logger", SimpleNamespace(info=info))

        response = client.get(
            "/public",
            headers={"X-Request-ID": "req-42", "X-Kong-Request-ID": "kong-42"},
        )

        assert response.status_code == 200
        logged = [call for call in info.calls if isinstance(call, str)]
        assert any("[Request ID]: req-42" in message for message in logged)
        assert any("[Kong ID]: kong-42" in message for message in logged)
        assert any("Request processed in" in message for message in logged)
