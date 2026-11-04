"""Unit test cho ``services/movie_vector_service.py``.

Không kết nối ChromaDB hay load SentenceTransformer thật:

- ``fake_chroma`` (fixture trong ``tests/conftest.py``) là vector store in-memory
  cùng contract ``upsert`` / ``get_by_id`` / ``query``.
- ``fake_model`` thay cho ``SentenceTransformer``; ``EmbeddingService._model``
  được gán trực tiếp nên không có torch/model nào bị nạp.
- ``mapping_service`` (singleton đọc file mapping) được thay bằng fake nhỏ để
  kiểm soát nhánh warm-start / cold-start của hybrid recommendation.
"""

import asyncio
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from services.movie_vector_service import MovieVectorService
from src.services.embedding_service import EmbeddingService


def run(coro):
    return asyncio.run(coro)


class FakeMapping:
    """Thay ``mapping_service`` — chỉ cần ``get_user_idx`` cho hybrid."""

    def __init__(self, user_to_idx: dict[str, int] | None = None) -> None:
        self._user_to_idx = {
            str(key): value for key, value in (user_to_idx or {}).items()
        }

    def get_user_idx(self, user_uuid: str):
        return self._user_to_idx.get(str(user_uuid))


class FakeCollection:
    def __init__(self) -> None:
        self.deleted_ids: list[list[str]] = []

    def delete(self, ids):
        self.deleted_ids.append(list(ids))


class FakeChromaBackend:
    """Backend tối thiểu cho nhánh ``delete_movie_vector`` hỗ trợ xoá."""

    def __init__(self, settings, collection) -> None:
        self.settings = settings
        self._collections = {settings.vector_collection: collection}
        self._collection = collection

    def _get_collection(self, name: str):
        return self._collection


@pytest.fixture
def service(fake_chroma, fake_model, settings):
    fake_chroma.settings = settings
    embedding = EmbeddingService(model_name="MiniLM")
    embedding._model = fake_model
    return MovieVectorService(vector_store=fake_chroma, embedding_service=embedding)


def patch_query_vector(service: MovieVectorService, vector: list[float]) -> None:
    """Cố định vector truy vấn để thứ tự kết quả deterministic."""
    service._emb.encode_async = AsyncMock(return_value=vector)


class TestUpsertMovieVector:
    def test_encodes_document_and_stores_payload(
        self, service, fake_chroma, fake_model
    ):
        movie = {
            "movieId": 10,
            "title_vi": "Dune Vi",
            "title": "Dune",
            "genres": ["Sci-Fi", "Phiêu lưu"],
            "overview": "Hành tinh sa mạc",
        }

        run(service.upsert_movie_vector(movie))

        assert len(fake_chroma.upserts) == 1
        stored = fake_chroma.upserts[0]
        assert stored["movie_id"] == 10
        assert "movieId" not in stored["payload"]
        assert stored["payload"]["search_text"] == (
            "Dune Vi Hành tinh sa mạc Sci-Fi Phiêu lưu"
        )
        assert len(stored["vector"]) == fake_model.dim
        assert sum(value * value for value in stored["vector"]) == pytest.approx(1.0)
        # search_text được encode đúng một lần, như document (không phải query).
        assert fake_model.encoded == [stored["payload"]["search_text"]]

    def test_accepts_snake_case_movie_id_and_string_value(self, service, fake_chroma):
        run(service.upsert_movie_vector({"movie_id": "12", "title": "Heat"}))

        assert fake_chroma.upserts[0]["movie_id"] == 12

    def test_missing_movie_id_raises_value_error(self, service, fake_chroma):
        with pytest.raises(ValueError, match="movieId"):
            run(service.upsert_movie_vector({"title": "No id"}))

        assert fake_chroma.upserts == []

    def test_skips_when_no_searchable_metadata(
        self, service, fake_chroma, fake_model, caplog
    ):
        with caplog.at_level(logging.WARNING):
            run(service.upsert_movie_vector({"movieId": 3, "title_vi": "None"}))

        assert fake_chroma.upserts == []
        assert fake_model.encoded == []
        assert "khong du metadata" in caplog.text

    def test_falls_back_to_english_title(self, service, fake_chroma):
        run(
            service.upsert_movie_vector(
                {"movieId": 4, "title_vi": "nan", "title": "Heat"}
            )
        )

        assert fake_chroma.upserts[0]["payload"]["search_text"] == "Heat"

    def test_primitive_payload_values_keep_type(self, service, fake_chroma):
        run(
            service.upsert_movie_vector(
                {
                    "movieId": 5,
                    "title": "Heat",
                    "popularity": 7.5,
                    "adult": False,
                }
            )
        )

        payload = fake_chroma.upserts[0]["payload"]
        assert payload["popularity"] == 7.5
        assert payload["adult"] is False


class TestDeleteMovieVector:
    def test_returns_false_when_backend_does_not_support_delete(self, service):
        assert run(service.delete_movie_vector(1)) is False

    def test_deletes_from_chroma_collection(self, service, fake_chroma, settings):
        collection = FakeCollection()
        fake_chroma.backend = FakeChromaBackend(settings, collection)

        assert run(service.delete_movie_vector(7)) is True
        assert collection.deleted_ids == [["7"]]

    def test_returns_false_when_collection_not_initialised(
        self, service, fake_chroma, settings
    ):
        fake_chroma.backend = FakeChromaBackend(settings, None)

        assert run(service.delete_movie_vector(7)) is False

    def test_returns_false_for_backend_without_collections_registry(
        self, service, fake_chroma, settings
    ):
        fake_chroma.backend = SimpleNamespace(settings=settings)

        assert run(service.delete_movie_vector(7)) is False

    def test_string_movie_id_is_converted_to_int(self, service, fake_chroma, settings):
        collection = FakeCollection()
        fake_chroma.backend = FakeChromaBackend(settings, collection)

        assert run(service.delete_movie_vector("12")) is True
        assert collection.deleted_ids == [["12"]]
