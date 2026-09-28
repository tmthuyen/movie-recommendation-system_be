
from api.middleware import setup_middleware
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from core.config import get_settings
from core.integrations import MessageQueue, RedisStore, TrainingScheduler, VectorStore
from core.telemetry import configure_tracing
from api.routes import health, recommendations
from services.recommend_service import RecommendService
from services.embedding_service import embedding_service
from api.routes import health, recommendations


settings = get_settings()


@asynccontextmanager
async def lifespan(application: FastAPI):
	application.state.message_queue = MessageQueue(settings)
	application.state.redis = RedisStore(settings)
	application.state.vector_store = VectorStore(settings)
	application.state.training_scheduler = TrainingScheduler(settings)
	await application.state.message_queue.start()
	await application.state.redis.start()
	await application.state.vector_store.start()
	await application.state.training_scheduler.start()
	# Tao RecommendService va inject vao MessageQueue de xu ly RabbitMQ events
	recommend_svc = RecommendService(
		vector_store=application.state.vector_store,
		embedding_service=embedding_service,
	)
	application.state.recommend_service = recommend_svc
	application.state.message_queue.set_recommend_service(recommend_svc)
	yield
	await application.state.training_scheduler.close()
	await application.state.vector_store.close()
	await application.state.redis.close()
	await application.state.message_queue.close()


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
			"data": None,
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
