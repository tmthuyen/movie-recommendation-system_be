"""
services/movie_vector_service.py
Quản lý movie vector trong VectorDB
Thêm hoặc cập nhật movie vector
Xóa movie vector
"""

from __future__ import annotations

import asyncio
from typing import Any

from core.config import Settings, get_settings
from core.custom_exception import CustomException
from core.integrations import VectorStore
from data.data_loader import build_search_text as _build_search_text
from services.embedding_service import EmbeddingService
from utils import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")

settings = get_settings()


class MovieVectorService:
    def __init__(
        self, vector_store: VectorStore, embedding_service: EmbeddingService
    ) -> None:
        self._vs = vector_store
        self._emb = embedding_service
        self.collection_name = settings.vector_collection

    async def find_movie_vector(self, movie_id: int) -> dict[str, Any] | None:
        """Tìm kiếm movie vector theo movie_id trong VectorDB"""
        movie_data = await self._vs.get_by_id(
            movie_id, collection_name=self.collection_name
        )

        if movie_data is None or not movie_data.get("vector"):
            logger.error(
                f"[MovieVectorService] Không tìm thấy movie với id={movie_id} trong collection {self.collection_name}"
            )
            raise CustomException(
                f"Không tìm thấy movie với id={movie_id} trong collection {self.collection_name}",
                status_code=404,
                error_code="MOVIE_NOT_FOUND",
            )

        return movie_data

    async def find_similar_movies(
        self, movie_id: int, top_k: int = 10
    ) -> list[dict[str, Any]]:
        """Tìm kiếm các movie tương tự (đã sắp xếp theo score) dựa trên vector của movie_id trong VectorDB

        Args:
            movie_id (int): _description_
            top_k (int, optional): _description_. Defaults to 10.

        Returns:
            list[dict[str, Any]]:
            [
                {
                    "id": 1,
                    "score": 0.9,
                    "payload": thông tin metadata của movie,
                },
                {
                    "id": 2,
                    "score": 0.8,
                    "payload": thông tin metadata của movie,
                }
            ]
        """
        target = await self.find_movie_vector(movie_id=movie_id)
        raw_results = await self._vs.query(
            vector=target["vector"],
            top_k=top_k + 1,
            collection_name=self.collection_name,
        )
        filtered = [item for item in raw_results if item.get("id") != movie_id][:top_k]
        return filtered

    async def find_similar_movies_with_vector(
        self, vector: list[float], top_k: int = 10
    ) -> list[dict[str, Any]]:
        """Tìm kiếm các movie tương tự (đã sắp xếp theo score) dựa trên vector cung cấp

        Args:
            vector (list[float]): _description_
            top_k (int, optional): _description_. Defaults to 10.

        Returns:
            list[dict[str, Any]]:
            [
                {
                    "id": 1,
                    "score": 0.9,
                    "payload": thông tin metadata của movie,
                },
                {
                    "id": 2,
                    "score": 0.8,
                    "payload": thông tin metadata của movie,
                }
            ]
        """
        res = await self._vs.query(
            vector=vector,
            top_k=top_k,
            collection_name=self.collection_name,
        )
        return res

    async def upsert_movie_vector(self, movie_data: dict[str, Any]) -> None:
        movie_id = movie_data.get("movieId") or movie_data.get("movie_id")
        if movie_id is None:
            raise ValueError("movie_data phai chua truong 'movieId'")
        movie_id = int(movie_id)
        search_text = _build_search_text(movie_data)
        if not search_text.strip():
            logger.warning(
                "upsert_movie_vector: movieId=%s khong du metadata, bo qua.", movie_id
            )
            return
        vector: list[float] = await self._emb.encode_async(search_text, is_query=False)
        payload: dict[str, Any] = {
            k: (v if isinstance(v, (str, int, float, bool)) else str(v))
            for k, v in movie_data.items()
            if k not in ("movieId", "movie_id")
        }
        payload["search_text"] = search_text
        await self._vs.upsert(movie_id, vector, payload)
        logger.info(
            "upsert_movie_vector: movieId=%s text_len=%d", movie_id, len(search_text)
        )

    async def delete_movie_vector(self, movie_id: int) -> bool:
        movie_id = int(movie_id)
        backend = getattr(self._vs, "backend", None)
        if backend is not None and hasattr(backend, "_collections"):
            collection = backend._get_collection(backend.settings.vector_collection)
            if collection is None:
                logger.warning(
                    "delete_movie_vector: ChromaDB collection chua khoi tao."
                )
                return False

            def _sync_delete() -> None:
                collection.delete(ids=[str(movie_id)])

            await asyncio.to_thread(_sync_delete)
            logger.info(
                "delete_movie_vector: movieId=%s da xoa khoi ChromaDB.", movie_id
            )
            return True
        logger.warning(
            "delete_movie_vector: backend %s khong ho tro xoa.", type(backend).__name__
        )
        return False
