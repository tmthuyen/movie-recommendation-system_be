
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from core.config import get_settings
from core.integrations import TrainingScheduler, VectorStore
from core.message_queue import MessageQueue
from core.interaction_queue import InteractionQueue
from core.redis_service import RedisStore
from core.telemetry import configure_tracing
from api.middleware import setup_middleware
from api.routes import health, recommendations
from services.recommend_service import RecommendService
from services.embedding_service import embedding_service
from services.movie_event_handler import MovieEventHandler
from services.interaction_event_handler import InteractionEventHandler
from services.mapping_service import mapping_service
from pathlib import Path


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

	# Khoi tao TrainingScheduler (truoc InteractionEventHandler de pass vao)
	training_scheduler = TrainingScheduler(settings, app_state=application.state)
	await training_scheduler.start()

	# Khoi tao InteractionEventHandler
	interaction_handler = InteractionEventHandler(vector_store=vector_store, training_scheduler=training_scheduler)

	# 4. Khoi tao MessageQueue -> inject handler -> bat dau consume
	mq = MessageQueue(settings)
	mq.set_handler(event_handler)
	await mq.start()

	# 4.5. Khoi tao InteractionQueue
	interaction_mq = InteractionQueue(settings)
	interaction_mq.set_handler(interaction_handler)
	await interaction_mq.start()

	# 5. Cac service khac
	redis_store = RedisStore(settings)
	await redis_store.start()

	# 6. Load mapping (User UUID <-> Idx) from R2 storage on startup
	Path("data/training/models").mkdir(parents=True, exist_ok=True)
	mapping_service.load_mapping_from_storage("models/mappings.json", "data/training/models/mappings.json")

	# Luu vao app.state de cac route co the truy cap neu can
	application.state.vector_store = vector_store
	application.state.recommend_service = recommend_svc
	application.state.message_queue = mq
	application.state.interaction_queue = interaction_mq
	application.state.redis = redis_store
	application.state.training_scheduler = training_scheduler

	yield

	# Shutdown nguoc lai
	await training_scheduler.close()
	await redis_store.close()
	await interaction_mq.close()
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
