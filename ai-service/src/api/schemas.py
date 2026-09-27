from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field


DataT = TypeVar("DataT")


class Pagination(BaseModel):
    totalItems: int
    totalPages: int
    currentPage: int
    pageSize: int


class ApiResponse(BaseModel, Generic[DataT]):
    success: bool
    statusCode: int
    message: str
    data: DataT | None = None
    errorCode: str | None = None
    metadata: Pagination | None = None


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    model: str = "tfidf"
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=10, ge=1, le=100)


class RecommendationRequest(BaseModel):
    userId: int | None = None
    movieIds: list[int] = Field(default_factory=list)
    page: int = Field(default=1, ge=1)
    pageSize: int = Field(default=10, ge=1, le=100)


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