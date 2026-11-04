"""Unit test cho Pydantic schemas ``src/api/schemas.py``.

Bao phủ: default value, ràng buộc ``Field`` (min/max), required field,
generic ``ApiResponse`` và event schema (payload được parse thành model con).
"""

from datetime import datetime

import pytest
from pydantic import ValidationError

from src.api.schemas import (
    ApiResponse,
    CurrentUser,
    DomainEvent,
    HybridRecommendationResponse,
    HybridRequest,
    MovieCreated,
    MovieCreatedEvent,
    MovieDeleted,
    MovieEvent,
    Pagination,
    RecommendationRequest,
    SearchRequest,
    SimilarMoviesResponse,
    TrainRequest,
    UserInteractionEvent,
    VectorUpsertRequest,
)


class TestSearchRequest:
    def test_defaults(self):
        request = SearchRequest(query="phim hành động")
        assert request.model == "tfidf"
        assert request.page == 1
        assert request.page_size == 10

    def test_boundary_values_are_accepted(self):
        assert SearchRequest(query="a", page=1, page_size=1).page_size == 1
        assert SearchRequest(query="a" * 500, page_size=100).page_size == 100

    @pytest.mark.parametrize(
        "payload",
        [
            {"query": ""},
            {"query": "a" * 501},
            {"query": "ok", "page": 0},
            {"query": "ok", "page_size": 0},
            {"query": "ok", "page_size": 101},
        ],
    )
    def test_invalid_payloads_raise_validation_error(self, payload):
        with pytest.raises(ValidationError):
            SearchRequest(**payload)


class TestHybridRequest:
    def test_defaults(self):
        request = HybridRequest(userId="u-1", keyword="action")
        assert request.topK == 100
        assert request.page == 1
        assert request.pageSize == 10

    @pytest.mark.parametrize(
        "payload",
        [
            {"userId": "", "keyword": "action"},
            {"userId": "u-1", "keyword": ""},
            {"userId": "u-1", "keyword": "a" * 501},
            {"userId": "u-1", "keyword": "ok", "topK": 0},
            {"userId": "u-1", "keyword": "ok", "topK": 1001},
            {"userId": "u-1", "keyword": "ok", "pageSize": 0},
            {"userId": "u-1", "keyword": "ok", "page": 0},
        ],
    )
    def test_invalid_payloads_raise_validation_error(self, payload):
        with pytest.raises(ValidationError):
            HybridRequest(**payload)


class TestRecommendationRequest:
    def test_defaults_are_independent_between_instances(self):
        first = RecommendationRequest()
        second = RecommendationRequest()
        first.movie_ids.append(99)
        assert second.movie_ids == []
        assert first.user_id is None
        assert first.limit == 10

    @pytest.mark.parametrize("limit", [0, 101])
    def test_limit_out_of_range_is_rejected(self, limit):
        with pytest.raises(ValidationError):
            RecommendationRequest(limit=limit)

    def test_limit_boundaries_are_accepted(self):
        assert RecommendationRequest(limit=1).limit == 1
        assert RecommendationRequest(limit=100).limit == 100


class TestVectorAndEventSchemas:
    def test_vector_upsert_defaults_and_empty_vector_rejected(self):
        request = VectorUpsertRequest(movieId=1, vector=[0.1, 0.2])
        assert request.payload == {}
        with pytest.raises(ValidationError):
            VectorUpsertRequest(movieId=1, vector=[])

    def test_movie_created_event_sets_type_and_parses_payload(self):
        event = MovieCreatedEvent(
            eventId="e-1",
            occurredAt="2026-01-01T00:00:00Z",
            correlationId="c-1",
            payload={
                "movieId": 10,
                "title": "Dune",
                "titleVi": "Dune",
                "overview": "A",
                "overviewVi": "B",
                "genres": ["Sci-Fi"],
            },
        )
        assert event.eventType == "movie.created"
        assert isinstance(event.payload, MovieCreated)
        assert isinstance(event.occurredAt, datetime)

    def test_movie_created_payload_missing_field_is_rejected(self):
        with pytest.raises(ValidationError):
            MovieCreatedEvent(
                eventId="e-1",
                occurredAt="2026-01-01T00:00:00Z",
                correlationId="c-1",
                payload={"movieId": 10},
            )

    def test_domain_event_accepts_arbitrary_payload(self):
        event = DomainEvent(
            eventId="e-2",
            eventType="custom.event",
            occurredAt=datetime(2026, 1, 1),
            correlationId="c-2",
            payload={"any": ["thing"]},
        )
        assert event.eventType == "custom.event"
        assert event.payload == {"any": ["thing"]}

    def test_movie_event_and_deleted_defaults(self):
        event = MovieEvent(eventId="e-3", eventType="movie.created", movieId=5)
        assert event.payload == {}
        assert MovieDeleted(movieId=5).movieId == 5

    def test_user_interaction_event_defaults(self):
        event = UserInteractionEvent(
            eventId="e-4", eventType="interaction.created", userId=1, movieId=2
        )
        assert event.rating is None
        assert event.payload == {}


class TestResponseSchemas:
    def test_current_user_jti_is_optional(self):
        user = CurrentUser(sub="1", email="a@b.c", fullName="A", scopes=["read"])
        assert user.jti is None
        assert user.scopes == ["read"]

    def test_current_user_requires_scopes(self):
        with pytest.raises(ValidationError):
            CurrentUser(sub="1", email="a@b.c", fullName="A")

    def test_similar_movie_response_requires_core_fields(self):
        with pytest.raises(ValidationError):
            SimilarMoviesResponse(id=1, similarityScore=0.5, title="Dune")

        movie = SimilarMoviesResponse(
            id=1, similarityScore=0.5, title="Dune", overview="A"
        )
        assert movie.titleVi is None
        assert movie.rank is None

    def test_hybrid_response_requires_hybrid_score(self):
        with pytest.raises(ValidationError):
            HybridRecommendationResponse(
                id=1, similarityScore=0.5, title="Dune", overview="A"
            )

        movie = HybridRecommendationResponse(
            id=1,
            similarityScore=0.5,
            title="Dune",
            overview="A",
            hybridScore=0.9,
        )
        assert movie.hybridScore == 0.9
        assert movie.evidences is None

    def test_pagination_requires_all_fields(self):
        pagination = Pagination(totalItems=3, totalPages=1, currentPage=1, pageSize=10)
        assert pagination.model_dump() == {
            "totalItems": 3,
            "totalPages": 1,
            "currentPage": 1,
            "pageSize": 10,
        }
        with pytest.raises(ValidationError):
            Pagination(totalItems=3)

    def test_generic_api_response_keeps_result_type(self):
        response = ApiResponse[int](
            success=True, statusCode=200, message="ok", result=5
        )
        assert response.result == 5
        assert response.errorCode is None
        assert response.pagination is None

    def test_train_request_defaults(self):
        request = TrainRequest()
        assert request.modelName == "main"
        assert request.force is False
