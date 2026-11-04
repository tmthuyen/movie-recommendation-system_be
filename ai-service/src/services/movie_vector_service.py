"""
services/movie_vector_service.py
Quản lý movie vector trong VectorDB
Thêm hoặc cập nhật movie vector
Xóa movie vector
"""

from __future__ import annotations

import asyncio
from typing import Any

from core.integrations import VectorStore
from services.embedding_service import EmbeddingService
from utils import setup_logger

logger = setup_logger(name=__name__, filename=__name__)


from data.data_loader import build_search_text as _build_search_text


class MovieVectorService:
    def __init__(
        self, vector_store: VectorStore, embedding_service: EmbeddingService
    ) -> None:
        self._vs = vector_store
        self._emb = embedding_service

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
