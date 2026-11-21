"""Tổng hợp các nguồn gợi ý ForYou thành một danh sách xếp hạng."""

from __future__ import annotations

from typing import Any

from core.config import get_settings
from core.fusion import reciprocal_rank_fusion_with_details
from core.vector_constants import (
    FOR_YOU_CF_POPULAR_WEIGHTS,
    FOR_YOU_COLD_WEIGHTS,
    FOR_YOU_WEIGHTS,
)
from infra.redis.genre_repository import RedisGenreRepository
from services.genre_vector_service import GenreVectorService
from services.movie_vector_service import MovieVectorService
from services.user_vector_service import UserVectorService
from utils import setup_logger

logger = setup_logger(name="FastAPI-Recommendations")

settings = get_settings()


class UserVectorAggregatorService:
    """Gom CF, các vector người dùng và thể loại rồi fusion theo trọng số."""

    def __init__(
        self,
        user_vector_service: UserVectorService,
        movie_vector_service: MovieVectorService,
        genre_vector_service: GenreVectorService | None = None,
        popular_repository: RedisGenreRepository | None = None,
    ) -> None:
        self._user_vector_service = user_vector_service
        self._movie_vector_service = movie_vector_service
        self._genre_vector_service = genre_vector_service
        self._popular_repository = popular_repository

    async def aggregate(
        self,
        user_id: str,
        top_k: int,
        cf_results: list[dict[str, Any]] | None = None,
        has_cf: bool = False,
    ) -> list[dict[str, Any]]:
        """Trả về danh sách gợi ý đã fusion, giữ nguyên cấu trúc kết quả hybrid."""
        sources = await self.gather_sources(user_id, top_k)
        ranked_lists: dict[str, list[int]] = {}
        raw_scores: dict[str, list[float]] = {}

        if cf_results:
            ranked_lists["CF"] = [int(item["id"]) for item in cf_results]
            raw_scores["CF"] = [float(item.get("score", 0.0)) for item in cf_results]

        for name, items in sources.items():
            ranked_lists[name] = [int(item["id"]) for item in items]
            raw_scores[name] = [float(item.get("score", 0.0)) for item in items]

        has_vectors = any(sources.values())
        popular_ids: list[int] = []
        if not has_cf or not has_vectors:
            popular_ids = await self._load_popular(top_k * 2)

        if has_cf and has_vectors:
            weights = dict(FOR_YOU_WEIGHTS)
        elif not has_cf and has_vectors:
            weights = dict(FOR_YOU_COLD_WEIGHTS)
        elif has_cf and popular_ids:
            weights = dict(FOR_YOU_CF_POPULAR_WEIGHTS)
            ranked_lists["POPULAR"] = popular_ids
            raw_scores["POPULAR"] = [1.0] * len(popular_ids)
        elif popular_ids:
            weights = {"POPULAR": 1.0}
            ranked_lists = {"POPULAR": popular_ids}
            raw_scores = {"POPULAR": [1.0] * len(popular_ids)}
        else:
            weights = dict(FOR_YOU_CF_POPULAR_WEIGHTS)

        active_weights = {
            name: weight for name, weight in weights.items() if ranked_lists.get(name)
        }
        total_weight = sum(active_weights.values())
        if total_weight <= 0:
            return []
        normalized_weights = {
            name: weight / total_weight for name, weight in active_weights.items()
        }

        detailed_fused = reciprocal_rank_fusion_with_details(
            ranked_lists=ranked_lists,
            raw_scores_lists=raw_scores,
            weights=normalized_weights,
            k=60,
            top_n=top_k * 2,
        )
        return [
            {
                **item,
                "id": item["movie_id"],
                "rank": item["fused_rank"],
                "score": item["rrf_score"],
            }
            for item in detailed_fused
        ]

    async def gather_sources(
        self, user_id: str, top_k: int
    ) -> dict[str, list[dict[str, Any]]]:
        """Thu thập các danh sách gợi ý từ vector người dùng và thể loại.

        Chỉ dùng LONG_TERM, SHORT_TERM, SEARCH và GENRE; profile vector (CBF)
        đã tắt. Nguồn GENRE đọc payload `{genreId: score}` từ collection
        `user_genre_vectors`.
        """
        sources: dict[str, list[dict[str, Any]]] = {}
        named_collections = (
            ("LONG_TERM", settings.vector_user_long_term_collection),
            ("SHORT_TERM", settings.vector_user_short_term_collection),
            ("SEARCH", settings.vector_user_search_collection),
        )
        for name, collection_name in named_collections:
            try:
                data = await self._user_vector_service.find_named_user_vector(
                    user_id, collection_name
                )
                if data is None or not data.get("vector"):
                    continue
                items = (
                    await self._movie_vector_service.find_similar_movies_with_vector(
                        vector=data["vector"], top_k=top_k
                    )
                )
            except Exception as exc:
                logger.warning(
                    "Không lấy được nguồn %s cho user=%s: %s", name, user_id, exc
                )
                continue
            if items:
                sources[name] = items

        if self._genre_vector_service is not None:
            try:
                genre_items = await self._genre_vector_service.rank_for_user(
                    user_id, top_k
                )
            except Exception as exc:
                logger.warning(
                    "Không lấy được nguồn GENRE cho user=%s: %s", user_id, exc
                )
                genre_items = []
            if genre_items:
                sources["GENRE"] = genre_items
        return sources

    async def _load_popular(self, limit: int) -> list[int]:
        """Trả về danh sách phim phổ biến; rỗng khi Redis không dùng được."""
        if self._popular_repository is None:
            return []
        try:
            return await self._popular_repository.load_popular_movie_ids(limit)
        except Exception as exc:
            logger.warning("Không đọc được danh sách phim phổ biến: %s", exc)
            return []
