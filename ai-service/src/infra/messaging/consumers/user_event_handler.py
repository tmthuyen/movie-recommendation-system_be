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
            await self._on_user_profile_changed(validated_payload.model_dump())
        elif event_type == MessageEventType.USER_UPDATED_PROFILE:
            # preferenceData là jsonb; không validate bằng schema cũ (chỉ nhận string[]).
            await self._on_user_profile_changed(
                payload_obj if isinstance(payload_obj, dict) else {}
            )
        elif event_type == MessageEventType.USER_DELETED:
            validated_payload = UserDeletedPayload.model_validate(payload_obj)
            await self._on_user_deleted(validated_payload)
        else:
            logger.debug("Unhandled event_type: '%s', bo qua.", event_type)

    # ── Handlers ──────────────────────────────────────────────────────────────

    async def _on_user_profile_changed(self, payload: dict[str, Any]) -> None:
        """Cập nhật long/short-term và payload genre từ preference của user.

        `preferenceData` được đọc như JSON tuỳ ý: `name` dùng để embed,
        `id` dùng để set `genre_scores[id] = 1.0`. Không đụng vector dense của
        collection genre.

        Returns:
            None; lỗi encode/upsert được phép lan ra để queue retry.
        """
        user_id = str(payload.get("userId") or "")
        if not user_id:
            logger.warning("User profile event thiếu userId, bỏ qua")
            return

        preference_data = payload.get("preferenceData")
        preference_data = preference_data if isinstance(preference_data, dict) else {}

        genres = self._extract_genre_refs(preference_data.get("genre"))
        if genres and self._genre_vector_service is not None:
            await self._genre_vector_service.set_preferred_genres(
                user_id=user_id,
                genres=genres,
            )
            logger.info("Updated genre payload from profile UserId=%s", user_id)

        user_text = self._to_user_text(preference_data)
        if not user_text:
            logger.info(
                "User profile has no preferences; keep existing vectors UserId=%s",
                user_id,
            )
            return

        await self._user_vector_service.update_named_user_vectors_with_text(
            user_id=user_id,
            text=user_text,
            collection_names=(
                settings.vector_user_long_term_collection,
                settings.vector_user_short_term_collection,
            ),
            updated_from="user.profile",
        )
        logger.info(
            "Updated long-term/short-term vectors from profile UserId=%s",
            user_id,
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
    def _to_user_text(preference_data: dict[str, Any]) -> str:
        """Convert structured preferences (string hoặc {id,name}) sang text embed."""
        texts: list[str] = []
        for key, values in preference_data.items():
            if not isinstance(values, list):
                continue
            names: list[str] = []
            for value in values:
                if isinstance(value, dict):
                    name = value.get("name")
                    if isinstance(name, str) and name:
                        names.append(name)
                elif isinstance(value, str) and value:
                    names.append(value)
            if names:
                texts.append(f"{key}: {', '.join(names)}")

        return "| ".join(texts)

    @staticmethod
    def _extract_genre_refs(raw: Any) -> list[dict[str, Any]]:
        """Lấy danh sách `{id,name}` hợp lệ từ `preferenceData.genre`."""
        if not isinstance(raw, list):
            return []
        result: list[dict[str, Any]] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            try:
                genre_id = int(item.get("id"))
            except (TypeError, ValueError):
                continue
            name = item.get("name")
            if genre_id <= 0 or not isinstance(name, str) or not name:
                continue
            result.append({"id": genre_id, "name": name})
        return result
