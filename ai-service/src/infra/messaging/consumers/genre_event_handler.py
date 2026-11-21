"""Xử lý sự kiện cập nhật sở thích thể loại của người dùng."""

from __future__ import annotations

from typing import Any

from infra.messaging.event_schemas import UserGenreUpdateEvent
from services.genre_vector_service import GenreVectorService
from utils import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")


class GenreEventHandler:
    """Consumer cho event `user.genre.update` trên queue user."""

    def __init__(self, genre_vector_service: GenreVectorService) -> None:
        self._genre_vector_service = genre_vector_service

    async def handle(self, event: dict[str, Any]) -> None:
        """Cập nhật vector thể loại người dùng từ event envelope chuẩn.

        Validate event, đọc userId từ envelope, chuyển danh sách genre trong
        payload thành dict rồi gọi GenreVectorService.update_from_event. Bỏ qua
        event khi envelope không có userId.

        Returns:
            None; event không hợp lệ được ghi log và bỏ qua.
        """
        event_obj = UserGenreUpdateEvent.model_validate(event)
        payload = event_obj.payload
        user_id = event_obj.userId
        if not user_id:
            logger.warning(
                "Bỏ qua user.genre.update thiếu userId: event_id=%s",
                event_obj.eventId,
            )
            return

        genres = [genre.model_dump() for genre in payload.genres]
        await self._genre_vector_service.update_from_event(
            user_id=user_id,
            genres=genres,
            score=payload.score,
            interaction_type=payload.type,
        )
