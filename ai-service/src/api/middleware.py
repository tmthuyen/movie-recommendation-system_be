from fastapi import HTTPException
from utils import setup_logger
import time
from fastapi import FastAPI, Request


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
    async def auth_middleware(request: Request, call_next):
        authorization_header = request.headers.get("Authorization")
        if authorization_header is None:
            raise HTTPException(status_code=401, detail="Missing token")
        
        token = authorization_header.split(" ")[1]

        logger.info(f"[Token] received")

        reponse = await call_next(request)
        return reponse
        
