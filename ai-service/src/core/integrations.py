import asyncio
import json
from abc import ABC, abstractmethod
from typing import Any


from apscheduler.schedulers.asyncio import AsyncIOScheduler
from redis.asyncio import Redis
from qdrant_client import AsyncQdrantClient
from qdrant_client.models import Distance, PointStruct, VectorParams

from api.schemas import TrainRequest
from .config import Settings
from utils import setup_logger
from services.model_training_service import ModelTrainingService


logger = setup_logger(name='FastAPI-Recommendations', filename=__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Vector Backends
# ─────────────────────────────────────────────────────────────────────────────

class VectorBackend(ABC):
    @abstractmethod
    async def start(self) -> None:
        raise NotImplementedError

    @abstractmethod
    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any], collection_name: str | None = None) -> None:
        raise NotImplementedError

    @abstractmethod
    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None, collection_name: str | None = None
    ) -> list[dict[str, Any]]:
        """Return top_k nearest neighbours as [{id, score, payload}]."""
        raise NotImplementedError

    async def get_by_id(self, movie_id: int, collection_name: str | None = None) -> dict | None:
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

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any], collection_name: str | None = None) -> None:
        self.items[movie_id] = {"vector": vector, "payload": payload}

    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None, collection_name: str | None = None
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

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any], collection_name: str | None = None) -> None:
        if self.client is None:
            raise RuntimeError("Redis vector backend has not started")
        key = f"{self.settings.redis_key_prefix}vector:{movie_id}"
        await self.client.set(key, json.dumps({"vector": vector, "payload": payload}))

    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None, collection_name: str | None = None
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

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any], collection_name: str | None = None) -> None:
        if self.client is None:
            raise RuntimeError("Qdrant vector backend has not started")
        await self.client.upsert(
            collection_name=collection_name or self.settings.vector_collection,
            points=[PointStruct(id=movie_id, vector=vector, payload=payload)],
        )

    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None, collection_name: str | None = None
    ) -> list[dict[str, Any]]:
        if self.client is None:
            raise RuntimeError("Qdrant vector backend has not started")
        hits = await self.client.search(
            collection_name=collection_name or self.settings.vector_collection,
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
        self._collections = {}

    # ── lifecycle ────────────────────────────────────────────────────────────

    def _sync_start(self) -> None:
        import chromadb  # lazy so app starts even if chromadb is not installed

        self._client = chromadb.PersistentClient(path=self.settings.chroma_persist_dir)
        # Initialize default collection
        self._get_collection(self.settings.vector_collection)
        
        # Pre-initialize hybrid collections
        self._get_collection(self.settings.vector_user_cf_collection)
        self._get_collection(self.settings.vector_movie_cf_collection)
        self._get_collection(self.settings.vector_user_profile_collection)
        
        logger.info("ChromaDB ready  persist_dir=%s", self.settings.chroma_persist_dir)

    def _get_collection(self, name: str):
        if self._client is None:
            raise RuntimeError("ChromaVectorBackend has not started")
        if name not in self._collections:
            self._collections[name] = self._client.get_or_create_collection(
                name=name, metadata={"hnsw:space": "cosine"}
            )
        return self._collections[name]

    async def start(self) -> None:
        await asyncio.to_thread(self._sync_start)

    # ── write ────────────────────────────────────────────────────────────────

    @staticmethod
    def _sanitise_meta(payload: dict[str, Any]) -> dict[str, Any]:
        return {
            k: (v if isinstance(v, (str, int, float, bool)) else str(v))
            for k, v in payload.items()
        }

    def _sync_upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any], collection_name: str | None = None) -> None:
        collection = self._get_collection(collection_name or self.settings.vector_collection)
        collection.upsert(
            ids=[str(movie_id)],
            embeddings=[vector],
            metadatas=[self._sanitise_meta(payload)],
        )

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any], collection_name: str | None = None) -> None:
        await asyncio.to_thread(self._sync_upsert, movie_id, vector, payload, collection_name)

    # ── read ─────────────────────────────────────────────────────────────────

    def _sync_query(
        self, vector: list[float], top_k: int, where: dict | None, collection_name: str | None = None
    ) -> list[dict[str, Any]]:
        collection = self._get_collection(collection_name or self.settings.vector_collection)
        kwargs: dict[str, Any] = {
            "query_embeddings": [vector],
            "n_results": top_k,
            "include": ["metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where
        results = collection.query(**kwargs)
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
        self, vector: list[float], top_k: int = 10, where: dict | None = None, collection_name: str | None = None
    ) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._sync_query, vector, top_k, where, collection_name)

    def _sync_get_by_id(self, movie_id: int, collection_name: str | None = None) -> dict | None:
        collection = self._get_collection(collection_name or self.settings.vector_collection)
        res = collection.get(ids=[str(movie_id)], include=["embeddings", "metadatas"])
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

    async def get_by_id(self, movie_id: int, collection_name: str | None = None) -> dict | None:
        return await asyncio.to_thread(self._sync_get_by_id, movie_id, collection_name)

    def get_collection_count(self, collection_name: str | None = None) -> int:
        """Synchronous helper — safe to call from one-off scripts."""
        collection = self._get_collection(collection_name or self.settings.vector_collection)
        return collection.count()

    # ── teardown ─────────────────────────────────────────────────────────────

    async def close(self) -> None:
        # PersistentClient persists on every write; no explicit flush needed.
        self._collections.clear()
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

    async def upsert(self, movie_id: int, vector: list[float], payload: dict[str, Any], collection_name: str | None = None) -> None:
        if not self.settings.vector_db_enabled:
            logger.info("Vector DB disabled; accepted vector for movie %s", movie_id)
            return
        await self.backend.upsert(movie_id, vector, payload, collection_name)

    async def query(
        self, vector: list[float], top_k: int = 10, where: dict | None = None, collection_name: str | None = None
    ) -> list[dict[str, Any]]:
        if not self.settings.vector_db_enabled:
            return []
        return await self.backend.query(vector, top_k, where, collection_name)

    async def get_by_id(self, movie_id: int, collection_name: str | None = None) -> dict | None:
        if not self.settings.vector_db_enabled:
            return None
        return await self.backend.get_by_id(movie_id, collection_name)

    async def close(self) -> None:
        if self.settings.vector_db_enabled:
            await self.backend.close()


# ─────────────────────────────────────────────────────────────────────────────
# Training Scheduler
# ─────────────────────────────────────────────────────────────────────────────

class TrainingScheduler:
    def __init__(self, settings: Settings, app_state: Any = None) -> None:
        self.settings = settings
        self.scheduler: AsyncIOScheduler | None = None
        self.app_state = app_state
        self.is_training = False

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
        # trigger immediately in background
        asyncio.create_task(self.train_main_model())
        return f"training-{request.modelName}-queued"

    async def train_main_model(self) -> None:
        if self.is_training:
            logger.info("Training is already in progress, skipping this request.")
            return
            
        self.is_training = True
        logger.info("Main model training job started")
        if self.app_state and hasattr(self.app_state, 'vector_store'):
            svc = ModelTrainingService(vector_store=self.app_state.vector_store)
            await svc.run_training_pipeline()
        else:
            logger.error("Cannot run training pipeline: vector_store not found in app_state")
        self.is_training = False

    async def close(self) -> None:
        if self.scheduler:
            self.scheduler.shutdown(wait=False)
