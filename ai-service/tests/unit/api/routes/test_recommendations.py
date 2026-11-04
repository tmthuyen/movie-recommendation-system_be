"""Unit test cho ``src/api/routes/recommendations.py``.

Mỗi endpoint được test qua ``fastapi.testclient.TestClient`` trên một app nhỏ
(``FastAPI()`` + ``include_router``). ``RecommendService`` được inject qua
``app.state.recommend_service`` bằng ``unittest.mock`` nên **không** kết nối
ChromaDB/embedding model.

Bao phủ: happy path (envelope + pagination), validate query (422), lỗi nghiệp
vụ (HTTPException 403/404) và lỗi service (500).
"""

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.routes import recommendations
from src.api.schemas import CurrentUser

PREFIX = "/api/recommendations"

SEMANTIC_RESULTS = [
    {
        "id": 11,
        "similarityScore": 0.9123,
        "title": "Movie A",
        "titleVi": "Phim A",
        "overview": "overview a",
        "overviewVi": "mo ta a",
    },
    {
        "id": 12,
        "similarityScore": 0.8123,
        "title": "Movie B",
        "titleVi": "Phim B",
        "overview": "overview b",
        "overviewVi": "mo ta b",
    },
]

SIMILAR_RESULTS = [
    {
        "id": 21,
        "similarityScore": 0.95,
        "rank": 1,
        "title": "Movie C",
        "titleVi": "Phim C",
        "overview": "overview c",
        "overviewVi": "mo ta c",
    },
]

HYBRID_RESULTS = [
    {
        "id": 31,
        "similarityScore": 0.88,
        "rank": 1,
        "hybridScore": 0.77,
        "evidences": "cf+semantic",
        "title": "Movie D",
        "titleVi": "Phim D",
        "overview": "overview d",
        "overviewVi": "mo ta d",
    }
]


@pytest.fixture
def service() -> MagicMock:
    svc = MagicMock(name="RecommendService")
    svc.semantic_search = AsyncMock(return_value=list(SEMANTIC_RESULTS))
    svc.similar_movies = AsyncMock(return_value=list(SIMILAR_RESULTS))
    svc.hybrid_recommendation = AsyncMock(return_value=list(HYBRID_RESULTS))
    return svc


@pytest.fixture
def current_user() -> CurrentUser:
    return CurrentUser(
        sub="user-1",
        email="user1@example.com",
        fullName="Nguyen Van A",
        scopes=["movie:read"],
        jti="jti-1",
    )


@pytest.fixture
def client_factory(service: MagicMock):
    """Tạo TestClient; truyền ``current_user`` để override dependency auth."""

    def factory(current_user: CurrentUser | None = None) -> TestClient:
        app = FastAPI()
        app.state.recommend_service = service
        app.include_router(recommendations.router, prefix=PREFIX)
        if current_user is not None:
            app.dependency_overrides[recommendations.get_current_user] = (
                lambda: current_user
            )
        return TestClient(app, raise_server_exceptions=False)

    return factory


# ─────────────────────────────────────────────────────────────────────────────
# GET /semantic-search
# ─────────────────────────────────────────────────────────────────────────────


class TestSemanticSearchEndpoint:
    def test_returns_paginated_success_envelope(self, client_factory):
        response = client_factory().get(
            f"{PREFIX}/semantic-search", params={"keyword": "phim hành động"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["statusCode"] == 200
        assert body["result"] == SEMANTIC_RESULTS
        assert body["pagination"] == {
            "totalItems": 2,
            "totalPages": 1,
            "currentPage": 1,
            "pageSize": 10,
        }
        assert "phim hành động" in body["message"]

    def test_passes_keyword_and_topk_to_service(self, client_factory, service):
        client_factory().get(
            f"{PREFIX}/semantic-search", params={"keyword": "space", "topK": 3}
        )

        service.semantic_search.assert_awaited_once_with(query="space", top_k=3)

    def test_custom_topk_sets_page_size(self, client_factory):
        body = client_factory().get(
            f"{PREFIX}/semantic-search", params={"keyword": "space", "topK": 3}
        ).json()

        assert body["pagination"]["pageSize"] == 3

    def test_empty_result_gives_zero_pages(self, client_factory, service):
        service.semantic_search.return_value = []

        body = client_factory().get(
            f"{PREFIX}/semantic-search", params={"keyword": "nothing"}
        ).json()

        assert body["result"] == []
        assert body["pagination"]["totalItems"] == 0
        assert body["pagination"]["totalPages"] == 0

    def test_missing_keyword_returns_422(self, client_factory):
        response = client_factory().get(f"{PREFIX}/semantic-search")

        assert response.status_code == 422

    def test_empty_keyword_returns_422(self, client_factory):
        response = client_factory().get(
            f"{PREFIX}/semantic-search", params={"keyword": ""}
        )

        assert response.status_code == 422

    def test_keyword_too_long_returns_422(self, client_factory):
        response = client_factory().get(
            f"{PREFIX}/semantic-search", params={"keyword": "a" * 501}
        )

        assert response.status_code == 422

    @pytest.mark.parametrize("top_k", [0, 101])
    def test_topk_out_of_range_returns_422(self, client_factory, top_k):
        response = client_factory().get(
            f"{PREFIX}/semantic-search", params={"keyword": "space", "topK": top_k}
        )

        assert response.status_code == 422

    def test_service_error_returns_500(self, client_factory, service):
        service.semantic_search.side_effect = RuntimeError("chroma unavailable")

        response = client_factory().get(
            f"{PREFIX}/semantic-search", params={"keyword": "space"}
        )

        assert response.status_code == 500


# ─────────────────────────────────────────────────────────────────────────────
# GET /similar/{movie_id}
# ─────────────────────────────────────────────────────────────────────────────


class TestGetSimilarMoviesEndpoint:
    def test_returns_paginated_similar_movies(self, client_factory):
        response = client_factory().get(f"{PREFIX}/similar/7")

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["result"] == SIMILAR_RESULTS
        assert body["pagination"] == {
            "totalItems": 1,
            "totalPages": 1,
            "currentPage": 1,
            "pageSize": 10,
        }
        assert "movie_id=7" in body["message"]

    def test_passes_movie_id_and_topk_to_service(self, client_factory, service):
        client_factory().get(f"{PREFIX}/similar/7", params={"topK": 5})

        service.similar_movies.assert_awaited_once_with(movie_id=7, top_k=5)

    def test_topk_sets_page_size(self, client_factory):
        body = client_factory().get(
            f"{PREFIX}/similar/7", params={"topK": 5}
        ).json()

        assert body["pagination"]["pageSize"] == 5

    def test_unknown_movie_returns_404_with_detail(self, client_factory, service):
        service.similar_movies.side_effect = ValueError(
            "Khong tim thay vector cho movieId=999"
        )

        response = client_factory().get(f"{PREFIX}/similar/999")

        assert response.status_code == 404
        assert response.json() == {
            "detail": "Khong tim thay vector cho movieId=999"
        }

    def test_non_integer_movie_id_returns_422(self, client_factory):
        response = client_factory().get(f"{PREFIX}/similar/not-a-number")

        assert response.status_code == 422

    @pytest.mark.parametrize("top_k", [0, 51])
    def test_topk_out_of_range_returns_422(self, client_factory, top_k):
        response = client_factory().get(
            f"{PREFIX}/similar/7", params={"topK": top_k}
        )

        assert response.status_code == 422

    def test_service_error_returns_500(self, client_factory, service):
        service.similar_movies.side_effect = RuntimeError("boom")

        response = client_factory().get(f"{PREFIX}/similar/7")

        assert response.status_code == 500


# ─────────────────────────────────────────────────────────────────────────────
# GET /search
# ─────────────────────────────────────────────────────────────────────────────


class TestSearchEndpoint:
    """Endpoint hiện có 2 bug (xem báo cáo); test ghi nhận hành vi hiện tại."""

    def test_get_with_query_parameters_returns_422_body_required(self, client_factory):
        """BUG 1: ``SearchRequest`` không được annotate ``Query()``.

        FastAPI coi model là request body ⇒ gọi GET kèm query string bị 422
        ``body: Field required``.
        """
        response = client_factory().get(
            f"{PREFIX}/search", params={"query": "phim", "model": "semantic"}
        )

        assert response.status_code == 422
        errors = response.json()["detail"]
        assert errors[0]["loc"] == ["body"]
        assert errors[0]["type"] == "missing"

    def test_empty_query_in_body_returns_422(self, client_factory):
        response = client_factory().request(
            "GET", f"{PREFIX}/search", json={"query": ""}
        )

        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"] == ["body", "query"]

    def test_page_size_out_of_range_in_body_returns_422(self, client_factory):
        response = client_factory().request(
            "GET", f"{PREFIX}/search", json={"query": "phim", "page_size": 0}
        )

        assert response.status_code == 422
        assert response.json()["detail"][0]["loc"] == ["body", "page_size"]

    def test_body_request_returns_500_due_to_pageSize_attribute(
        self, client_factory, service
    ):
        """BUG 2: route đọc ``request.pageSize`` nhưng schema chỉ có ``page_size``.

        Vì vậy kể cả khi gửi JSON body hợp lệ, endpoint vẫn 500 (AttributeError)
        và service không được gọi.
        """
        response = client_factory().request(
            "GET", f"{PREFIX}/search", json={"query": "phim"}
        )

        assert response.status_code == 500
        service.semantic_search.assert_not_awaited()

    def test_function_paginates_when_pageSize_is_available(self, service):
        """Hành vi mong đợi của ``search`` sau khi sửa bug ``pageSize``.

        Gọi trực tiếp hàm (không qua FastAPI) với request có thuộc tính
        ``pageSize`` để kiểm tra logic phân trang.
        """
        request = SimpleNamespace(
            query="phim", model="semantic", page=2, pageSize=3
        )
        app_request = SimpleNamespace(
            app=SimpleNamespace(
                state=SimpleNamespace(recommend_service=service)
            )
        )

        body = asyncio.run(recommendations.search(request, app_request))

        assert body["success"] is True
        assert body["result"] == SEMANTIC_RESULTS
        assert body["pagination"] == {
            "totalItems": 2,
            "totalPages": 1,
            "currentPage": 2,
            "pageSize": 3,
        }
        service.semantic_search.assert_awaited_once_with(query="phim", top_k=3)

    def test_function_returns_empty_pagination_for_unsupported_model(self, service):
        request = SimpleNamespace(query="phim", model="bm25", page=1, pageSize=10)
        app_request = SimpleNamespace(
            app=SimpleNamespace(
                state=SimpleNamespace(recommend_service=service)
            )
        )

        body = asyncio.run(recommendations.search(request, app_request))

        assert body["result"] == []
        assert body["pagination"]["totalItems"] == 0
        assert "bm25" in body["message"]
        service.semantic_search.assert_not_awaited()


# ─────────────────────────────────────────────────────────────────────────────
# GET /hybrid-search
# ─────────────────────────────────────────────────────────────────────────────


class TestHybridSearchEndpoint:
    def test_returns_paginated_recommendations(self, client_factory, current_user):
        response = client_factory(current_user).get(
            f"{PREFIX}/hybrid-search",
            params={"userId": "user-1", "keyword": "action"},
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["result"] == HYBRID_RESULTS
        assert body["pagination"] == {
            "totalItems": 1,
            "totalPages": 1,
            "currentPage": 1,
            "pageSize": 10,
        }
        assert "userId=user-1" in body["message"]

    def test_passes_user_and_topk_to_service(self, client_factory, current_user, service):
        client_factory(current_user).get(
            f"{PREFIX}/hybrid-search",
            params={"userId": "user-1", "keyword": "action", "topK": 5},
        )

        service.hybrid_recommendation.assert_awaited_once_with(
            user_uuid="user-1", top_k=5
        )

    def test_preserves_page_and_page_size(self, client_factory, current_user, service):
        service.hybrid_recommendation.return_value = list(HYBRID_RESULTS) * 3

        body = client_factory(current_user).get(
            f"{PREFIX}/hybrid-search",
            params={
                "userId": "user-1",
                "keyword": "action",
                "page": 2,
                "pageSize": 2,
            },
        ).json()

        assert body["pagination"] == {
            "totalItems": 3,
            "totalPages": 2,
            "currentPage": 2,
            "pageSize": 2,
        }

    def test_empty_result_uses_not_found_message(self, client_factory, current_user, service):
        service.hybrid_recommendation.return_value = []

        body = client_factory(current_user).get(
            f"{PREFIX}/hybrid-search",
            params={"userId": "user-1", "keyword": "action"},
        ).json()

        assert body["result"] == []
        assert body["pagination"]["totalItems"] == 0
        assert body["message"] == "Không tìm thấy gợi ý cho userId=user-1"

    def test_forbidden_when_user_does_not_match(self, client_factory, current_user, service):
        response = client_factory(current_user).get(
            f"{PREFIX}/hybrid-search",
            params={"userId": "another-user", "keyword": "action"},
        )

        assert response.status_code == 403
        assert response.json() == {
            "detail": "Không có quyền truy cập gợi ý của người khác"
        }
        assert response.headers["WWW-Authenticate"] == "Bearer"
        service.hybrid_recommendation.assert_not_awaited()

    def test_requires_authentication(self, client_factory):
        response = client_factory().get(
            f"{PREFIX}/hybrid-search",
            params={"userId": "user-1", "keyword": "action"},
        )

        assert response.status_code == 401
        assert response.json() == {"detail": "Chưa đăng nhập"}

    def test_missing_keyword_returns_422(self, client_factory, current_user):
        response = client_factory(current_user).get(
            f"{PREFIX}/hybrid-search", params={"userId": "user-1"}
        )

        assert response.status_code == 422

    def test_missing_user_id_returns_422(self, client_factory, current_user):
        response = client_factory(current_user).get(
            f"{PREFIX}/hybrid-search", params={"keyword": "action"}
        )

        assert response.status_code == 422

    @pytest.mark.parametrize("top_k", [0, 1001])
    def test_topk_out_of_range_returns_422(self, client_factory, current_user, top_k):
        response = client_factory(current_user).get(
            f"{PREFIX}/hybrid-search",
            params={"userId": "user-1", "keyword": "action", "topK": top_k},
        )

        assert response.status_code == 422

    def test_page_size_above_limit_returns_422(self, client_factory, current_user):
        response = client_factory(current_user).get(
            f"{PREFIX}/hybrid-search",
            params={"userId": "user-1", "keyword": "action", "pageSize": 101},
        )

        assert response.status_code == 422

    def test_service_error_returns_500(self, client_factory, current_user, service):
        service.hybrid_recommendation.side_effect = RuntimeError("boom")

        response = client_factory(current_user).get(
            f"{PREFIX}/hybrid-search",
            params={"userId": "user-1", "keyword": "action"},
        )

        assert response.status_code == 500


# ─────────────────────────────────────────────────────────────────────────────
# GET /hybrid/no-auth (debug)
# ─────────────────────────────────────────────────────────────────────────────


class TestHybridSearchDebugEndpoint:
    def test_returns_recommendations_without_authentication(self, client_factory):
        response = client_factory().get(
            f"{PREFIX}/hybrid/no-auth", params={"userId": "user-9"}
        )

        assert response.status_code == 200
        body = response.json()
        assert body["success"] is True
        assert body["result"] == HYBRID_RESULTS
        assert body["pagination"] == {
            "totalItems": 1,
            "totalPages": 1,
            "currentPage": 1,
            "pageSize": 10,
        }
        assert "userId=user-9" in body["message"]

    def test_default_topk_is_ten(self, client_factory, service):
        client_factory().get(f"{PREFIX}/hybrid/no-auth", params={"userId": "user-9"})

        service.hybrid_recommendation.assert_awaited_once_with(
            user_uuid="user-9", top_k=10
        )

    def test_custom_topk_is_forwarded(self, client_factory, service):
        body = client_factory().get(
            f"{PREFIX}/hybrid/no-auth", params={"userId": "user-9", "topK": 3}
        ).json()

        service.hybrid_recommendation.assert_awaited_once_with(
            user_uuid="user-9", top_k=3
        )
        assert body["pagination"]["pageSize"] == 3

    def test_missing_user_id_returns_422(self, client_factory):
        response = client_factory().get(f"{PREFIX}/hybrid/no-auth")

        assert response.status_code == 422

    def test_service_error_returns_500(self, client_factory, service):
        service.hybrid_recommendation.side_effect = RuntimeError("boom")

        response = client_factory().get(
            f"{PREFIX}/hybrid/no-auth", params={"userId": "user-9"}
        )

        assert response.status_code == 500
