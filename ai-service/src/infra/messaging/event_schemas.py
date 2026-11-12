import datetime
from enum import Enum
from typing import Any, Generic, TypeVar

from pydantic import BaseModel, Field

DataT = TypeVar("DataT")


# ===================
# Event schema
# ===================


class DomainEvent(BaseModel, Generic[DataT]):
    eventId: str
    eventType: str
    eventVersion: int = 1
    source: str
    occurredAt: str
    correlationId: str | None = None
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
