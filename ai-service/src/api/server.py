import asyncio
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from api.middleware import setup_middleware
from api.routes import health, recommendations
from core.config import get_settings
from core.custom_exception import CustomException
from core.integrations import TrainingScheduler, VectorStore
from core.vector_health import log_vector_db_health
from infra.messaging.consumers.interaction_event_handler import InteractionEventHandler
from infra.messaging.consumers.movie_event_handler import MovieEventHandler
from infra.messaging.interaction_queue import InteractionQueue
from infra.messaging.message_queue import MessageQueue
from infra.monitoring.prometheus import configure_monitoring, update_metrics
from infra.redis.redis_service import RedisStore
from infra.tracing.telemetry import configure_tracing
from services.embedding_service import embedding_service
from services.mapping_service import mapping_service
from services.movie_vector_service import MovieVectorService
from services.recommend_service import RecommendService
from services.user_vector_service import UserVectorService

settings = get_settings()


@asynccontextmanager
async def lifespan(application: FastAPI):
    # Metrics
    stop_event = threading.Event()

    metrics_thread = threading.Thread(
        target=update_metrics,
        args=(stop_event,),
        name="system-metrics",
        daemon=True,
    )
    metrics_thread.start()

    # Khởi tạo vector db
    vector_store = VectorStore(settings)
    await vector_store.start()
    vector_db_health = await log_vector_db_health(vector_store, settings)

    # Khỏi tạo các service: movie, user, recommend
    movie_vector_service = MovieVectorService(
        vector_store=vector_store,
        embedding_service=embedding_service,
    )
    user_vector_service = UserVectorService(
        vector_store=vector_store,
    )
    recommend_svc = RecommendService(
        vector_store=vector_store,
        embedding_service=embedding_service,
        movie_vector_service=movie_vector_service,
        user_vector_service=user_vector_service,
    )

    # khởi tạo training scheduler
    training_scheduler = TrainingScheduler(settings, app_state=application.state)
    await training_scheduler.start()

    # khởi tạo các event handler
    event_handler = MovieEventHandler(recommend_service=recommend_svc)
    interaction_handler = InteractionEventHandler(
        training_scheduler=training_scheduler,
        user_vector_service=user_vector_service,
        movie_vector_service=movie_vector_service,
    )

    # Khởi tạo recommend queue
    mq = MessageQueue(settings)
    mq.set_handler(event_handler)
    await mq.start()

    # Khởi tạo interaction queue
    interaction_mq = InteractionQueue(settings=settings)
    interaction_mq.set_handler(interaction_handler)
    await interaction_mq.start()

    # redis store
    redis_store = RedisStore(settings)
    await redis_store.start()

    # 6. Load mapping (User UUID <-> Idx) from R2 storage on startup
    Path("data/training/models").mkdir(parents=True, exist_ok=True)
    mapping_service.load_mapping_from_storage(
        "models/mappings.json", "data/training/models/mappings.json"
    )

    # Luu vao app.state de cac route co the truy cap neu can
    application.state.vector_store = vector_store
    application.state.vector_db_health = vector_db_health
    application.state.recommend_service = recommend_svc
    application.state.message_queue = mq
    application.state.interaction_queue = interaction_mq
    application.state.redis = redis_store
    application.state.training_scheduler = training_scheduler

    yield

    # Shutdown nguoc lai
    stop_event.set()
    await asyncio.to_thread(
        metrics_thread.join,
        timeout=2,
    )

    await training_scheduler.close()
    await redis_store.close()
    await interaction_mq.close()
    await mq.close()
    await vector_store.close()


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)
api_router = APIRouter(prefix="/api/recommendations")

# Setup tracing after FastAPI app is created
configure_tracing(app, settings)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "statusCode": 422,
            "message": "Request validation failed",
            "errorCode": "VALIDATION_ERROR",
            "errors": exc.errors(),
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "statusCode": exc.status_code,
            "message": str(exc.detail),
            "errorCode": f"HTTP_{exc.status_code}",
        },
    )


@app.exception_handler(CustomException)
async def custom_exception_handler(
    request: Request, exc: CustomException
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "statusCode": exc.status_code,
            "message": exc.message,
            "errorCode": exc.error_code,
        },
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


# prefix: /api/recommendations
api_router.include_router(health.router)
api_router.include_router(recommendations.router)
app.include_router(api_router)

# Setup middleware (logging, auth, etc.)
setup_middleware(app)

# Setup Prometheus monitoring
configure_monitoring(app=app)
