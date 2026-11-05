import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from src.core.vector_health import build_vector_db_health, log_vector_db_health


def run(coro):
    return asyncio.run(coro)


def make_settings(**overrides):
    values = {
        "vector_db_enabled": True,
        "vector_db_provider": "chroma",
        "vector_collection": "movies",
        "vector_user_cf_collection": "user_cf_vectors",
        "vector_movie_cf_collection": "movie_cf_vectors",
        "vector_user_profile_collection": "user_profile_vectors",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def make_store(counts):
    return SimpleNamespace(
        collection_counts=AsyncMock(return_value=counts),
        location="C:/data/chroma_db",
    )


def test_build_vector_db_health_marks_indexed_movies():
    store = make_store({"movies": 10})

    health = run(build_vector_db_health(store, make_settings()))

    assert health == {
        "provider": "chroma",
        "location": "C:/data/chroma_db",
        "collections": {"movies": 10},
        "moviesIndexed": True,
    }


def test_build_vector_db_health_without_store():
    health = run(build_vector_db_health(None, make_settings()))

    assert health["collections"] == {}
    assert health["moviesIndexed"] is False
    assert health["provider"] is None


def test_log_vector_db_health_warns_for_empty_collections(caplog):
    store = make_store(
        {
            "movies": 0,
            "user_cf_vectors": 0,
            "movie_cf_vectors": 3,
            "user_profile_vectors": 0,
        }
    )

    with caplog.at_level("WARNING", logger="VectorHealth"):
        run(log_vector_db_health(store, make_settings()))

    assert "Collection 'movies' is empty" in caplog.text
    assert "Collection 'user_cf_vectors' is empty" in caplog.text
    assert "Collection 'user_profile_vectors' is empty" in caplog.text
    assert "Collection 'movie_cf_vectors' is empty" not in caplog.text


def test_log_vector_db_health_skips_check_when_disabled(caplog):
    store = make_store({})

    with caplog.at_level("INFO", logger="VectorHealth"):
        run(log_vector_db_health(store, make_settings(vector_db_enabled=False)))

    assert "disabled" in caplog.text
    assert "is empty" not in caplog.text
