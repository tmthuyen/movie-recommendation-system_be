"""Xử lý sự kiện tìm kiếm của người dùng từ queue user.search."""

from __future__ import annotations

from typing import Any

import numpy as np

from core.config import get_settings
from infra.messaging.event_schemas import UserSearchEvent
from services.embedding_service import EmbeddingService
from services.user_vector_service import UserVectorService
from utils import setup_logger
from utils.search_keyword_utils import normalize_search_keyword

logger = setup_logger(name="FastAPI-Recommendations")

settings = get_settings()

LONG_TERM_SEARCH_ALPHA = 0.2


class SearchEventConsumer:
    """Chuẩn hoá keyword, lưu vector tìm kiếm và cập nhật vector dài hạn."""

    def __init__(
        self,
        user_vector_service: UserVectorService,
        embedding_service: EmbeddingService,
    ) -> None:
        self._user_vector_service = user_vector_service
        self._embedding_service = embedding_service

    async def handle(self, event: dict[str, Any]) -> None:
        """Xử lý sự kiện user.search từ envelope chuẩn.

        Đọc userId từ payload, occurredAt/correlationId từ envelope, lấy keyword
        từ payload, chuẩn hoá lại keyword (idempotent) rồi gọi hàm ghi vector.
        Bỏ qua event khi thiếu userId hoặc keyword rỗng.

        Returns:
            None; event thiếu thông tin chỉ được ghi log và bỏ qua.
        """
        event_obj = UserSearchEvent.model_validate(event)
        payload = event_obj.payload
        user_id = payload.userId
        keyword = normalize_search_keyword(
            payload.keywordRaw or payload.keywordNormalized
        )
        if not user_id or not keyword:
            logger.warning(
                "Bỏ qua user.search rỗng: user=%s correlation_id=%s",
                user_id,
                event_obj.correlationId,
            )
            return

        await self._handle_search(
            user_id=user_id,
            keyword=keyword,
            mode=payload.mode,
            occurred_at=event_obj.occurredAt,
            correlation_id=event_obj.correlationId,
        )

    async def _handle_search(
        self,
        user_id: str,
        keyword: str,
        mode: str,
        occurred_at: str,
        correlation_id: str | None,
    ) -> None:
        """Encode keyword chuẩn hoá và ghi vào search/long-term vector.

        Tạo embedding từ keyword, upsert vào collection search kèm metadata,
        sau đó trộn vào vector dài hạn theo EMA rồi upsert collection long-term.

        Returns:
            None; embedding/upsert lỗi được phép lan ra để queue retry.
        """
        vector: list[float] = await self._embedding_service.encode_async(
            keyword, is_query=True
        )
        metadata = {
            "keyword": keyword,
            "mode": mode,
            "occurred_at": occurred_at,
            "correlation_id": correlation_id,
        }
        await self._user_vector_service.upsert_named_user_vector(
            user_id=user_id,
            vector=vector,
            collection_name=settings.vector_user_search_collection,
            updated_from="user_search",
            metadata=metadata,
        )

        long_term_vector = await self._merge_long_term(user_id, vector)
        await self._user_vector_service.upsert_named_user_vector(
            user_id=user_id,
            vector=long_term_vector,
            collection_name=settings.vector_user_long_term_collection,
            updated_from="user_search",
            metadata=metadata,
        )
        logger.info("Đã lưu vector tìm kiếm cho user=%s keyword=%s", user_id, keyword)

    async def _merge_long_term(
        self, user_id: str, search_vector: list[float]
    ) -> list[float]:
        """Trộn vector tìm kiếm vào vector dài hạn hiện có bằng EMA.

        Đọc vector dài hạn hiện tại; nếu chưa có thì dùng thẳng vector tìm
        kiếm, ngược lại lấy trung bình có trọng số rồi chuẩn hoá L2.

        Returns:
            Danh sách float là vector dài hạn mới.
        """
        current = await self._user_vector_service.find_named_user_vector(
            user_id, settings.vector_user_long_term_collection
        )
        candidate = np.array(search_vector, dtype=float)
        if current is None or not current.get("vector"):
            return candidate.tolist()

        existing = np.array(current["vector"], dtype=float)
        merged = (
            1 - LONG_TERM_SEARCH_ALPHA
        ) * existing + LONG_TERM_SEARCH_ALPHA * candidate
        norm = float(np.linalg.norm(merged))
        if norm > 0:
            merged = merged / norm
        return merged.tolist()
