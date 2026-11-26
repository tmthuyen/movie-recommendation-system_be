from __future__ import annotations

from typing import TYPE_CHECKING, Any

from api.schemas import MovieCreated, MovieDeleted, MovieUpdated
from core.custom_exception import CustomException
from services.movie_vector_service import MovieVectorService
from utils.logger import setup_logger

if TYPE_CHECKING:
    from services.bm25_index_service import Bm25IndexService


class MovieEventHandler:
    """
    Dispatcher xu ly cac su kien phim tu RabbitMQ.

    Nhan event_type va payload, validate schema,
    roi goi truc tiep MovieVectorService va Bm25IndexService tuong ung.
    """

    def __init__(
        self,
        movie_vector_service: MovieVectorService,
        bm25_index: Bm25IndexService | None = None,
    ) -> None:
        self._movie_vector_service = movie_vector_service
        self._bm25 = bm25_index
        self._logger = setup_logger(name="FastAPI-Recommendations")

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

        # Chỉ created/updated cần text; movie.deleted chỉ có movieId.
        # kiểm trả: nếu cả title/titleVi hoặc overview/overviewVi đều trống thì raise Exception để DLQ.
        if event_type in ("movie.created", "movie.updated"):
            if (not payload.get("title") and not payload.get("titleVi")) or (
                not payload.get("overview") and not payload.get("overviewVi")
            ):
                self._logger.error(
                    f"movie={payload.get('movieId')} không hợp lệ, title/titleVi hoặc overview/overviewVi không được trống"
                )
                raise CustomException(
                    f"movie={payload.get('movieId')} không hợp lệ, title/titleVi hoặc overview/overviewVi không được trống",
                    status_code=400,
                    error_code="INVALID_PAYLOAD",
                )

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
        """Validate schema MovieCreated -> upsert vector vao Qdrant/Chroma va Qdrant BM25."""
        event = MovieCreated(**payload)
        movie_data = self._to_movie_data(event)
        await self._movie_vector_service.upsert_movie_vector(movie_data)
        if self._bm25 is not None:
            await self._bm25.upsert_movie_async(movie_data)
        self._logger.info(
            "movie.created: upsert vector thanh cong movieId=%s", event.movieId
        )

    async def _on_movie_updated(self, payload: dict[str, Any]) -> None:
        """Validate schema MovieUpdated -> cap nhat (ghi de) vector trong Qdrant/Chroma va Qdrant BM25."""
        event = MovieUpdated(**payload)
        movie_data = self._to_movie_data(event)
        await self._movie_vector_service.upsert_movie_vector(movie_data)
        if self._bm25 is not None:
            await self._bm25.upsert_movie_async(movie_data)
        self._logger.info(
            "movie.updated: upsert vector thanh cong movieId=%s", event.movieId
        )

    async def _on_movie_deleted(self, payload: dict[str, Any]) -> None:
        """Validate schema MovieDeleted -> xoa vector khoi Qdrant/Chroma va Qdrant BM25."""
        event = MovieDeleted(**payload)
        deleted_vs = await self._movie_vector_service.delete_movie_vector(event.movieId)
        deleted_bm25 = False
        if self._bm25 is not None:
            deleted_bm25 = await self._bm25.delete_movie_async(event.movieId)
        deleted = bool(deleted_vs or deleted_bm25)
        if deleted:
            self._logger.info(
                "movie.deleted: xoa vector thanh cong movieId=%s", event.movieId
            )
        else:
            self._logger.warning(
                "movie.deleted: khong xoa duoc vector movieId=%s", event.movieId
            )

    # ── Helper ────────────────────────────────────────────────────────────────

    @staticmethod
    def _to_movie_data(event: MovieCreated) -> dict[str, Any]:
        """Chuyen doi MovieCreated/MovieUpdated Pydantic model sang dict cho MovieVectorService."""
        title = event.title or event.titleVi or ""
        title_vi = event.titleVi if event.titleVi is not None else title
        overview = event.overview or event.overviewVi or ""
        overview_vi = event.overviewVi if event.overviewVi is not None else overview
        return {
            "movieId": event.movieId,
            "title": title,
            "title_vi": title_vi,
            "overview": overview,
            "overview_vi": overview_vi,
            "genres": event.genres or [],
        }
