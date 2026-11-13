import datetime
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

DataT = TypeVar("DataT")


class CurrentUser(BaseModel):
    sub: str
    email: str
    fullName: str
    scopes: list[str]
    jti: str | None = None


# ===================
# Response schema
# ===================


class Pagination(BaseModel):
    total: int
    totalPages: int
    page: int
    limit: int


class ApiResponse(BaseModel, Generic[DataT]):
    success: bool
    statusCode: int
    message: str
    result: DataT | None = None


# success response
class SuccessResponse(ApiResponse[DataT]):
    success: bool = True
    statusCode: int = 200
    result: DataT | None = None


class PaginatedResponse(ApiResponse[DataT]):
    success: bool = True
    statusCode: int = 200
    result: DataT | None = None
    pagination: Pagination | None = None


# Err response
class ErrorResponse(ApiResponse[None]):
    success: bool = False
    statusCode: int
    errorCode: str
    timestamp: str | None = None


# Similar & Semantic Search Movies Response
class SimilarMoviesResponse(BaseModel):
    id: int
    similarityScore: float
    rank: int | None = None
    title: str
    titleVi: str | None = None
    overview: str
    overviewVi: str | None = None


# Hybrid movie recommendation response
class HybridRecommendationResponse(SimilarMoviesResponse):
    hybridScore: float
    evidences: str | None = None


# ===================
# Request schema
# ===================


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    model: str = "tfidf"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=100)


class LexicalSemanticRerankRequest(BaseModel):
    keyword: str = Field(
        min_length=1, max_length=500, description="Từ khóa tìm kiếm của người dùng"
    )
    lexicalIds: list[int] = Field(
        default_factory=list,
        description="Danh sách movie ID tìm được từ PostgreSQL (Lexical Search)",
    )
    topK: int = Field(
        default=100, ge=1, le=200, description="Số lượng kết quả trả về sau rerank"
    )
    candidateK: int = Field(
        default=100, ge=10, le=200, description="Kích thước pool ứng viên Semantic"
    )


class HybridRequest(BaseModel):
    userId: str = Field(
        min_length=1, max_length=100, description="Mã định danh người dùng (UUID)"
    )
    keyword: str = Field(
        min_length=1, max_length=500, description="Từ khóa tìm kiếm (ví dụ: 'action')"
    )
    topK: int = Field(default=100, ge=1, le=1000, description="Số lượng kết quả trả về")
    page: int = Field(default=1, ge=1, description="Trang hiện tại")
    pageSize: int = Field(
        default=10, ge=1, le=100, description="Số lượng kết quả mỗi trang"
    )


class RecommendationRequest(BaseModel):
    user_id: int | None = None
    movie_ids: list[int] = Field(default_factory=list)
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=10, ge=1, le=100)


# ===================
# Event schema
# ===================


class DomainEvent(BaseModel):
    eventId: str
    eventType: str
    occurredAt: datetime.datetime
    correlationId: str
    payload: dict[str, Any]


class MovieCreated(BaseModel):
    movieId: int
    title: str
    titleVi: str
    overview: str
    overviewVi: str
    genres: list[str]


class MovieUpdated(MovieCreated):
    pass


class MovieDeleted(BaseModel):
    movieId: int


class MovieCreatedEvent(DomainEvent):
    eventType: str = "movie.created"
    payload: MovieCreated


class MovieUpdatedEvent(DomainEvent):
    eventType: str = "movie.updated"
    payload: MovieUpdated


class MovieDeletedEvent(DomainEvent):
    eventType: str = "movie.deleted"
    payload: MovieDeleted


class MovieEvent(BaseModel):
    eventId: str
    eventType: str
    movieId: int
    payload: dict[str, Any] = Field(default_factory=dict)


class UserInteractionEvent(BaseModel):
    eventId: str
    eventType: str
    userId: int
    movieId: int
    rating: float | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


class VectorUpsertRequest(BaseModel):
    movieId: int
    vector: list[float] = Field(min_length=1)
    payload: dict[str, Any] = Field(default_factory=dict)


class TrainRequest(BaseModel):
    modelName: str = "main"
    force: bool = False
