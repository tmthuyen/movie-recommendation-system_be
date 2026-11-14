from __future__ import annotations

from typing import Any

from core.config import get_settings
from core.custom_exception import CustomException
from core.integrations import VectorStore
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
