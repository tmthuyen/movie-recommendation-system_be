import time

import psutil
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from jose import ExpiredSignatureError, JWTError, jwt

from api.schemas import CurrentUser
from core.config import get_settings
from utils import setup_logger

settings = get_settings()

from opentelemetry import trace

logger = setup_logger(name="FastAPI-Recommendations")


def get_correlation_id(request: Request) -> tuple[str, str, str]:
    # Lấy Trace ID từ bộ nhớ của OpenTelemetry, không lấy từ request.headers
    span = trace.get_current_span()
    trace_id_int = span.get_span_context().trace_id
    trace_id = format(trace_id_int, "032x") if trace_id_int != 0 else "None"

    req_id = request.headers.get("X-Request-ID")
    kong_id = request.headers.get("X-Kong-Request-ID")

    if trace_id is None:
        logger.warning("Missing traceparent")

    if req_id is None:
        logger.warning("Missing request id")

    if kong_id is None:
        logger.warning("Missing kong id")

    return trace_id, req_id, kong_id


def setup_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def logging_id_and_response_time(request: Request, call_next):
        # req id
        trace_id, req_id, kong_id = get_correlation_id(request)
        logger.info(
            f"[trace_id={trace_id}] - [request_id={req_id}] - [kong_id={kong_id}]"
        )

        start_time = time.perf_counter()
        response = await call_next(request)
        process_time = time.perf_counter() - start_time
        response.headers["X-Process-Time"] = str(process_time)

        method = request.method
        path = request.url.path

        logger.info(f"[trace_id={trace_id}] {method} - {path} - {process_time:.2f}s")

        return response

    # Auth middleware
    @app.middleware("http")
    async def auth_middleware(
        request: Request,
        call_next,
    ):
        # Mặc định request chưa authenticated
        request.state.user = None
        request.state.auth_error = None

        authorization = request.headers.get("Authorization")

        if not authorization:
            return await call_next(request)

        # Kiểm tra format:
        #
        # Authorization: Bearer <token>
        #
        parts = authorization.split(" ", 1)

        if len(parts) != 2 or parts[0].lower() != "bearer":
            request.state.auth_error = "INVALID_AUTHORIZATION"
            logger.error(f"[Token] Invalid authorization header")
            return await call_next(request)

        token = parts[1]

        logger.info("[Token] received")

        try:
            payload = jwt.decode(
                token=token,
                key=settings.jwt_secret_key,
                algorithms=[settings.jwt_algorithm],
                # issuer=settings.jwt_issuer,
                # audience=settings.jwt_audience,
            )

            user_id = payload.get("sub")

            if not user_id:
                request.state.auth_error = "INVALID_TOKEN"
                logger.error(f"[Token] Invalid token: missing sub")
                return await call_next(request)

            # Parse JWT → CurrentUser
            user = CurrentUser(
                sub=user_id,
                email=payload.get("email"),
                fullName=payload.get("fullName"),
                scopes=payload.get("scopes", []),
                jti=payload.get("jti"),
            )

            # Lưu user vào request context
            request.state.user = user
            request.state.auth_error = None

        except ExpiredSignatureError:
            request.state.auth_error = "TOKEN_EXPIRED"
            logger.error(f"[Token] Token expired")
        except JWTError:
            request.state.auth_error = "INVALID_TOKEN"
            logger.error(f"[Token] Invalid token")
        except Exception as e:
            request.state.auth_error = "INVALID_TOKEN"
            logger.error(f"[Token] Error decoding token: {e}")

        return await call_next(request)
