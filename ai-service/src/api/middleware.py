from core.config import get_settings
from jose import JWTError
from jose import ExpiredSignatureError
from api.schemas import CurrentUser
from jose import jwt
from fastapi.responses import JSONResponse
from fastapi import HTTPException
from utils import setup_logger
import time
from fastapi import FastAPI, Request


settings = get_settings()

from opentelemetry import trace

logger = setup_logger(name='FastAPI-Recommendations', filename=__name__)
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
        logger.info(f"[Trace ID]: {trace_id} - [Request ID]: {req_id} - [Kong ID]: {kong_id}")

        start_time = time.perf_counter()
        response = await call_next(request)
        process_time = time.perf_counter() - start_time
        response.headers["X-Process-Time"] = str(process_time)
        logger.info(f"[{req_id}] Request processed in {process_time} seconds")

        return response

    # Auth middleware
    @app.middleware("http")
    async def auth_middleware(
        request: Request,
        call_next,
    ):
        # Mặc định request chưa authenticated
        request.state.user = None

        authorization = request.headers.get("Authorization")

        
        
        if not authorization:
            return await call_next(request)

        # Kiểm tra format:
        #
        # Authorization: Bearer <token>
        #
        parts = authorization.split(" ", 1)

        if len(parts) != 2:
            return JSONResponse(
                status_code=401,
                content={
                    "statusCode": 401,
                    "message": "Token không hợp lệ",
                    "data": None,
                    "errorCode": "INVALID_AUTHORIZATION",
                },
                headers={
                    "WWW-Authenticate": "Bearer"
                },
            )

        scheme, token = parts

        if scheme.lower() != "bearer":
            return JSONResponse(
                status_code=401,
                content={
                    "statusCode": 401,
                    "message": "Token không hợp lệ",
                    "data": None,
                    "errorCode": "INVALID_AUTHORIZATION",
                },
                headers={
                    "WWW-Authenticate": "Bearer"
                },
            )

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
                return JSONResponse(
                    status_code=401,
                    content={
                        "statusCode": 401,
                        "message": "Token không hợp lệ",
                        "data": None,
                        "errorCode": "INVALID_TOKEN",
                    },
                    headers={
                        "WWW-Authenticate": "Bearer"
                    },
                )

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

        except ExpiredSignatureError:
            return JSONResponse(
                status_code=401,
                content={
                    "statusCode": 401,
                    "message": "Token đã hết hạn",
                    "data": None,
                    "errorCode": "TOKEN_EXPIRED",
                },
                headers={
                    "WWW-Authenticate": "Bearer"
                },
            )

        except JWTError:
            return JSONResponse(
                status_code=401,
                content={
                    "statusCode": 401,
                    "message": "Token không hợp lệ",
                    "data": None,
                    "errorCode": "INVALID_TOKEN",
                },
                headers={
                    "WWW-Authenticate": "Bearer"
                },
            )

        return await call_next(request)    
