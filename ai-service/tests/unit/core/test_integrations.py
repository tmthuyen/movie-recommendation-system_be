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
        run(backend.upsert(1, [1.0, 0.0], {"title": "a"}))
        run(backend.upsert(2, [0.0, 1.0], {"title": "b"}))

        results = run(backend.query([1.0, 0.0], top_k=2))

        assert [row["id"] for row in results] == [1, 2]
        assert results[0]["score"] == pytest.approx(1.0)
        assert results[1]["score"] == pytest.approx(0.0)

    def test_top_k_is_respected(self):
        backend = MemoryVectorBackend()
        for idx in range(3):
            run(backend.upsert(idx, [1.0, float(idx)], {"idx": idx}))

        assert len(run(backend.query([1.0, 0.0], top_k=2))) == 2

    def test_zero_query_vector_does_not_crash(self):
        backend = MemoryVectorBackend()
        run(backend.upsert(1, [1.0, 0.0], {}))
        results = run(backend.query([0.0, 0.0]))
        assert results[0]["score"] == 0.0

    def test_close_is_noop(self):
        run(MemoryVectorBackend().close())

    def test_count_returns_number_of_items(self):
        backend = MemoryVectorBackend()
        run(backend.upsert(1, [1.0], {}))
        run(backend.upsert(2, [0.0], {}))

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
        run(store.upsert(movie_id=1, id=None, vector=[1.0, 0.0], payload={"a": 1}))

        results = run(store.query([1.0, 0.0], top_k=1))

        assert results[0]["id"] == 1
        assert results[0]["payload"] == {"a": 1}
        run(store.close())

    def test_upsert_with_external_id_delegates_to_backend(self):
        store = VectorStore(
            SimpleNamespace(vector_db_provider="memory", vector_db_enabled=True)
        )
        store.backend = MagicMock()
        store.backend.upsert = AsyncMock()

        run(
            store.upsert(
                movie_id=None,
                id="user-1",
                vector=[1.0],
                payload={"a": 1},
            )
        )

        store.backend.upsert.assert_awaited_once_with(
            movie_id="user-1",
            vector=[1.0],
            payload={"a": 1},
            collection_name=None,
        )

    def test_collection_counts_for_memory_store(self):
        settings = SimpleNamespace(
            vector_db_provider="memory",
            vector_db_enabled=True,
            vector_collection="movies",
            vector_user_cf_collection="user_cf_vectors",
            vector_movie_cf_collection="movie_cf_vectors",
            vector_user_profile_collection="user_profile_vectors",
        )
        store = VectorStore(settings)
        run(store.start())
        run(store.upsert(movie_id=1, id=None, vector=[1.0], payload={}))

        counts = run(store.collection_counts())

        assert counts == {
            "movies": 1,
            "user_cf_vectors": 1,
            "movie_cf_vectors": 1,
            "user_profile_vectors": 1,
        }
        assert store.location == "memory"

    def test_collection_counts_marks_failed_collections_as_none(self):
        settings = SimpleNamespace(
            vector_db_provider="memory",
            vector_db_enabled=True,
            vector_collection="movies",
            vector_user_cf_collection="user_cf_vectors",
            vector_movie_cf_collection="movie_cf_vectors",
            vector_user_profile_collection="user_profile_vectors",
        )
        store = VectorStore(settings)

        class FailingBackend:
            async def count(self, collection_name=None):
                raise RuntimeError("boom")

        store.backend = FailingBackend()

        assert run(store.collection_counts()) == {
            "movies": None,
            "user_cf_vectors": None,
            "movie_cf_vectors": None,
            "user_profile_vectors": None,
        }

    def test_disabled_store_has_no_counts_or_location(self):
        store = VectorStore(
            SimpleNamespace(
                vector_db_provider="memory",
                vector_db_enabled=False,
                vector_collection="movies",
                vector_user_cf_collection="user_cf_vectors",
                vector_movie_cf_collection="movie_cf_vectors",
                vector_user_profile_collection="user_profile_vectors",
            )
        )

        assert run(store.collection_counts()) == {}
        assert store.location is None


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
