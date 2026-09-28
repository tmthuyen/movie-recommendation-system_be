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
    result: DataT | None = None
    errorCode: str | None = None
    metadata: Pagination | None = None


class HybridRequest(BaseModel):
    userId: str = Field(min_length=1, max_length=100, description="Mã định danh người dùng (UUID)")
    keyword: str = Field(min_length=1, max_length=500, description="Từ khóa tìm kiếm (ví dụ: 'action')")
    topK: int = Field(default=100, ge=1, le=1000, description="Số lượng kết quả trả về")
    page: int = Field(default=1, ge=1, description="Trang hiện tại")
    limit: int = Field(default=10, ge=1, le=100, description="Số lượng kết quả mỗi trang")

class RecommendationRequest(BaseModel):
    userId: int | None = None
    movieIds: list[int] = Field(default_factory=list)
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=10, ge=1, le=100)


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