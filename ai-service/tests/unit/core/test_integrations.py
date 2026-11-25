"""Unit test cho ``core/integrations.py`` (memory backend, Chroma helpers, facade).

Không khởi tạo ChromaDB/Qdrant/Redis thật; chỉ test logic chuyển đổi và
các nhánh ``vector_db_enabled=False``.
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest

from src.core.integrations import (
    ChromaVectorBackend,
    MemoryVectorBackend,
    QdrantVectorBackend,
    TrainingScheduler,
    VectorStore,
)


def run(coro):
    return asyncio.run(coro)


class TestMemoryVectorBackend:
    def test_empty_backend_returns_no_results(self):
        backend = MemoryVectorBackend()
        run(backend.start())
        assert run(backend.query([1.0, 0.0])) == []

    def test_upsert_and_query_cosine_order(self):
        backend = MemoryVectorBackend()
        run(backend.upsert(1, [1.0, 0.0], {"title": "a"}, "test"))
        run(backend.upsert(2, [0.0, 1.0], {"title": "b"}, "test"))

        results = run(backend.query([1.0, 0.0], top_k=2))

        assert [row["id"] for row in results] == [1, 2]
        assert results[0]["score"] == pytest.approx(1.0)
        assert results[1]["score"] == pytest.approx(0.0)

    def test_top_k_is_respected(self):
        backend = MemoryVectorBackend()
        for idx in range(3):
            run(backend.upsert(idx, [1.0, float(idx)], {"idx": idx}, "test"))

        assert len(run(backend.query([1.0, 0.0], top_k=2))) == 2

    def test_zero_query_vector_does_not_crash(self):
        backend = MemoryVectorBackend()
        run(backend.upsert(1, [1.0, 0.0], {}, "test"))
        results = run(backend.query([0.0, 0.0]))
        assert results[0]["score"] == 0.0

    def test_close_is_noop(self):
        run(MemoryVectorBackend().close())

    def test_count_returns_number_of_items(self):
        backend = MemoryVectorBackend()
        run(backend.upsert(1, [1.0], {}, "test"))
        run(backend.upsert(2, [0.0], {}, "test"))

        assert run(backend.count()) == 2
        assert backend.location == "memory"


class FakeChromaCollection:
    def __init__(self):
        self.query_kwargs = None
        self.get_result = {"ids": []}
        self.count_value = 0

    def count(self):
        return self.count_value

    def query(self, **kwargs):
        self.query_kwargs = kwargs
        return {
            "ids": [["1", "2"]],
            "distances": [[0.0, 0.5]],
            "metadatas": [[{"movie_id": 1}, {"movie_id": 2}]],
        }

    def get(self, ids, include):
        return self.get_result


class FakeChromaClient:
    def __init__(self, collection):
        self.collection = collection
        self.requested_names = []

    def get_or_create_collection(self, name, metadata=None):
        self.requested_names.append(name)
        return self.collection


def make_chroma_backend(collection):
    backend = ChromaVectorBackend.__new__(ChromaVectorBackend)
    backend._client = FakeChromaClient(collection)
    backend._collections = {}
    return backend


class TestChromaHelpers:
    def test_sanitise_meta_keeps_primitives_and_stringifies_others(self):
        meta = ChromaVectorBackend._sanitise_meta(
            {"s": "x", "i": 1, "f": 1.5, "b": True, "list": [1, 2], "dict": {"a": 1}}
        )
        assert meta["s"] == "x"
        assert meta["i"] == 1
        assert meta["f"] == 1.5
        assert meta["b"] is True
        assert isinstance(meta["list"], str)
        assert isinstance(meta["dict"], str)

    def test_sync_query_converts_distance_to_similarity(self):
        collection = FakeChromaCollection()
        backend = make_chroma_backend(collection)

        results = backend._sync_query(
            [1.0, 0.0], top_k=2, where=None, collection_name="movies"
        )

        assert results == [
            {"id": 1, "score": 1.0, "payload": {"movie_id": 1}},
            {"id": 2, "score": 0.5, "payload": {"movie_id": 2}},
        ]
        assert collection.query_kwargs["n_results"] == 2
        assert "where" not in collection.query_kwargs

    def test_sync_query_passes_where_filter(self):
        collection = FakeChromaCollection()
        backend = make_chroma_backend(collection)

        backend._sync_query(
            [1.0], top_k=1, where={"genre": "action"}, collection_name="movies"
        )

        assert collection.query_kwargs["where"] == {"genre": "action"}

    def test_sync_get_by_id_returns_vector_and_payload(self):
        collection = FakeChromaCollection()
        collection.get_result = {
            "ids": ["1"],
            "embeddings": [[0.1, 0.2]],
            "metadatas": [{"movie_id": 1}],
        }
        backend = make_chroma_backend(collection)

        result = backend._sync_get_by_id(1, collection_name="movies")

        assert result == {
            "id": 1,
            "vector": [0.1, 0.2],
            "payload": {"movie_id": 1},
        }

    def test_sync_get_by_id_handles_numpy_embeddings(self):
        collection = FakeChromaCollection()
        collection.get_result = {
            "ids": ["1"],
            "embeddings": np.array([[0.1, 0.2]]),
            "metadatas": [{}],
        }
        backend = make_chroma_backend(collection)

        assert backend._sync_get_by_id(1, collection_name="movies")[
            "vector"
        ] == pytest.approx([0.1, 0.2])

    def test_sync_get_by_id_missing_returns_none(self):
        backend = make_chroma_backend(FakeChromaCollection())
        assert backend._sync_get_by_id(1, collection_name="movies") is None

    def test_sync_get_by_id_without_embeddings_returns_none_vector(self):
        collection = FakeChromaCollection()
        collection.get_result = {
            "ids": ["1"],
            "embeddings": None,
            "metadatas": [{"a": 1}],
        }
        backend = make_chroma_backend(collection)

        result = backend._sync_get_by_id(1, collection_name="movies")

        assert result["vector"] is None
        assert result["payload"] == {"a": 1}

    def test_sync_count_returns_collection_count(self):
        collection = FakeChromaCollection()
        collection.count_value = 7
        backend = make_chroma_backend(collection)

        assert backend._sync_count(collection_name="movies") == 7
        assert run(backend.count(collection_name="movies")) == 7


class TestVectorStoreFacade:
    def test_unsupported_provider_raises(self):
        with pytest.raises(ValueError, match="Unsupported vector_db_provider"):
            VectorStore(SimpleNamespace(vector_db_provider="unknown"))

    def test_disabled_store_accepts_write_and_returns_no_reads(self):
        store = VectorStore(
            SimpleNamespace(vector_db_provider="memory", vector_db_enabled=False)
        )

        run(store.upsert(movie_id=1, id=None, vector=[1.0], payload={"a": 1}))
        assert run(store.query([1.0])) == []
        assert run(store.get_by_id(1)) is None
        run(store.close())
        assert store.backend.items == {}

    def test_enabled_memory_store_roundtrip(self):
        store = VectorStore(
            SimpleNamespace(vector_db_provider="memory", vector_db_enabled=True)
        )
        run(store.start())
        run(
            store.upsert(
                movie_id=1,
                id=None,
                vector=[1.0, 0.0],
                payload={"a": 1},
                collection_name="test",
            )
        )

        results = run(store.query([1.0, 0.0], top_k=1))

        assert results[0]["id"] == 1
        assert results[0]["payload"] == {"a": 1}
        run(store.close())


class TestTrainingScheduler:
    @staticmethod
    def make_scheduler(redis_store=None):
        return TrainingScheduler(
            SimpleNamespace(model_train_enabled=False),
            redis_store=redis_store or MagicMock(),
        )

    def test_start_disabled_does_not_create_scheduler(self):
        scheduler = self.make_scheduler()
        run(scheduler.start())
        assert scheduler.scheduler is None

    def test_enqueue_returns_job_name_and_creates_task(self, monkeypatch):
        scheduler = self.make_scheduler()
        created = []

        def fake_create_task(coro):
            created.append(coro)
            coro.close()
            return MagicMock()

        monkeypatch.setattr(asyncio, "create_task", fake_create_task)

        name = run(scheduler.enqueue(SimpleNamespace(modelName="main", force=True)))

        assert name == "training-main-queued"
        assert len(created) == 1

    def test_train_uses_redis_store_and_resets_flag(self, monkeypatch):
        service = MagicMock()
        service.run_training_pipeline = AsyncMock()
        service_factory = MagicMock(return_value=service)
        monkeypatch.setattr(
            "src.core.integrations.ModelTrainingService", service_factory
        )
        redis_store = MagicMock(name="redis_store")
        scheduler = self.make_scheduler(redis_store)

        run(scheduler.train_main_model())

        service_factory.assert_called_once_with(redis_store=redis_store)
        service.run_training_pipeline.assert_awaited_once()
        assert scheduler.is_training is False

    def test_train_skips_when_already_running(self, monkeypatch):
        service_factory = MagicMock()
        monkeypatch.setattr(
            "src.core.integrations.ModelTrainingService", service_factory
        )
        scheduler = self.make_scheduler()
        scheduler.is_training = True

        run(scheduler.train_main_model())

        service_factory.assert_not_called()
        assert scheduler.is_training is True

    def test_train_propagates_failure_and_resets_flag(self, monkeypatch):
        service = MagicMock()
        service.run_training_pipeline = AsyncMock(side_effect=RuntimeError("boom"))
        service_factory = MagicMock(return_value=service)
        monkeypatch.setattr(
            "src.core.integrations.ModelTrainingService", service_factory
        )
        scheduler = self.make_scheduler()

        with pytest.raises(RuntimeError, match="boom"):
            run(scheduler.train_main_model())

        assert scheduler.is_training is False

    def test_close_calls_scheduler_shutdown(self):
        scheduler = self.make_scheduler()
        scheduler.scheduler = MagicMock()
        run(scheduler.close())
        scheduler.scheduler.shutdown.assert_called_once_with(wait=False)

    def test_close_without_scheduler_is_noop(self):
        run(self.make_scheduler().close())


class TestQdrantVectorBackend:
    def make_backend(self):
        settings = SimpleNamespace(
            vector_db_url="http://localhost:6333",
            vector_db_api_key=None,
            vector_collection="movies",
            vector_size=384,
            vector_user_long_term_collection="user_long_term_vectors",
            vector_user_short_term_collection="user_short_term_vectors",
            vector_user_search_collection="user_search_vectors",
            vector_user_profile_collection="user_profile_vectors",
        )
        return QdrantVectorBackend(settings)

    def test_normalize_point_id(self):
        backend = self.make_backend()
        assert backend._normalize_point_id(123) == 123
        assert backend._normalize_point_id("456") == 456
        uuid_str = "c9bf9e57-1685-4c89-bafb-ff5af830be8a"
        assert backend._normalize_point_id(uuid_str) == uuid_str
        mock_str = "user-test-1"
        norm = backend._normalize_point_id(mock_str)
        assert isinstance(norm, str)
        assert len(norm) == 36  # valid uuid string

    def test_start_precreates_collections(self):
        backend = self.make_backend()
        mock_client = AsyncMock()
        mock_client.collection_exists.return_value = False
        backend.client = mock_client

        run(backend._ensure_collection("user_long_term_vectors"))
        mock_client.create_collection.assert_called_once()
        assert "user_long_term_vectors" in backend._known_collections

        # Calling again uses cached set, does not call create_collection again
        run(backend._ensure_collection("user_long_term_vectors"))
        assert mock_client.create_collection.call_count == 1

    def test_upsert_with_uuid_creates_collection_if_needed(self):
        backend = self.make_backend()
        mock_client = AsyncMock()
        mock_client.collection_exists.return_value = False
        backend.client = mock_client

        uuid_str = "c9bf9e57-1685-4c89-bafb-ff5af830be8a"
        run(
            backend.upsert(
                id=uuid_str,
                vector=[0.1] * 384,
                payload={"user_id": uuid_str},
                collection_name="user_long_term_vectors",
            )
        )

        mock_client.create_collection.assert_called_once()
        mock_client.upsert.assert_called_once()
        call_kwargs = mock_client.upsert.call_args[1]
        assert call_kwargs["collection_name"] == "user_long_term_vectors"
        points = call_kwargs["points"]
        assert len(points) == 1
        assert points[0].id == uuid_str

    def test_get_by_id_with_uuid(self):
        backend = self.make_backend()
        mock_client = AsyncMock()
        mock_client.collection_exists.return_value = True
        uuid_str = "c9bf9e57-1685-4c89-bafb-ff5af830be8a"
        rec = SimpleNamespace(
            id=uuid_str, vector=[0.5] * 384, payload={"user_id": uuid_str}
        )
        mock_client.retrieve.return_value = [rec]
        backend.client = mock_client

        result = run(
            backend.get_by_id(
                id=uuid_str,
                collection_name="user_long_term_vectors",
            )
        )
        assert result is not None
        assert result["id"] == uuid_str
        assert result["payload"]["user_id"] == uuid_str

    def test_query_supports_uuid_results(self):
        backend = self.make_backend()
        mock_client = AsyncMock()
        mock_client.collection_exists.return_value = True
        uuid_str = "c9bf9e57-1685-4c89-bafb-ff5af830be8a"
        hit1 = SimpleNamespace(id=198082, score=0.9, payload={"title": "Avengers"})
        hit2 = SimpleNamespace(id=uuid_str, score=0.8, payload={"user_id": uuid_str})
        mock_client.query_points.return_value = SimpleNamespace(points=[hit1, hit2])
        backend.client = mock_client

        results = run(backend.query([0.1] * 384, top_k=2))
        assert len(results) == 2
        assert results[0]["id"] == 198082
        assert results[1]["id"] == uuid_str
