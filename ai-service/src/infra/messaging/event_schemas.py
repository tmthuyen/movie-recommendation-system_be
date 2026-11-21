import datetime
from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

DataT = TypeVar("DataT")


# ===================
# Event schema
# ===================


class DomainEvent(BaseModel, Generic[DataT]):
    """Envelope chung của sự kiện domain.

    Các trường định danh người dùng và ngữ cảnh nằm ở envelope, không nằm trong
    payload của event.
    """

    eventId: str
    eventType: str
    eventVersion: int = 1
    source: str
    occurredAt: str
    correlationId: str | None = None
    userId: str | None = None
    payload: DataT


# ===================
# Interaction Event schema
# ===================
class InteractionAction(str, Enum):
    VIEW = "view"
    CLICK = "click"
    LIKE = "like"
    # DISLIKE = "dislike"
    RATING = "rating"
    COMMENT = "comment"


class InteractionCreatedPayload(BaseModel):
    userId: str
    movieId: int
    action: str
    score: float | None = None
    removed: bool = False
    createdAt: str


class InteractionCreatedEvent(DomainEvent[InteractionCreatedPayload]):
    eventType: str = "interaction.created"


class InteractionListPayload(BaseModel):
    interactions: list[InteractionCreatedPayload]


class TrainingBatchEvent(DomainEvent[InteractionListPayload]):
    eventType: str = "training.batch"


# ===================
# User Event schema
# ===================
class UserUpdatedPayload(BaseModel):
    userId: str
    preferenceData: dict[str, list[str]] = Field(default_factory=dict)


class UserCreatedPayload(UserUpdatedPayload):
    email: str
    fullName: str
    status: str


class UserSearchPayload(BaseModel):
    """Payload của sự kiện tìm kiếm: userId nằm cùng keyword."""

    userId: str
    mode: str = "semantic"
    keywordRaw: str = ""
    keywordNormalized: str = ""


class UserSearchEvent(DomainEvent[UserSearchPayload]):
    eventType: str = "user.search"


class GenreRef(BaseModel):
    """Một thể loại được backend gửi kèm tương tác."""

    id: int
    name: str = ""


class UserGenreUpdatePayload(BaseModel):
    """Payload của sự kiện cập nhật trọng số thể loại người dùng.

    `type` là loại tương tác để ai-service tự chuẩn hoá `score` theo band.
    """

    type: str
    genres: list[GenreRef]
    score: float


class UserGenreUpdateEvent(DomainEvent[UserGenreUpdatePayload]):
    eventType: str = "user.genre.update"


class UserDeletedPayload(BaseModel):
    userId: str


# class MovieCreated(BaseModel):
#     movieId: int
#     title: str
#     titleVi: str
#     overview: str
#     overviewVi: str
#     genres: list[str]


# class MovieUpdated(MovieCreated):
#     pass


# class MovieDeleted(BaseModel):
#     movieId: int


# class MovieCreatedEvent(DomainEvent):
#     eventType: str = "movie.created"
#     payload: MovieCreated


# class MovieUpdatedEvent(DomainEvent):
#     eventType: str = "movie.updated"
#     payload: MovieUpdated


# class MovieDeletedEvent(DomainEvent):
#     eventType: str = "movie.deleted"
#     payload: MovieDeleted


# class MovieEvent(BaseModel):
#     eventId: str
#     eventType: str
#     movieId: int
#     payload: dict[str, Any] = Field(default_factory=dict)
