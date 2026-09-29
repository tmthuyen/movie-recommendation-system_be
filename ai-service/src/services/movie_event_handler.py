from __future__ import annotations

from typing import Any

from api.schemas import MovieCreated, MovieDeleted, MovieUpdated
from services.recommend_service import RecommendService
from utils.logger import setup_logger


class MovieEventHandler:
    """
    Dispatcher xu ly cac su kien phim tu RabbitMQ.

    Nhan event_type va payload thu o, validate schema,
    roi goi RecommendService de thao tac ChromaDB tuong ung.
    """

    def __init__(self, recommend_service: RecommendService) -> None:
        self._svc = recommend_service
        self._logger = setup_logger("movie_event_handler")

    async def handle(self, event_type: str, payload: dict[str, Any]) -> None:
        """
        Diem vao chinh: phan phoi event theo eventType.

        Parameters
        ----------
        event_type: str
            Loai su kien, VD: 'movie.created', 'movie.updated', 'movie.deleted'
        payload: dict
            Noi dung cua truong 'payload' trong DomainEvent (da duoc parse tu JSON)

        Raises
        ------
        ValueError
            Neu payload khong du field bat buoc theo schema.
        Exception
            Re-raise moi loi khac de MessageQueue quyet dinh retry hay DLQ.
        """
        if event_type == "movie.created":
            await self._on_movie_created(payload)
        elif event_type == "movie.updated":
            await self._on_movie_updated(payload)
        elif event_type == "movie.deleted":
            await self._on_movie_deleted(payload)
        else:
            self._logger.debug("Unhandled event_type: '%s', bo qua.", event_type)

    # ── Handlers ──────────────────────────────────────────────────────────────

    async def _on_movie_created(self, payload: dict[str, Any]) -> None:
        """Validate schema MovieCreated -> upsert vector moi vao ChromaDB."""
        event = MovieCreated(**payload)
        movie_data = self._to_movie_data(event)
        await self._svc.upsert_movie_vector(movie_data)
        self._logger.info("movie.created: upsert vector thanh cong movieId=%s", event.movieId)

    async def _on_movie_updated(self, payload: dict[str, Any]) -> None:
        """Validate schema MovieUpdated -> cap nhat (ghi de) vector trong ChromaDB."""
        event = MovieUpdated(**payload)
        movie_data = self._to_movie_data(event)
        await self._svc.upsert_movie_vector(movie_data)
        self._logger.info("movie.updated: upsert vector thanh cong movieId=%s", event.movieId)

    async def _on_movie_deleted(self, payload: dict[str, Any]) -> None:
        """Validate schema MovieDeleted -> xoa vector khoi ChromaDB."""
        event = MovieDeleted(**payload)
        deleted = await self._svc.delete_movie_vector(event.movieId)
        if deleted:
            self._logger.info("movie.deleted: xoa vector thanh cong movieId=%s", event.movieId)
        else:
            self._logger.warning("movie.deleted: khong xoa duoc vector movieId=%s", event.movieId)

    # ── Helper ────────────────────────────────────────────────────────────────

    @staticmethod
    def _to_movie_data(event: MovieCreated) -> dict[str, Any]:
        """Chuyen doi MovieCreated/MovieUpdated Pydantic model sang dict cho RecommendService."""
        return {
            "movieId": event.movieId,
            "title": event.title,
            "title_vi": event.titleVi,
            "overview": event.overview,
            "overview_vi": event.overviewVi,
            "genres": event.genres,
        }
