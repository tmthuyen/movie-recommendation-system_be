import asyncio
import json
from abc import ABC, abstractmethod
from typing import Any

try:
    import aio_pika
except ImportError:
    aio_pika = None
try:
    from apscheduler.schedulers.asyncio import AsyncIOScheduler
except ImportError:
    AsyncIOScheduler = None
try:
    from qdrant_client import AsyncQdrantClient
except ImportError:
    AsyncQdrantClient = None
try:
    from qdrant_client.models import Distance, PointStruct, VectorParams
except ImportError:
    Distance = PointStruct = VectorParams = None
try:
    from redis.asyncio import Redis
except ImportError:
    Redis = None
try:
    from utils import setup_logger
except ImportError:
    import logging
    def setup_logger(n): return logging.getLogger(n)

try:
    from api.schemas import MovieEvent, TrainRequest, UserInteractionEvent
except Exception:
    MovieEvent = TrainRequest = UserInteractionEvent = None
from .config import Settings


logger = setup_logger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Message Queue
# ─────────────────────────────────────────────────────────────────────────────

class MessageQueue:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.connection = None
        self.channel = None
        self.consumer_tag = None
        # Injected after startup to avoid circular import
        self._recommend_service: Any | None = None

    def set_recommend_service(self, svc: Any) -> None:
        """Inject RecommendService sau khi khởi tạo app."""
        self._recommend_service = svc

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

    async def _handle_message(self, message: Any) -> None:
        async with message.process():
            try:
                payload = json.loads(message.body.decode("utf-8"))
            except Exception as exc:
                logger.error("_handle_message: failed to decode message body: %s", exc)
                return

            event_type: str = payload.get("eventType", "")
            event_id: str = payload.get("eventId", "")
            logger.info("Received event type=%s id=%s", event_type, event_id)

            svc = self._recommend_service
            if svc is None:
                logger.warning("_handle_message: RecommendService chua duoc inject, bo qua event %s", event_id)
                return

            movie_payload: dict[str, Any] = payload.get("payload") or {}
            movie_id: int | None = payload.get("movieId") or movie_payload.get("movieId")

            if event_type in ("movie.created", "movie.updated"):
                if movie_id is None:
                    logger.warning("_handle_message: %s thieu movieId, bo qua.", event_type)
                    return
                movie_data: dict[str, Any] = {"movieId": movie_id, **movie_payload}
                try:
                    await svc.upsert_movie_vector(movie_data)
                    logger.info("_handle_message: upsert vector thanh cong movieId=%s event=%s", movie_id, event_type)
                except Exception as exc:
                    logger.error("_handle_message: upsert_movie_vector that bai movieId=%s: %s", movie_id, exc)

            elif event_type == "movie.deleted":
                if movie_id is None:
                    logger.warning("_handle_message: movie.deleted thieu movieId, bo qua.")
                    return
                try:
                    deleted = await svc.delete_movie_vector(int(movie_id))
                    if deleted:
                        logger.info("_handle_message: xoa vector thanh cong movieId=%s", movie_id)
                    else:
                        logger.warning("_handle_message: khong the xoa vector movieId=%s", movie_id)
                except Exception as exc:
                    logger.error("_handle_message: delete_movie_vector that bai movieId=%s: %s", movie_id, exc)

            else:
                logger.debug("_handle_message: event_type='%s' khong duoc xu ly.", event_type)

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


# ─────────────────────────────────────────────────────────────────────────────
# Redis Store (cache)
# ─────────────────────────────────────────────────────────────────────────────

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


# ─────────────────────────────────────────────────────────────────────────────
# Vector Backends
# ─────────────────────────────────────────────────────────────────────────────

class VectorBackend(ABC):
    @abstractmethod
    async def start(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any]) -> None:
        raise NotImplementedError

    @abstractmethod
    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None
    ) -> list[dict[str, Any]]:
        """Return top_k nearest neighbours as [{id, score, payload}]."""
        raise NotImplementedError

    async def get_by_id(self, movie_id: int) -> dict | None:
        return None

    @abstractmethod
    async def close(self) -> None:
        raise NotImplementedError


class MemoryVectorBackend(VectorBackend):
    """In-memory brute-force cosine — for dev / unit tests only."""

    def __init__(self) -> None:
        self.items: dict[int, dict[str, Any]] = {}

    async def start(self) -> None:
        return None

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any]) -> None:
        self.items[movie_id] = {"vector": vector, "payload": payload}

    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None
    ) -> list[dict[str, Any]]:
        import numpy as np

        if not self.items:
            return []
        q = np.array(vector, dtype=float)
        q_norm = np.linalg.norm(q)
        results = []
        for mid, item in self.items.items():
            v = np.array(item["vector"], dtype=float)
            score = float(np.dot(q, v) / (q_norm * np.linalg.norm(v) + 1e-9))
            results.append({"id": mid, "score": score, "payload": item["payload"]})
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

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

    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None
    ) -> list[dict[str, Any]]:
        logger.warning("RedisVectorBackend does not support ANN query; returning empty list.")
        return []

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

    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None
    ) -> list[dict[str, Any]]:
        if self.client is None:
            raise RuntimeError("Qdrant vector backend has not started")
        hits = await self.client.search(
            collection_name=self.settings.vector_collection,
            query_vector=vector,
            limit=top_k,
        )
        return [{"id": h.id, "score": h.score, "payload": h.payload} for h in hits]

    async def close(self) -> None:
        if self.client:
            await self.client.close()


class ChromaVectorBackend(VectorBackend):
    """Persistent ChromaDB vector backend (cosine, 384-dim multilingual SBERT).

    ChromaDB's Python client is synchronous.  All blocking calls are wrapped in
    ``asyncio.to_thread`` so the event loop is never stalled.

    Notes
    -----
    - ChromaDB requires string IDs; ``movie_id`` (int) is converted on the fly.
    - Metadata values must be ``str | int | float | bool``; anything else is
      coerced to ``str`` before storage.
    - Distance returned by ChromaDB is cosine-distance (0 = identical).
      We convert it to similarity score: ``score = 1 - distance``.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._client = None
        self._collection = None

    # ── lifecycle ────────────────────────────────────────────────────────────

    def _sync_start(self) -> None:
        import chromadb  # lazy so app starts even if chromadb is not installed

        self._client = chromadb.PersistentClient(path=self.settings.chroma_persist_dir)
        self._collection = self._client.get_or_create_collection(
            name=self.settings.vector_collection,
            metadata={"hnsw:space": "cosine"},
        )
        count = self._collection.count()
        logger.info(
            "ChromaDB ready  persist_dir=%s  collection=%s  vectors=%d",
            self.settings.chroma_persist_dir,
            self.settings.vector_collection,
            count,
        )

    async def start(self) -> None:
        await asyncio.to_thread(self._sync_start)

    # ── write ────────────────────────────────────────────────────────────────

    @staticmethod
    def _sanitise_meta(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            k: (v if isinstance(v, (str, int, float, bool)) else str(v))
            for k, v in payload.items()
        }

    def _sync_upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any]) -> None:
        if self._collection is None:
            raise RuntimeError("ChromaVectorBackend has not started")
        self._collection.upsert(
            ids=[str(movie_id)],
            embeddings=[vector],
            metadatas=[self._sanitise_meta(payload)],
        )

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any]) -> None:
        await asyncio.to_thread(self._sync_upsert, movie_id, vector, payload)

    # ── read ─────────────────────────────────────────────────────────────────

    def _sync_query(
        self, vector: list[float], top_k: int, where: dict | None
    ) -> list[dict[str, Any]]:
        if self._collection is None:
            raise RuntimeError("ChromaVectorBackend has not started")
        kwargs: dict[str, Any] = {
            "query_embeddings": [vector],
            "n_results": top_k,
            "include": ["metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where
        results = self._collection.query(**kwargs)
        output: list[dict[str, Any]] = []
        for rid, dist, meta in zip(
            results.get("ids", [[]])[0],
            results.get("distances", [[]])[0],
            results.get("metadatas", [[]])[0],
        ):
            # cosine distance in range [0, 2]; convert to similarity [-1, 1]
            output.append({"id": int(rid), "score": float(1.0 - dist), "payload": meta or {}})
        return output

    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None
    ) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._sync_query, vector, top_k, where)

    def _sync_get_by_id(self, movie_id: int) -> dict | None:
        if self._collection is None:
            return None
        res = self._collection.get(ids=[str(movie_id)], include=["embeddings", "metadatas"])
        if res and res.get("ids") and len(res["ids"]) > 0:
            embeddings = res.get("embeddings")
            metadatas = res.get("metadatas")
            vec = (
                embeddings[0].tolist()
                if hasattr(embeddings[0], "tolist")
                else embeddings[0]
            ) if embeddings is not None and len(embeddings) > 0 else None
            meta = metadatas[0] if metadatas is not None and len(metadatas) > 0 else {}
            return {"id": movie_id, "vector": vec, "payload": meta}
        return None

    async def get_by_id(self, movie_id: int) -> dict | None:
        return await asyncio.to_thread(self._sync_get_by_id, movie_id)

    def get_collection_count(self) -> int:
        """Synchronous helper — safe to call from one-off scripts."""
        if self._collection is None:
            return 0
        return self._collection.count()

    # ── teardown ─────────────────────────────────────────────────────────────

    async def close(self) -> None:
        # PersistentClient persists on every write; no explicit flush needed.
        self._collection = None
        self._client = None


# ─────────────────────────────────────────────────────────────────────────────
# VectorStore facade — used by FastAPI app
# ─────────────────────────────────────────────────────────────────────────────

class VectorStore:
    BACKENDS: dict[str, type] = {
        "memory": MemoryVectorBackend,
        "redis": RedisVectorBackend,
        "qdrant": QdrantVectorBackend,
        "chroma": ChromaVectorBackend,
    }

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        backend_type = self.BACKENDS.get(settings.vector_db_provider)
        if backend_type is None:
            raise ValueError(f"Unsupported vector_db_provider: {settings.vector_db_provider}")
        self.backend: VectorBackend = (
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

    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None
    ) -> list[dict[str, Any]]:
        if not self.settings.vector_db_enabled:
            return []
        return await self.backend.query(vector, top_k, where)

    async def get_by_id(self, movie_id: int) -> dict | None:
        if not self.settings.vector_db_enabled:
            return None
        return await self.backend.get_by_id(movie_id)

    async def close(self) -> None:
        if self.settings.vector_db_enabled:
            await self.backend.close()


# ─────────────────────────────────────────────────────────────────────────────
# Training Scheduler
# ─────────────────────────────────────────────────────────────────────────────

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
