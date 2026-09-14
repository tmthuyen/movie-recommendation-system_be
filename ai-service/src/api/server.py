
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from core.config import get_settings
from core.integrations import MessageQueue, RedisStore, TrainingScheduler, VectorStore
from core.telemetry import configure_tracing
from api.routes import events, health, recommendations, training, vectors


settings = get_settings()


@asynccontextmanager
async def lifespan(application: FastAPI):
	configure_tracing(settings)
	application.state.message_queue = MessageQueue(settings)
	application.state.redis = RedisStore(settings)
	application.state.vector_store = VectorStore(settings)
	application.state.training_scheduler = TrainingScheduler(settings)
	await application.state.message_queue.start()
	await application.state.redis.start()
	await application.state.vector_store.start()
	await application.state.training_scheduler.start()
	yield
	await application.state.training_scheduler.close()
	await application.state.vector_store.close()
	await application.state.redis.close()
	await application.state.message_queue.close()


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
	return JSONResponse(
		status_code=422,
		content={
			"statusCode": 422,
			"message": "Request validation failed",
			"data": None,
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

app.include_router(health.router, prefix=settings.api_prefix)
app.include_router(recommendations.router, prefix=settings.api_prefix)
app.include_router(events.router, prefix=settings.api_prefix)
app.include_router(vectors.router, prefix=settings.api_prefix)
app.include_router(training.router, prefix=settings.api_prefix)

@app.get("/")
async def root():
	return {"message": "AI service is running"}