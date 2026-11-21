from __future__ import annotations

from typing import Any

from core.config import get_settings
from infra.messaging.consumers.genre_event_handler import GenreEventHandler
from infra.messaging.consumers.search_event_consumer import SearchEventConsumer
from infra.messaging.event_constant import MessageEventType
from infra.messaging.event_schemas import (
    DomainEvent,
    UserCreatedPayload,
    UserDeletedPayload,
    UserUpdatedPayload,
)
from services.genre_vector_service import GenreVectorService
from services.user_vector_service import UserVectorService
from utils.logger import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")

settings = get_settings()


class UserEventHandler:
    """
    Dispatcher xu ly cac su kien phim tu RabbitMQ.

    Nhan event_type va payload thu o, validate schema,
    roi goi RecommendService de thao tac ChromaDB tuong ung.
    """

    def __init__(
        self,
        user_vector_service: UserVectorService,
        search_event_consumer: SearchEventConsumer | None = None,
        genre_event_handler: GenreEventHandler | None = None,
        genre_vector_service: GenreVectorService | None = None,
    ) -> None:
        # self._svc = recommend_service
        self._user_vector_service = user_vector_service
        self._search_event_consumer = search_event_consumer
        self._genre_event_handler = genre_event_handler
        self._genre_vector_service = genre_vector_service

    async def handle(self, event: dict[str, Any]) -> None:
        """Phân phối sự kiện user theo eventType.

        Validate envelope, log ngữ cảnh rồi gọi consumer/handler tương ứng cho
        user.search, user.genre.update và user.created/updated.profile/deleted.

        Returns:
            None; event không xử lý được chỉ ghi log và bỏ qua.
        """

        event_obj = DomainEvent.model_validate(event)
        event_type = event_obj.eventType
        payload_obj = event_obj.payload

        logger.info(
            f"[UserEventHandler] correlation_id={event_obj.correlationId}: Xử lý sự kiện event_type={event_type} | event_id={event_obj.eventId} "
        )

        if event_type == MessageEventType.USER_SEARCH:
            if self._search_event_consumer is None:
                logger.warning(
                    "[UserEventHandler] Missing search consumer for event_type=%s",
                    event_type,
                )
                return
            await self._search_event_consumer.handle(event)
            return

        if event_type == MessageEventType.USER_GENRE_UPDATE:
            if self._genre_event_handler is None:
                logger.warning(
                    "[UserEventHandler] Missing genre event handler for event_type=%s",
                    event_type,
                )
                return
            await self._genre_event_handler.handle(event)
            return

        if event_type == MessageEventType.USER_CREATED:
            validated_payload = UserCreatedPayload.model_validate(payload_obj)
            await self._on_user_profile_changed(validated_payload)
        elif event_type == MessageEventType.USER_UPDATED_PROFILE:
            validated_payload = UserUpdatedPayload.model_validate(payload_obj)
            await self._on_user_profile_changed(validated_payload)
        elif event_type == MessageEventType.USER_DELETED:
            validated_payload = UserDeletedPayload.model_validate(payload_obj)
            await self._on_user_deleted(validated_payload)
        else:
            logger.debug("Unhandled event_type: '%s', bo qua.", event_type)

    # ── Handlers ──────────────────────────────────────────────────────────────

    async def _on_user_profile_changed(self, payload: UserUpdatedPayload) -> None:
        """Cập nhật long-term và short-term từ preference của user.

        Không còn ghi `user_profile_vectors`; preference được embed một lần rồi
        trộn EMA vào hai collection long-term/short-term. Nếu event không có
        preference thì giữ nguyên vector đã học thay vì xoá.

        Returns:
            None; lỗi encode/upsert được phép lan ra để queue retry.
        """
        user_text = self._to_user_text(payload)
        if not user_text:
            logger.info(
                "User profile has no preferences; keep existing vectors UserId=%s",
                payload.userId,
            )
            return

        await self._user_vector_service.update_named_user_vectors_with_text(
            user_id=payload.userId,
            text=user_text,
            collection_names=(
                settings.vector_user_long_term_collection,
                settings.vector_user_short_term_collection,
            ),
            updated_from="user.profile",
        )
        logger.info(
            "Updated long-term/short-term vectors from profile UserId=%s",
            payload.userId,
        )

    async def _on_user_deleted(self, payload: UserDeletedPayload) -> None:
        """Xoá toàn bộ vector của người dùng khi nhận user.deleted.

        Gọi delete_all_user_vectors để xoá toàn bộ collection vector của user,
        gồm cả collection genre payload `{genreId: score}`.

        Returns:
            None.
        """
        await self._user_vector_service.delete_all_user_vectors(payload.userId)
        if self._genre_vector_service is not None:
            await self._genre_vector_service.delete_user_vector(payload.userId)
        logger.info("User.deleted: removed vectors UserId=%s", payload.userId)

    # ── Helper ────────────────────────────────────────────────────────────────

    @staticmethod
    def _to_user_text(event: UserUpdatedPayload) -> str:
        """Convert structured preferences into deterministic embedding text."""
        texts: list[str] = []
        for key, value in event.preferenceData.items():
            if value:
                texts.append(f"{key}: {', '.join(value)}")

        return "| ".join(texts)
