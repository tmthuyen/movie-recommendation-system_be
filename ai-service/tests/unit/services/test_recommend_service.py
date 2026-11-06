"""Unit test cho ``services/recommend_service.py``.

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

import src.services.recommend_service as recommend_module
from src.services.embedding_service import EmbeddingService
from src.services.recommend_service import (
    RecommendService,
    _build_search_text,
    _format_item,
)


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
    return RecommendService(fake_chroma, embedding)


def patch_query_vector(service: RecommendService, vector: list[float]) -> None:
    """Cố định vector truy vấn để thứ tự kết quả deterministic."""
    service._emb.encode_async = AsyncMock(return_value=vector)


# ─────────────────────────────────────────────────────────────────────────────
# Hàm helper module-level
# ─────────────────────────────────────────────────────────────────────────────


class TestBuildSearchText:
    """`recommend_service` dùng lại `data_loader.build_search_text`
    (format: "title overview genres", join bằng khoảng trắng)."""

    def test_prefers_vietnamese_title_and_joins_list_genres(self):
        text = _build_search_text(
            {
                "title_vi": "Dune: Hành tinh cát",
                "title": "Dune",
                "genres": ["Sci-Fi", "Phiêu lưu"],
                "overview": "Một hành tinh sa mạc.",
            }
        )

        assert text == ("Dune: Hành tinh cát Một hành tinh sa mạc. Sci-Fi Phiêu lưu")

    @pytest.mark.parametrize("missing_title", ["", None, "nan", "None", "   "])
    def test_falls_back_to_english_title(self, missing_title):
        text = _build_search_text({"title_vi": missing_title, "title": "Dune"})

        assert text == "Dune"

    def test_uses_title_en_when_title_absent(self):
        text = _build_search_text({"title_en": "Alien"})

        assert text == "Alien"

    def test_joins_string_genres_and_skips_nan_overview(self):
        text = _build_search_text(
            {"title": "Heat", "genres": "Crime Drama", "overview": "nan"}
        )

        assert text == "Heat Crime Drama"

    def test_empty_payload_returns_empty_string(self):
        assert _build_search_text({}) == ""
        assert _build_search_text({"genres": []}) == ""


class TestFormatItem:
    def test_formats_fields_and_rounds_similarity_score(self):
        item = {
            "id": 7,
            "score": 0.123456,
            "payload": {
                "title": "Dune",
                "title_vi": "Dune Vi",
                "overview": "A desert planet",
                "overview_vi": "Hành tinh sa mạc",
            },
        }

        assert _format_item(item) == {
            "id": 7,
            "movieId": 7,
            "similarityScore": 0.1235,
            "title": "Dune Vi",
            "titleVi": "Dune Vi",
            "overview": "A desert planet",
            "overviewVi": "Hành tinh sa mạc",
            "genres": None,
            "genreNames": [],
        }

    def test_includes_rank_when_provided(self):
        formatted = _format_item({"id": 1, "score": 0.5, "rank": 3})

        assert formatted["rank"] == 3

    def test_omits_rank_when_missing(self):
        formatted = _format_item({"id": 1, "score": 0.5})

        assert "rank" not in formatted

    def test_nan_vietnamese_title_falls_back_to_english_title(self):
        formatted = _format_item(
            {"id": 1, "score": 0.5, "payload": {"title": "Alien", "title_vi": "nan"}}
        )

        assert formatted["title"] == "Alien"
        assert formatted["titleVi"] is None

    def test_missing_payload_and_score_use_safe_defaults(self):
        formatted = _format_item({"id": 2})

        assert formatted["similarityScore"] == 0.0
        assert formatted["title"] is None
        assert formatted["overview"] is None


# ─────────────────────────────────────────────────────────────────────────────
# RecommendService
# ─────────────────────────────────────────────────────────────────────────────


class TestSemanticSearch:
    def test_returns_sorted_hits_with_payload(self, service, fake_chroma):
        fake_chroma.seed(
            1, [1.0, 0.0], {"title_vi": "Dune", "overview": "A desert planet"}
        )
        fake_chroma.seed(2, [0.0, 1.0], {"title": "Alien", "overview": "In space"})
        patch_query_vector(service, [1.0, 0.0])

        results = run(service.semantic_search("phim hành động"))

        assert [item["id"] for item in results] == [1, 2]
        assert results[0]["similarityScore"] == pytest.approx(1.0)
        assert results[0]["title"] == "Dune"
        assert results[1]["title"] == "Alien"

    def test_encodes_query_with_embedding_service(
        self, service, fake_chroma, fake_model
    ):
        fake_chroma.seed(3, [1.0, 0.0], {"title": "Heat"})

        results = run(service.semantic_search("truy vấn"))

        assert fake_model.encoded == ["truy vấn"]
        assert [item["id"] for item in results] == [3]

    def test_passes_top_k_to_vector_store(self, service, fake_chroma):
        for movie_id in (1, 2, 3):
            fake_chroma.seed(movie_id, [1.0, 0.0], {"title": str(movie_id)})
        patch_query_vector(service, [1.0, 0.0])
        fake_chroma.query = AsyncMock(wraps=fake_chroma.query)

        results = run(service.semantic_search("phim", top_k=2))

        assert len(results) == 2
        assert fake_chroma.query.await_args.kwargs["top_k"] == 2

    def test_empty_vector_store_returns_empty_list(self, service, fake_chroma):
        patch_query_vector(service, [1.0, 0.0])

        assert run(service.semantic_search("không có gì")) == []

    def test_vector_store_error_propagates(self, service, fake_chroma):
        fake_chroma.query = AsyncMock(side_effect=RuntimeError("vector store down"))

        with pytest.raises(RuntimeError, match="vector store down"):
            run(service.semantic_search("phim"))


class TestSimilarMovies:
    def test_excludes_target_and_returns_closest(self, service, fake_chroma):
        fake_chroma.seed(1, [1.0, 0.0], {"title": "Target"})
        fake_chroma.seed(2, [0.9, 0.1], {"title": "Very close"})
        fake_chroma.seed(3, [0.0, 1.0], {"title": "Far"})

        results = run(service.similar_movies(1, top_k=2))

        assert [item["id"] for item in results] == [2, 3]

    def test_top_k_is_applied_after_removing_target(self, service, fake_chroma):
        fake_chroma.seed(1, [1.0, 0.0], {"title": "Target"})
        fake_chroma.seed(2, [0.9, 0.1], {"title": "A"})
        fake_chroma.seed(3, [0.5, 0.5], {"title": "B"})

        results = run(service.similar_movies(1, top_k=1))

        assert [item["id"] for item in results] == [2]

    def test_missing_target_raises_value_error(self, service):
        with pytest.raises(ValueError, match="movieId=99"):
            run(service.similar_movies(99))

    def test_target_without_vector_raises_value_error(self, service, fake_chroma):
        fake_chroma.seed(5, [], {"title": "No vector"})

        with pytest.raises(ValueError, match="movieId=5"):
            run(service.similar_movies(5))

    def test_vector_store_error_propagates(self, service, fake_chroma):
        fake_chroma.seed(1, [1.0, 0.0], {"title": "Target"})
        fake_chroma.query = AsyncMock(side_effect=RuntimeError("query failed"))

        with pytest.raises(RuntimeError, match="query failed"):
            run(service.similar_movies(1))


class TestSimilarMoviesRerank:
    """`similar_movies_rerank` — ANN candidates + genre-aware rerank."""

    def test_missing_target_vector_raises(self, service, fake_chroma):
        with pytest.raises(ValueError, match="movieId=99"):
            run(service.similar_movies_rerank(99))

    def test_mode_off_returns_cosine_order_without_target(self, service, fake_chroma):
        fake_chroma.seed(1, [1.0, 0.0], {"genres": ["Action"]})
        fake_chroma.seed(2, [0.9, 0.1], {"genres": ["Drama"]})
        fake_chroma.seed(3, [0.5, 0.5], {"genres": ["Action"]})

        results = run(service.similar_movies_rerank(1, top_k=2, mode="off"))

        assert [item["id"] for item in results] == [2, 3]

    def test_strict_keeps_only_shared_genres(self, service, fake_chroma):
        fake_chroma.seed(1, [1.0, 0.0], {"genres": ["Action"]})
        fake_chroma.seed(2, [0.9, 0.1], {"genres": ["Drama"]})
        fake_chroma.seed(3, [0.5, 0.5], {"genres": ["Action"]})

        results = run(service.similar_movies_rerank(1, mode="strict"))

        assert [item["id"] for item in results] == [3]

    def test_soft_mode_exposes_raw_cosine_and_ranking_score(self, service, fake_chroma):
        fake_chroma.seed(1, [1.0, 0.0], {"genres": ["Action"]})
        fake_chroma.seed(2, [0.9, 0.1], {"genres": ["Drama"]})
        fake_chroma.seed(3, [0.5, 0.5], {"genres": ["Action"]})

        results = run(
            service.similar_movies_rerank(1, mode="soft", genre_weight=0.5, top_k=3)
        )

        by_id = {item["id"]: item for item in results}
        # similarityScore = cosine gốc; rankingScore = điểm sau rerank.
        assert by_id[3]["similarityScore"] == pytest.approx(0.7071, abs=1e-3)
        assert by_id[3]["rankingScore"] > by_id[3]["similarityScore"]
        assert by_id[3]["genreSimilarity"] == pytest.approx(1.0)
        assert by_id[2]["rankingScore"] <= by_id[2]["similarityScore"] + 1e-9
        assert by_id[2]["genreSimilarity"] == pytest.approx(0.0)

    def test_duplicate_and_invalid_ids_are_skipped(self, service, fake_chroma):
        fake_chroma.seed(1, [1.0, 0.0], {"genres": ["Action"]})
        fake_chroma.seed(2, [0.9, 0.1], {"genres": ["Action"]})
        fake_chroma.query = AsyncMock(
            return_value=[
                {"id": 2, "score": 0.9, "payload": {"genres": ["Action"]}},
                {"id": 2, "score": 0.9, "payload": {"genres": ["Action"]}},
                {"id": "bad", "score": 0.8, "payload": {}},
                {"id": 3, "score": 0.5, "payload": {"genres": ["Action"]}},
            ]
        )

        results = run(service.similar_movies_rerank(1, mode="off"))

        assert [item["id"] for item in results] == [2, 3]

    def test_invalid_mode_propagates_value_error(self, service, fake_chroma):
        fake_chroma.seed(1, [1.0, 0.0], {"genres": ["Action"]})
        fake_chroma.seed(2, [0.9, 0.1], {"genres": ["Action"]})

        with pytest.raises(ValueError, match="mode"):
            run(service.similar_movies_rerank(1, mode="unknown"))


class TestHybridRecommendation:
    def seed_user_vectors(self, fake_chroma, settings, user_idx: int) -> None:
        fake_chroma.seed(
            user_idx,
            [1.0, 0.0, 0.0],
            {"user_uuid": "u-1"},
            settings.vector_user_cf_collection,
        )
        fake_chroma.seed(
            user_idx,
            [1.0, 0.0, 0.0],
            {},
            settings.vector_user_profile_collection,
        )

    def test_combines_cf_and_semantic_scores(
        self, service, fake_chroma, settings, monkeypatch
    ):
        monkeypatch.setattr(
            recommend_module, "mapping_service", FakeMapping({"u-1": 7})
        )
        self.seed_user_vectors(fake_chroma, settings, 7)
        fake_chroma.seed(
            101,
            [1.0, 0.0, 0.0],
            {"movieId": 101},
            settings.vector_movie_cf_collection,
        )
        fake_chroma.seed(
            102,
            [0.0, 1.0, 0.0],
            {"movieId": 102},
            settings.vector_movie_cf_collection,
        )
        fake_chroma.seed(
            101,
            [1.0, 0.0, 0.0],
            {"title": "Dune", "title_vi": "Dune Vi", "overview": "A"},
            settings.vector_collection,
        )
        fake_chroma.seed(
            102,
            [0.0, 1.0, 0.0],
            {"title": "Alien", "overview": "B"},
            settings.vector_collection,
        )

        results = run(service.hybrid_recommendation("u-1", top_k=10))

        assert [item["id"] for item in results] == [101, 102]
        assert results[0]["hybridScore"] == pytest.approx(1.0)
        assert results[0]["hybridScore"] == results[0]["similarityScore"]
        assert len(results[0]["evidences"]) == 2
        assert "CF" in results[0]["evidences"][0]
        assert "Semantic" in results[0]["evidences"][1]
        assert results[0]["title"] == "Dune Vi"

    def test_user_in_mapping_without_cf_vector_uses_semantic_only(
        self, service, fake_chroma, settings, monkeypatch
    ):
        monkeypatch.setattr(
            recommend_module, "mapping_service", FakeMapping({"u-2": 5})
        )
        fake_chroma.seed(
            5, [1.0, 0.0, 0.0], {}, settings.vector_user_profile_collection
        )
        fake_chroma.seed(
            201,
            [1.0, 0.0, 0.0],
            {"title": "Semantic only"},
            settings.vector_collection,
        )

        results = run(service.hybrid_recommendation("u-2", top_k=5))

        assert [item["id"] for item in results] == [201]
        assert results[0]["hybridScore"] == pytest.approx(0.4)
        assert len(results[0]["evidences"]) == 1

    def test_cold_start_without_any_vector_returns_empty(
        self, service, fake_chroma, monkeypatch
    ):
        monkeypatch.setattr(recommend_module, "mapping_service", FakeMapping())

        assert run(service.hybrid_recommendation("unknown-user", top_k=5)) == []

    def test_cold_start_uses_hash_pseudo_id_for_semantic_profile(
        self, service, fake_chroma, settings, monkeypatch
    ):
        monkeypatch.setattr(recommend_module, "mapping_service", FakeMapping())
        pseudo_id = abs(hash("unknown-user")) % (10**9)
        fake_chroma.seed(
            pseudo_id, [1.0, 0.0, 0.0], {}, settings.vector_user_profile_collection
        )
        fake_chroma.seed(
            301,
            [1.0, 0.0, 0.0],
            {"title": "Cold start hit"},
            settings.vector_collection,
        )

        results = run(service.hybrid_recommendation("unknown-user", top_k=5))

        assert [item["id"] for item in results] == [301]

    def test_hits_without_movie_metadata_are_skipped(
        self, service, fake_chroma, settings, monkeypatch
    ):
        monkeypatch.setattr(
            recommend_module, "mapping_service", FakeMapping({"u-3": 9})
        )
        fake_chroma.seed(
            9,
            [1.0, 0.0, 0.0],
            {"user_uuid": "u-3"},
            settings.vector_user_cf_collection,
        )
        fake_chroma.seed(
            401,
            [1.0, 0.0, 0.0],
            {"movieId": 401},
            settings.vector_movie_cf_collection,
        )

        assert run(service.hybrid_recommendation("u-3", top_k=5)) == []

    def test_top_k_limits_combined_results(
        self, service, fake_chroma, settings, monkeypatch
    ):
        monkeypatch.setattr(
            recommend_module, "mapping_service", FakeMapping({"u-5": 3})
        )
        fake_chroma.seed(
            3,
            [1.0, 0.0],
            {"user_uuid": "u-5"},
            settings.vector_user_cf_collection,
        )
        for movie_id, vector in (
            (501, [1.0, 0.0]),
            (502, [0.9, 0.1]),
            (503, [0.8, 0.2]),
        ):
            fake_chroma.seed(
                movie_id,
                vector,
                {"movieId": movie_id},
                settings.vector_movie_cf_collection,
            )
            fake_chroma.seed(
                movie_id,
                vector,
                {"title": f"Movie {movie_id}"},
                settings.vector_collection,
            )

        results = run(service.hybrid_recommendation("u-5", top_k=2))

        assert [item["id"] for item in results] == [501, 502]

    def test_vector_store_error_propagates(
        self, service, fake_chroma, settings, monkeypatch
    ):
        monkeypatch.setattr(
            recommend_module, "mapping_service", FakeMapping({"u-4": 11})
        )
        self.seed_user_vectors(fake_chroma, settings, 11)
        fake_chroma.query = AsyncMock(side_effect=RuntimeError("hybrid query failed"))

        with pytest.raises(RuntimeError, match="hybrid query failed"):
            run(service.hybrid_recommendation("u-4"))
