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
    totalItems: int
    totalPages: int
    currentPage: int
    pageSize: int


class ApiResponse(BaseModel, Generic[DataT]):
    success: bool
    statusCode: int
    message: str
    result: DataT | None = None
    errorCode: str | None = None
    metadata: Pagination | None = None



# ===================
# Request schema
# ===================

class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    model: str = "tfidf"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=10, ge=1, le=100)

class HybridRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=100, description="Mã định danh người dùng (UUID)")
    keyword: str = Field(min_length=1, max_length=500, description="Từ khóa tìm kiếm (ví dụ: 'action')")
    top_k: int = Field(default=100, ge=1, le=1000, description="Số lượng kết quả trả về")
    page: int = Field(default=1, ge=1, description="Trang hiện tại")
    page_size: int = Field(default=10, ge=1, le=100, description="Số lượng kết quả mỗi trang")

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
