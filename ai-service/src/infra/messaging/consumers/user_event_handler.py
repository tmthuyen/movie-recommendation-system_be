from __future__ import annotations

from typing import Any

from infra.messaging.event_constant import MessageEventType
from infra.messaging.event_schemas import (
    DomainEvent,
    UserCreatedPayload,
    UserDeletedPayload,
    UserUpdatedPayload,
)
from services.user_vector_service import UserVectorService
from utils.logger import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")


class UserEventHandler:
    """
    Dispatcher xu ly cac su kien phim tu RabbitMQ.

    Nhan event_type va payload thu o, validate schema,
    roi goi RecommendService de thao tac ChromaDB tuong ung.
    """

    def __init__(
        self,
        user_vector_service: UserVectorService,
    ) -> None:
        # self._svc = recommend_service
        self._user_vector_service = user_vector_service

    async def handle(self, event: dict[str, Any]) -> None:
        """
        Diem vao chinh: phan phoi event theo eventType.

        Parameters
        ----------
        event_type: str
            Loai su kien, VD: 'User.created', 'User.updated', 'User.deleted'
        payload: dict
            Noi dung cua truong 'payload' trong DomainEvent (da duoc parse tu JSON)

        Raises
        ------
        ValueError
            Neu payload khong du field bat buoc theo schema.
        Exception
            Re-raise moi loi khac de MessageQueue quyet dinh retry hay DLQ.
        """

        event_obj = DomainEvent.model_validate(event)
        event_type = event_obj.eventType
        payload_obj = event_obj.payload

        logger.info(
            f"[UserEventHandler] correlation_id={event_obj.correlationId}: Xử lý sự kiện event_type={event_type} | event_id={event_obj.eventId} "
        )

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
        """Create, replace, or remove the semantic profile vector."""
        user_text = self._to_user_text(payload)
        if not user_text:
            await self._user_vector_service.delete_by_id(payload.userId)
            logger.info(
                "User profile has no preferences; removed vector UserId=%s",
                payload.userId,
            )
            return

        await self._user_vector_service.update_user_profile_with_text(
            user_id=payload.userId,
            text=user_text,
        )
        logger.info("User profile vector updated UserId=%s", payload.userId)

    async def _on_user_deleted(self, payload: UserDeletedPayload) -> None:
        """Remove the user's semantic profile vector."""
        await self._user_vector_service.delete_by_id(payload.userId)
        logger.info("User.deleted: removed vector UserId=%s", payload.userId)

    # ── Helper ────────────────────────────────────────────────────────────────

    @staticmethod
    def _to_user_text(event: UserUpdatedPayload) -> str:
        """Convert structured preferences into deterministic embedding text."""
        texts: list[str] = []
        for key, value in event.preferenceData.items():
            if value:
                texts.append(f"{key}: {', '.join(value)}")

        return "| ".join(texts)
