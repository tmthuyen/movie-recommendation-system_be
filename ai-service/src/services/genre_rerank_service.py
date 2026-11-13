"""
services/genre_rerank_service.py
Service độc lập xử lý Genre-aware Reranking cho danh sách ứng viên phim tương tự.
Tách rời khỏi RecommendService để giữ cho luồng gợi ý chính gọn nhẹ và dễ đọc.
"""

from __future__ import annotations

from typing import Any

from core.integrations import VectorStore
from utils import setup_logger
from utils.genre_utils import extract_genres, rerank_similar_candidates

logger = setup_logger(name=__name__, filename=__name__)


class GenreRerankService:
    """Service chuyên biệt cho việc rerank ứng viên similar movies theo thể loại (genre)."""

    def __init__(self, vector_store: VectorStore) -> None:
        self._vs = vector_store

    async def rerank_similar_by_genre(
        self,
        movie_id: int,
        top_k: int = 10,
        mode: str = "soft",
        genre_weight: float = 0.3,
        candidate_k: int = 100,
    ) -> list[dict[str, Any]]:
        """Lấy ứng viên ANN từ VectorStore và rerank theo độ tương đồng thể loại."""
        target = await self._vs.get_by_id(movie_id)
        vector = target.get("vector") if target else None
        if vector is None or len(vector) == 0:
            raise ValueError(f"Khong tim thay vector cho movieId={movie_id}")

        target_meta = target.get("payload") or {}
        target_genres = extract_genres(target_meta.get("genres"))

        pool_size = max(candidate_k, top_k) + 1
        raw_results = await self._vs.query(vector=vector, top_k=pool_size)

        seen_ids: set[int] = set()
        candidates: list[dict[str, Any]] = []
        for item in raw_results:
            try:
                cid = int(item.get("id"))
            except (TypeError, ValueError, OverflowError):
                continue
            if cid == movie_id or cid in seen_ids:
                continue
            seen_ids.add(cid)
            candidates.append({**item, "id": cid})

        reranked = rerank_similar_candidates(
            candidates=candidates,
            target_genres=target_genres,
            mode=mode,
            genre_weight=genre_weight,
            top_k=top_k,
        )
        return reranked

