import json
from utils import setup_logger
from abc import ABC, abstractmethod
from typing import Any

import aio_pika
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams
from redis.asyncio import Redis

from api.schemas import MovieEvent, TrainRequest, UserInteractionEvent
from .config import Settings


logger = setup_logger(__name__)


class MessageQueue:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.connection = None
        self.channel = None
        self.consumer_tag = None

    async def start(self) -> None:
        if not self.settings.rabbitmq_enabled:
            return
        self.connection = await aio_pika.connect_robust(self.settings.rabbitmq_url)
        self.channel = await self.connection.channel()
        exchange = await self.channel.declare_exchange(
            self.settings.rabbitmq_exchange,
            type=self.settings.rabbitmq_exchange_type,
            durable=True,
        )
        queue = await self.channel.declare_queue(self.settings.rabbitmq_queue, durable=True)
        await queue.bind(exchange, self.settings.movie_event_routing_key)
        await queue.bind(exchange, self.settings.interaction_event_routing_key)
        self.consumer_tag = await queue.consume(self._handle_message)

    async def _handle_message(self, message: aio_pika.abc.AbstractIncomingMessage) -> None:
        async with message.process():
            payload = json.loads(message.body.decode("utf-8"))
            logger.info("Received event type=%s id=%s", payload.get("eventType"), payload.get("eventId"))
            # TODO: dispatch movie updates and interactions to model/vector services.

    async def publish_movie_event(self, event: MovieEvent) -> None:
        await self._publish(event.eventType, event.model_dump())

    async def publish_interaction_event(self, event: UserInteractionEvent) -> None:
        await self._publish(event.eventType, event.model_dump())

    async def _publish(self, routing_key: str, payload: dict[str, Any]) -> None:
        if self.channel is None:
            logger.info("Message queue disabled; accepted event %s", payload.get("eventId"))
            return
        exchange = await self.channel.get_exchange(self.settings.rabbitmq_exchange)
        await exchange.publish(
            aio_pika.Message(body=json.dumps(payload).encode("utf-8")),
            routing_key=routing_key,
        )

    async def close(self) -> None:
        if self.connection:
            await self.connection.close()


class RedisStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: Redis | None = None

    async def start(self) -> None:
        if self.settings.redis_enabled:
            self.client = Redis.from_url(self.settings.redis_url, decode_responses=True)

    async def close(self) -> None:
        if self.client:
            await self.client.aclose()


class VectorBackend(ABC):
    @abstractmethod
    async def start(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any]) -> None:
        raise NotImplementedError

    @abstractmethod
    async def close(self) -> None:
        raise NotImplementedError


class MemoryVectorBackend(VectorBackend):
    def __init__(self) -> None:
        self.items: dict[int, dict[str, Any]] = {}

    async def start(self) -> None:
        return None

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any]) -> None:
        self.items[movie_id] = {"vector": vector, "payload": payload}

    async def close(self) -> None:
        return None


class RedisVectorBackend(VectorBackend):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: Redis | None = None

    async def start(self) -> None:
        self.client = Redis.from_url(self.settings.redis_url, decode_responses=True)

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any]) -> None:
        if self.client is None:
            raise RuntimeError("Redis vector backend has not started")
        key = f"{self.settings.redis_key_prefix}vector:{movie_id}"
        await self.client.set(key, json.dumps({"vector": vector, "payload": payload}))

    async def close(self) -> None:
        if self.client:
            await self.client.aclose()


class QdrantVectorBackend(VectorBackend):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: AsyncQdrantClient | None = None

    async def start(self) -> None:
        self.client = AsyncQdrantClient(
            url=self.settings.vector_db_url,
            api_key=self.settings.vector_db_api_key,
        )
        collections = await self.client.get_collections()
        names = {collection.name for collection in collections.collections}
        if self.settings.vector_collection not in names:
            await self.client.create_collection(
                collection_name=self.settings.vector_collection,
                vectors_config=VectorParams(
                    size=self.settings.vector_size,
                    distance=Distance.COSINE,
                ),
            )

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any]) -> None:
        if self.client is None:
            raise RuntimeError("Qdrant vector backend has not started")
        await self.client.upsert(
            collection_name=self.settings.vector_collection,
            points=[PointStruct(id=movie_id, vector=vector, payload=payload)],
        )

    async def close(self) -> None:
        if self.client:
            await self.client.close()


class VectorStore:
    BACKENDS = {
        "memory": MemoryVectorBackend,
        "redis": RedisVectorBackend,
        "qdrant": QdrantVectorBackend,
    }

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        backend_type = self.BACKENDS.get(settings.vector_db_provider)
        if backend_type is None:
            raise ValueError(f"Unsupported vector_db_provider: {settings.vector_db_provider}")
        self.backend = (
            backend_type()
            if settings.vector_db_provider == "memory"
            else backend_type(settings)
        )

    async def start(self) -> None:
        if self.settings.vector_db_enabled:
            await self.backend.start()

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any]) -> None:
        if not self.settings.vector_db_enabled:
            logger.info("Vector DB disabled; accepted vector for movie %s", movie_id)
            return
        await self.backend.upsert(movie_id, vector, payload)

    async def close(self) -> None:
        if self.settings.vector_db_enabled:
            await self.backend.close()


class TrainingScheduler:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.scheduler: AsyncIOScheduler | None = None

    async def start(self) -> None:
        if not self.settings.model_train_enabled:
            return
        self.scheduler = AsyncIOScheduler()
        minute, hour, day, month, day_of_week = self.settings.model_train_cron.split()
        self.scheduler.add_job(
            self.train_main_model,
            "cron",
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
        )
        self.scheduler.start()

    async def enqueue(self, request: TrainRequest) -> str:
        logger.info("Training requested for model=%s force=%s", request.modelName, request.force)
        return f"training-{request.modelName}-queued"

    async def train_main_model(self) -> None:
        logger.info("Main model training job started; implementation pending")

    async def close(self) -> None:
        if self.scheduler:
            self.scheduler.shutdown(wait=False)