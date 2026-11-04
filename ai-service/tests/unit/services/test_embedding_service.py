"""Unit test cho ``services/embedding_service.py``.

Không load SentenceTransformer thật: ``_get_model`` được thay bằng ``FakeModel``
(fixture trong ``tests/conftest.py``) nên test chạy nhanh, không cần torch model.
"""

import asyncio

from src.services.embedding_service import (
    EmbeddingService,
    format_document_text_for_model,
    format_query_text_for_model,
)


class TestPromptFormatting:
    def test_e5_query_gets_query_prefix(self):
        assert format_query_text_for_model("phim hay", "intfloat/e5-base") == (
            "query: phim hay"
        )

    def test_e5_document_gets_passage_prefix(self):
        assert format_document_text_for_model("phim hay", "e5-large") == (
            "passage: phim hay"
        )

    def test_existing_prefix_is_not_duplicated(self):
        assert format_query_text_for_model("query: phim", "e5-base") == "query: phim"
        assert (
            format_document_text_for_model("passage: phim", "e5-base")
            == "passage: phim"
        )

    def test_non_e5_model_keeps_text_unchanged(self):
        assert format_query_text_for_model("phim", "MiniLM") == "phim"
        assert format_document_text_for_model("phim", "MiniLM") == "phim"


class TestEmbeddingService:
    def test_default_dimension_is_loaded_from_model(self, fake_model):
        service = EmbeddingService()
        service._model = fake_model
        assert service.dimension == fake_model.dim

    def test_encode_query_returns_list_and_normalizes(self, fake_model):
        service = EmbeddingService(model_name="MiniLM")
        service._model = fake_model

        vector = service.encode_query("phim hành động")

        assert isinstance(vector, list)
        assert len(vector) == fake_model.dim
        assert fake_model.encoded == ["phim hành động"]

    def test_encode_applies_e5_query_prefix(self, fake_model):
        service = EmbeddingService(model_name="e5-base")
        service._model = fake_model

        service.encode_query("phim hay")

        assert fake_model.encoded == ["query: phim hay"]

    def test_encode_document_applies_passage_prefix(self, fake_model):
        service = EmbeddingService(model_name="e5-base")
        service._model = fake_model

        service.encode_document("nội dung phim")

        assert fake_model.encoded == ["passage: nội dung phim"]

    def test_encode_async_returns_same_vector(self, fake_model):
        service = EmbeddingService(model_name="MiniLM")
        service._model = fake_model

        sync_vector = service.encode_query("phim")
        async_vector = asyncio.run(service.encode_query_async("phim"))

        assert async_vector == sync_vector

    def test_empty_text_still_returns_vector(self, fake_model):
        service = EmbeddingService(model_name="MiniLM")
        service._model = fake_model
        assert len(service.encode_query("")) == fake_model.dim
