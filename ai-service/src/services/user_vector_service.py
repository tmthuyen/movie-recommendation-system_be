from __future__ import annotations

import json
import math
from typing import Any

from core.config import get_settings
from core.custom_exception import CustomException
from core.integrations import VectorStore
from core.vector_constants import GENRE_PAYLOAD_METADATA_KEY
from services.embedding_service import EmbeddingService
from utils import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")

settings = get_settings()


class UserVectorService:
    def __init__(
        self, vector_store: VectorStore, embedding_service: EmbeddingService
    ) -> None:
        self._vector_store = vector_store
        self._embedding_service = embedding_service
        self._collection_name = settings.vector_user_profile_collection

    async def find_user_profile_vector(self, user_id: str) -> dict[str, Any] | None:
        """Tìm hồ sơ vector người dùng từ DB"""
        data = await self._vector_store.get_by_id(
            movie_id=None, id=user_id, collection_name=self._collection_name
        )

        if data is None or not data.get("vector"):
            logger.error(
                f"[UserVectorService] Không tìm thấy user vector với id={user_id} trong collection {self._collection_name}"
            )
            raise CustomException(
                f"Không tìm thấy user với id={user_id} trong collection {self._collection_name}",
                status_code=404,
                error_code="NOT_FOUND",
            )

        return data

    async def delete_by_id(self, id: str) -> None:
        """Xóa hồ sơ vector người dùng khỏi DB"""
        await self._vector_store.delete_by_id(
            id=id, collection_name=self._collection_name
        )
        logger.info(f"Deleted user profile vector for user {id}")

    async def update_user_profile_with_text(
        self,
        user_id: str,
        text: str,
    ):
        """Cập nhật hồ sơ vector người dùng"""
        vector: list[float] = await self._embedding_service.encode_async(
            text=text, is_query=False
        )
        await self.upsert_user_profile_vector(user_id=user_id, vector=vector)

    async def upsert_user_profile_vector(
        self,
        user_id: str,
        vector: list[float],
    ):
        """Cập nhật hồ sơ vector người dùng"""
        await self._vector_store.upsert(
            movie_id=None,
            id=user_id,
            vector=vector,
            payload={"user_id": user_id, "updated_from": "profile_event"},
            collection_name=self._collection_name,
        )
        logger.info(f"Upserted user profile vector for user {user_id}")

    async def update_named_user_vectors_with_text(
        self,
        user_id: str,
        text: str,
        collection_names: tuple[str, ...],
        updated_from: str = "user_profile",
        alpha: float = 0.2,
    ) -> None:
        """Encode text sở thích rồi trộn vào các named vector theo EMA.

        Dùng cho `user.created`/`user.updated.profile` thay cho profile vector:
        long-term và short-term cùng được cập nhật từ nội dung preference.
        Vector được chuẩn hoá L2 trước khi trộn để không phụ thuộc độ dài text.

        Returns:
            None; lỗi encode/upsert được phép lan ra để queue retry.
        """
        vector = await self._embedding_service.encode_async(text=text, is_query=False)
        candidate = [float(value) for value in vector]
        candidate_norm = math.sqrt(sum(value * value for value in candidate))
        if candidate_norm > 0:
            candidate = [value / candidate_norm for value in candidate]

        for collection_name in collection_names:
            current = await self.find_named_user_vector(user_id, collection_name)
            if current and current.get("vector"):
                existing = [float(value) for value in current["vector"]]
                merged = [
                    (1 - alpha) * old + alpha * new
                    for old, new in zip(existing, candidate)
                ]
            else:
                merged = list(candidate)

            norm = math.sqrt(sum(value * value for value in merged))
            if norm > 0:
                merged = [value / norm for value in merged]
            await self.upsert_named_user_vector(
                user_id=user_id,
                vector=merged,
                collection_name=collection_name,
                updated_from=updated_from,
            )

    async def find_named_user_vector(
        self, user_id: str, collection_name: str
    ) -> dict[str, Any] | None:
        """Trả về vector người dùng từ một collection; None nếu chưa có."""
        data = await self._vector_store.get_by_id(
            movie_id=None, id=user_id, collection_name=collection_name
        )
        if data is None or not data.get("vector"):
            return None
        return data

    async def find_genre_payload(
        self, user_id: str, collection_name: str
    ) -> dict[int, float]:
        """Đọc payload trọng số thể loại của user từ metadata collection.

        Payload nằm trong metadata `genre_scores` dạng JSON string, ví dụ
        `{"1": 1.0, "2": 0.5}`. Vector của record không được dùng.

        Returns:
            Dict `{genreId: weight}`; rỗng khi chưa có hoặc payload không hợp lệ.
        """
        data = await self._vector_store.get_by_id(
            movie_id=None, id=user_id, collection_name=collection_name
        )
        if not data:
            return {}
        raw = (data.get("payload") or {}).get(GENRE_PAYLOAD_METADATA_KEY)
        if not raw:
            return {}
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
        except (TypeError, ValueError):
            return {}
        if not isinstance(parsed, dict):
            return {}
        scores: dict[int, float] = {}
        for genre_id, score in parsed.items():
            try:
                scores[int(genre_id)] = float(score)
            except (TypeError, ValueError):
                continue
        return scores

    async def save_genre_payload(
        self,
        user_id: str,
        scores: dict[int, float],
        collection_name: str,
        updated_from: str = "genre_event",
    ) -> None:
        """Ghi payload `{genreId: score}` vào metadata collection.

        Collection này chỉ lưu payload để tính điểm gợi ý; vector truyền thẳng
        từ service là placeholder kỹ thuật, không phải embedding và không dùng
        để chấm điểm genre.

        Returns:
            None.
        """
        await self.upsert_named_user_vector(
            user_id=user_id,
            vector=[0.0] * settings.vector_size,
            collection_name=collection_name,
            updated_from=updated_from,
            metadata={
                GENRE_PAYLOAD_METADATA_KEY: json.dumps(
                    {str(genre_id): float(score) for genre_id, score in scores.items()},
                    separators=(",", ":"),
                )
            },
        )

    async def upsert_named_user_vector(
        self,
        user_id: str,
        vector: list[float] | None,
        collection_name: str,
        updated_from: str = "event",
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """Ghi vector người dùng vào một collection được chỉ định."""
        payload = {"user_id": user_id, "updated_from": updated_from}
        if metadata:
            payload.update(metadata)
        await self._vector_store.upsert(
            movie_id=None,
            id=user_id,
            vector=vector,
            payload=payload,
            collection_name=collection_name,
        )
        logger.info(
            "Upserted user vector id=%s collection=%s", user_id, collection_name
        )

    async def delete_named_user_vector(
        self, user_id: str, collection_name: str
    ) -> None:
        """Xoá vector người dùng khỏi một collection được chỉ định."""
        await self._vector_store.delete_by_id(
            id=user_id, collection_name=collection_name
        )
        logger.info("Deleted user vector id=%s collection=%s", user_id, collection_name)

    async def delete_all_user_vectors(self, user_id: str) -> None:
        """Xoá mọi collection vector của một người dùng.

        Xoá lần lượt profile, long-term, short-term, search và genre.

        Returns:
            None; lỗi xoá từng collection được phép lan ra.
        """
        collections = (
            settings.vector_user_profile_collection,
            settings.vector_user_long_term_collection,
            settings.vector_user_short_term_collection,
            settings.vector_user_search_collection,
            settings.vector_user_genre_collection,
        )
        for collection_name in collections:
            await self.delete_named_user_vector(user_id, collection_name)
