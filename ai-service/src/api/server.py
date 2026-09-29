
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from core.config import get_settings
from core.integrations import TrainingScheduler, VectorStore
from core.message_queue import MessageQueue
from core.redis_service import RedisStore
from core.telemetry import configure_tracing
from api.middleware import setup_middleware
from api.routes import health, recommendations
from services.recommend_service import RecommendService
from services.embedding_service import embedding_service
from services.movie_event_handler import MovieEventHandler


settings = get_settings()


@asynccontextmanager
async def lifespan(application: FastAPI):
	# 1. Khoi tao VectorStore (ChromaDB)
	vector_store = VectorStore(settings)
	await vector_store.start()

	# 2. Khoi tao RecommendService (xu ly semantic search va vector CRUD)
	recommend_svc = RecommendService(
		vector_store=vector_store,
		embedding_service=embedding_service,
	)

	# 3. Khoi tao MovieEventHandler (dispatcher theo event_type)
	event_handler = MovieEventHandler(recommend_service=recommend_svc)

	# 4. Khoi tao MessageQueue -> inject handler -> bat dau consume
	mq = MessageQueue(settings)
	mq.set_handler(event_handler)
	await mq.start()

	# 5. Cac service khac
	redis_store = RedisStore(settings)
	await redis_store.start()
	training_scheduler = TrainingScheduler(settings)
	await training_scheduler.start()

	# Luu vao app.state de cac route co the truy cap neu can
	application.state.vector_store = vector_store
	application.state.recommend_service = recommend_svc
	application.state.message_queue = mq
	application.state.redis = redis_store
	application.state.training_scheduler = training_scheduler

	yield

	# Shutdown nguoc lai
	await training_scheduler.close()
	await redis_store.close()
	await mq.close()
	await vector_store.close()



app = FastAPI(
	title=settings.app_name, 
	version=settings.app_version, 
	lifespan=lifespan
)

# Setup tracing after FastAPI app is created
configure_tracing(app, settings)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
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


app.add_middleware(
	CORSMiddleware,
	allow_origins=settings.allowed_origins,
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)



# predix: /api/recommendations/
setup_middleware(app)


app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(recommendations.router, prefix=settings.api_prefix)
