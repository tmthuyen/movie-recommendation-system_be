"""Unit test cho `src/models/tfidf_search.py` (TF-IDF recommender + dummy tokenizer)."""

from unittest.mock import MagicMock

import pytest

from src.models.tfidf_search import TFIDFRecommender, dummy_tokenizer

CORPUS = [
    "hành động kịch tính",
    "tình cảm lãng mạn",
    "kinh dị rùng rợn",
]
MOVIE_IDS = [1, 2, 3]


class TestDummyTokenizer:
    """Test `dummy_tokenizer`."""

    def test_returns_text_unchanged(self):
        assert dummy_tokenizer("phim hay") == "phim hay"

    def test_returns_empty_string_for_empty_input(self):
        assert dummy_tokenizer("") == ""


class TestTFIDFRecommenderInit:
    """Test `TFIDFRecommender.__init__` / `get_config`."""

    def test_default_state_not_fitted(self):
        model = TFIDFRecommender()
        assert model.is_fitted is False

    def test_get_config_contains_model_and_kwargs(self):
        model = TFIDFRecommender(max_features=123)
        config = model.get_config()
        assert config["model_class"] == "TFIDFRecommender"
        assert config["tokenizer"] == "none"
        assert config["max_features"] == 123


class TestTFIDFRecommenderFit:
    """Test `TFIDFRecommender.fit`."""

    def test_fit_marks_model_as_fitted(self):
        model = TFIDFRecommender()
        model.fit(CORPUS, MOVIE_IDS)
        assert model.is_fitted is True

    def test_fit_uses_tokenizer_tokenize_batch_when_provided(self):
        tokenizer = MagicMock()
        tokenizer.tokenize_batch.return_value = [
            ["phim", "hành"],
            ["phim", "tình"],
            ["phim", "kinh"],
        ]
        tokenizer.tokenize.return_value = ["hành"]
        tokenizer.name.return_value = "fake"

        model = TFIDFRecommender(tokenizer=tokenizer)
        model.fit(CORPUS, MOVIE_IDS)

        tokenizer.tokenize_batch.assert_called_once_with(CORPUS)


class TestTFIDFRecommenderSearch:
    """Test `TFIDFRecommender.search`."""

    def test_search_before_fit_raises(self):
        with pytest.raises(RuntimeError, match="chưa được fit"):
            TFIDFRecommender().search("hành")

    def test_fit_and_search_returns_only_positive_scores(self):
        model = TFIDFRecommender()
        model.fit(CORPUS, MOVIE_IDS)

        results = model.search("hành", top_k=10)

        assert results
        assert results[0]["movie_id"] == 1
        assert results[0]["score"] > 0
        assert all(row["score"] > 0 for row in results)

    def test_top_k_limits_results(self):
        model = TFIDFRecommender()
        model.fit(CORPUS, MOVIE_IDS)

        results = model.search("hành tình kinh", top_k=2)

        assert len(results) <= 2

    def test_uses_tokenizer_when_provided(self):
        tokenizer = MagicMock()
        tokenizer.tokenize_batch.return_value = [
            ["phim", "hành"],
            ["phim", "tình"],
            ["phim", "kinh"],
        ]
        tokenizer.tokenize.return_value = ["hành"]
        tokenizer.name.return_value = "fake"
        model = TFIDFRecommender(tokenizer=tokenizer)
        model.fit(CORPUS, MOVIE_IDS)

        results = model.search("hành")

        tokenizer.tokenize.assert_called_once_with("hành")
        assert results[0]["movie_id"] == 1

    def test_unknown_query_returns_empty_list(self):
        model = TFIDFRecommender()
        model.fit(CORPUS, MOVIE_IDS)

        assert model.search("zzzzz", top_k=10) == []


class TestTFIDFRecommenderPersistence:
    """Test `save` / `load`."""

    def test_save_and_load_roundtrip(self, tmp_path):
        model = TFIDFRecommender()
        model.fit(CORPUS, MOVIE_IDS)
        model.save(str(tmp_path))

        loaded = TFIDFRecommender()
        loaded.load(str(tmp_path))

        assert loaded.is_fitted is True
        assert loaded.search("hành") == model.search("hành")

    def test_save_before_fit_raises(self, tmp_path):
        with pytest.raises(RuntimeError, match="chưa được fit"):
            TFIDFRecommender().save(str(tmp_path))
