"""Unit test cho `src/models/bm25_search.py` (BM25 recommender)."""

from unittest.mock import MagicMock

import pytest

from src.models.bm25_search import BM25Recommender

CORPUS = [
    "hành động kịch tính",
    "tình cảm lãng mạn",
    "kinh dị rùng rợn",
]
MOVIE_IDS = [1, 2, 3]


class TestBM25RecommenderInit:
    """Test `BM25Recommender.__init__` / `get_config`."""

    def test_default_state_not_fitted(self):
        assert BM25Recommender().is_fitted is False

    def test_get_config(self):
        config = BM25Recommender().get_config()
        assert config == {"model_class": "BM25Recommender", "tokenizer": "none"}


class TestBM25RecommenderFit:
    """Test `BM25Recommender.fit`."""

    def test_fit_marks_model_as_fitted(self):
        model = BM25Recommender()
        model.fit(CORPUS, MOVIE_IDS)
        assert model.is_fitted is True

    def test_fit_uses_tokenizer_tokenize_batch_when_provided(self):
        tokenizer = MagicMock()
        tokenizer.tokenize_batch.return_value = [["hành"], ["tình"], ["kinh"]]
        tokenizer.tokenize.return_value = ["hành"]
        tokenizer.name.return_value = "fake"

        BM25Recommender(tokenizer=tokenizer).fit(CORPUS, MOVIE_IDS)

        tokenizer.tokenize_batch.assert_called_once_with(CORPUS)


class TestBM25RecommenderSearch:
    """Test `BM25Recommender.search`."""

    def test_search_before_fit_raises(self):
        with pytest.raises(RuntimeError, match="chưa được fit"):
            BM25Recommender().search("hành")

    def test_fit_and_search_returns_positive_match(self):
        model = BM25Recommender()
        model.fit(CORPUS, MOVIE_IDS)

        results = model.search("hành", top_k=10)

        assert results[0]["movie_id"] == 1
        assert results[0]["score"] > 0
        assert all(row["score"] > 0 for row in results)

    def test_tokenizer_is_used_for_query_and_corpus(self):
        tokenizer = MagicMock()
        tokenizer.tokenize_batch.return_value = [
            ["hành"],
            ["tình"],
            ["kinh"],
        ]
        tokenizer.tokenize.return_value = ["hành"]
        tokenizer.name.return_value = "fake"
        model = BM25Recommender(tokenizer=tokenizer)
        model.fit(CORPUS, MOVIE_IDS)

        results = model.search("hành")

        tokenizer.tokenize.assert_called_once_with("hành")
        assert results[0]["movie_id"] == 1


class TestBM25RecommenderPersistence:
    """Test `save` / `load`."""

    def test_save_and_load_roundtrip(self, tmp_path):
        model = BM25Recommender()
        model.fit(CORPUS, MOVIE_IDS)
        model.save(str(tmp_path))

        loaded = BM25Recommender()
        loaded.load(str(tmp_path))

        assert loaded.is_fitted is True
        assert loaded.movie_ids == MOVIE_IDS

    def test_save_before_fit_raises(self, tmp_path):
        with pytest.raises(RuntimeError, match="chưa được fit"):
            BM25Recommender().save(str(tmp_path))
