"""Unit test cho ``services/movie_event_handler.py`` — mock RecommendService."""

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from infra.messaging.consumers.movie_event_handler import MovieEventHandler

CREATED_PAYLOAD = {
    "movieId": 10,
    "title": "Dune",
    "titleVi": "Dune",
    "overview": "A desert planet",
    "overviewVi": "Hành tinh sa mạc",
    "genres": ["Sci-Fi"],
}


def make_handler(delete_result: bool = True):
    service = MagicMock()
    service.upsert_movie_vector = AsyncMock()
    service.delete_movie_vector = AsyncMock(return_value=delete_result)
    return MovieEventHandler(service), service


def run(coro):
    return asyncio.run(coro)


class TestMovieEventDispatch:
    @pytest.mark.parametrize("event_type", ["movie.created", "movie.updated"])
    def test_created_and_updated_upsert_vector(self, event_type):
        handler, service = make_handler()

        run(handler.handle(event_type, CREATED_PAYLOAD))

        service.upsert_movie_vector.assert_awaited_once_with(
            {
                "movieId": 10,
                "title": "Dune",
                "title_vi": "Dune",
                "overview": "A desert planet",
                "overview_vi": "Hành tinh sa mạc",
                "genres": ["Sci-Fi"],
            }
        )

    def test_deleted_calls_delete_without_upsert(self):
        handler, service = make_handler(delete_result=True)

        run(handler.handle("movie.deleted", {"movieId": 10}))

        service.delete_movie_vector.assert_awaited_once_with(10)
        service.upsert_movie_vector.assert_not_awaited()

    def test_deleted_when_vector_missing_still_returns(self):
        handler, service = make_handler(delete_result=False)

        run(handler.handle("movie.deleted", {"movieId": 999}))

        service.delete_movie_vector.assert_awaited_once_with(999)

    def test_unknown_event_is_ignored(self):
        handler, service = make_handler()

        run(handler.handle("movie.unknown", {"anything": 1}))

        service.upsert_movie_vector.assert_not_awaited()
        service.delete_movie_vector.assert_not_awaited()


class TestMovieEventValidation:
    @pytest.mark.parametrize(
        "payload",
        [
            {**CREATED_PAYLOAD, "title": ""},
            {**CREATED_PAYLOAD, "overview": ""},
        ],
    )
    def test_missing_title_or_overview_raises(self, payload):
        handler, service = make_handler()
        with pytest.raises(Exception, match="Title or overview is required"):
            run(handler.handle("movie.created", payload))
        service.upsert_movie_vector.assert_not_awaited()

    def test_created_payload_missing_genres_raises_validation_error(self):
        handler, _ = make_handler()
        payload = {k: v for k, v in CREATED_PAYLOAD.items() if k != "genres"}
        with pytest.raises(ValidationError):
            run(handler.handle("movie.created", payload))

    def test_deleted_payload_missing_movie_id_raises_validation_error(self):
        handler, _ = make_handler()
        with pytest.raises(ValidationError):
            run(handler.handle("movie.deleted", {}))


class TestToMovieData:
    def test_maps_pydantic_model_to_recommend_service_dict(self):
        from src.api.schemas import MovieCreated

        event = MovieCreated(**CREATED_PAYLOAD)
        data = MovieEventHandler._to_movie_data(event)

        assert data == {
            "movieId": 10,
            "title": "Dune",
            "title_vi": "Dune",
            "overview": "A desert planet",
            "overview_vi": "Hành tinh sa mạc",
            "genres": ["Sci-Fi"],
        }
