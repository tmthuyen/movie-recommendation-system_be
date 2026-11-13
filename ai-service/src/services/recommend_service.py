"""
services/recommend_service.py
Business-logic layer for core AI recommendation operations:
- Semantic Search (Text-to-Item)
- Similar Movies (Item-to-Item pure vector similarity)
- Hybrid Recommendation (User Collaborative Filtering + Semantic Profile)

Genre-based reranking và Search Lexical+Semantic reranking đã được tách sang
`genre_rerank_service.py` và `search_rerank_service.py`.
"""

from __future__ import annotations

from typing import Any

from core.integrations import VectorStore
from data.data_loader import build_search_text as _build_search_text
from services.embedding_service import EmbeddingService
from services.genre_rerank_service import GenreRerankService
from services.mapping_service import mapping_service
from services.search_rerank_service import SearchRerankService
from utils import setup_logger
from utils.genre_utils import extract_genres

logger = setup_logger(name=__name__, filename=__name__)


def _format_item(item: dict[str, Any]) -> dict[str, Any]:
    """Chuẩn hóa kết quả gợi ý phim trả về cho API."""
    meta = item.get("payload") or {}
    title_vi = meta.get("title_vi")
    title_en = meta.get("title")
    display_title = (
        title_vi
        if (title_vi and str(title_vi).strip() not in ("nan", "None", ""))
        else title_en
    )
    result = {
        "id": item.get("id"),
        "movieId": item.get("id"),
        "similarityScore": round(
            float(item.get("raw_cosine_score", item.get("score", 0.0))), 4
        ),
        "title": display_title,
        "titleVi": title_vi if str(title_vi) not in ("nan", "None") else None,
        "overview": meta.get("overview"),
        "overviewVi": meta.get("overview_vi"),
        "genres": meta.get("genres"),
        "genreNames": sorted(extract_genres(meta.get("genres"))),
    }
    if item.get("rank") is not None:
        result["rank"] = item["rank"]
    if "raw_cosine_score" in item:
        result["rankingScore"] = round(float(item["score"]), 4)
        if item.get("genre_similarity") is not None:
            result["genreSimilarity"] = round(float(item["genre_similarity"]), 4)
    if "rrf_score" in item:
        result["rrfScore"] = round(float(item["rrf_score"]), 6)
    return result


class RecommendService:
    def __init__(
        self, vector_store: VectorStore, embedding_service: EmbeddingService
    ) -> None:
        """Gợi ý phim theo ngữ nghĩa (Semantic Search), phim tương tự (Item-to-Item) và Hybrid CF."""
        self._vs = vector_store
        self._emb = embedding_service
        self._genre_reranker = GenreRerankService(vector_store)
        self._search_reranker = SearchRerankService(vector_store, embedding_service)
        self.cf_weight = 0.6
        self.semantic_weight = 0.4

    async def semantic_search(
        self, query: str, top_k: int = 10
    ) -> list[dict[str, Any]]:
        """Semantic Search: Tìm phim dựa trên truy vấn tìm kiếm tự nhiên."""
        vector = await self._emb.encode_async(query, is_query=True)
        raw_results = await self._vs.query(vector, top_k=top_k)
        for idx, item in enumerate(raw_results):
            if item.get("rank") is None:
                item["rank"] = idx + 1
        return [_format_item(item) for item in raw_results]

    async def similar_movies(
        self, movie_id: int, top_k: int = 10
    ) -> list[dict[str, Any]]:
        """Item-to-Item: Gợi ý phim tương tự thuần vector similarity (Cosine)."""
        target = await self._vs.get_by_id(movie_id=movie_id)
        if not target or not target.get("vector"):
            logger.warning(
                f"Khong tim thay vector cho movieId={movie_id}: target={target}"
            )
            raise ValueError(f"Khong tim thay vector cho movieId={movie_id}")

        raw_results = await self._vs.query(vector=target["vector"], top_k=top_k + 1)
        filtered = [item for item in raw_results if item.get("id") != movie_id][:top_k]

        filtered.sort(key=lambda x: x.get("score", 0), reverse=True)
        for idx, item in enumerate(filtered):
            item["rank"] = idx + 1

        logger.info(
            f"Found {len(filtered)} similar movies for movieId={movie_id} (Top-{top_k})"
        )
        return [_format_item(item) for item in filtered]

    async def similar_movies_rerank(
        self,
        movie_id: int,
        top_k: int = 10,
        mode: str = "soft",
        genre_weight: float = 0.3,
        candidate_k: int = 100,
    ) -> list[dict[str, Any]]:
        """Ủy quyền sang GenreRerankService (đã tách riêng khỏi luồng similar cơ bản)."""
        reranked = await self._genre_reranker.rerank_similar_by_genre(
            movie_id=movie_id,
            top_k=top_k,
            mode=mode,
            genre_weight=genre_weight,
            candidate_k=candidate_k,
        )
        return [_format_item(item) for item in reranked]

    async def search_lexical_semantic_rerank(
        self,
        query: str,
        lexical_ids: list[int] | None = None,
        top_k: int = 10,
        candidate_k: int = 50,
    ) -> list[dict[str, Any]]:
        """Kết hợp kết quả tìm kiếm Lexical (PostgreSQL) và Semantic (Vector DB) qua RRF."""
        reranked = await self._search_reranker.rerank_lexical_and_semantic(
            query=query,
            lexical_ids=lexical_ids,
            top_k=top_k,
            candidate_k=candidate_k,
        )
        return [_format_item(item) for item in reranked]

    async def hybrid_recommendation(
        self, user_uuid: str, top_k: int = 10
    ) -> list[dict[str, Any]]:
        """Combine Collaborative Filtering and Semantic Profile for Hybrid Recommendations."""
        user_idx = mapping_service.get_user_idx(user_uuid)
        pseudo_id = (
            user_idx if user_idx is not None else (abs(hash(user_uuid)) % (10**9))
        )

        logger.info(
            f"[HybridSearch] User {user_uuid} -> user_idx: {user_idx}, pseudo_id: {pseudo_id}"
        )

        cf_results = []
        sem_results = []

        # 1. Fetch CF Recommendations
        if user_idx is not None:
            u_cf = await self._vs.get_by_id(
                user_idx, collection_name=self._vs.settings.vector_user_cf_collection
            )
            if u_cf and u_cf.get("vector"):
                logger.info(
                    f"[HybridSearch] Found CF vector for user {user_uuid} (idx {user_idx})"
                )
                cf_hits = await self._vs.query(
                    u_cf["vector"],
                    top_k=top_k * 2,
                    collection_name=self._vs.settings.vector_movie_cf_collection,
                )
                cf_results = cf_hits
            else:
                logger.info(
                    f"[HybridSearch] User {user_uuid} is in mapping, but NO CF vector found in ChromaDB."
                )
        else:
            logger.info(
                f"[HybridSearch] User {user_uuid} not found in CF mapping (Cold Start)."
            )

        # 2. Fetch Semantic Recommendations
        u_sem = await self._vs.get_by_id(
            pseudo_id, collection_name=self._vs.settings.vector_user_profile_collection
        )
        if u_sem and u_sem.get("vector"):
            logger.info(f"[HybridSearch] Found Semantic vector for user {user_uuid}")
            sem_hits = await self._vs.query(
                u_sem["vector"],
                top_k=top_k * 2,
                collection_name=self._vs.settings.vector_collection,
            )
            sem_results = sem_hits
        else:
            logger.info(
                f"[HybridSearch] NO Semantic vector found for user {user_uuid} (id {pseudo_id})."
            )

        logger.info(
            f"[HybridSearch] Found {len(cf_results)} CF hits and {len(sem_results)} Semantic hits."
        )

        # 3. Combine and Rerank
        combined_scores = {}
        evidences = {}

        for item in cf_results:
            mid = item["id"]
            cf_score = item["score"]
            combined_scores[mid] = (
                combined_scores.get(mid, 0) + cf_score * self.cf_weight
            )
            evidences[mid] = evidences.get(mid, []) + [
                f"Được đề xuất dựa trên phân tích hành vi người dùng tương đồng (Điểm CF: {round(cf_score*100, 1)}%)"
            ]

        for item in sem_results:
            mid = item["id"]
            sem_score = item["score"]
            combined_scores[mid] = (
                combined_scores.get(mid, 0) + sem_score * self.semantic_weight
            )
            evidences[mid] = evidences.get(mid, []) + [
                f"Phù hợp với sở thích về nội dung và thể loại phim của bạn (Điểm Semantic: {round(sem_score*100, 1)}%)"
            ]

        sorted_mids = sorted(
            combined_scores.keys(), key=lambda k: combined_scores[k], reverse=True
        )[:top_k]

        final_results = []
        for mid in sorted_mids:
            movie_info = await self._vs.get_by_id(
                mid, collection_name=self._vs.settings.vector_collection
            )
            if movie_info:
                movie_info["score"] = combined_scores[mid]
                formatted = _format_item(movie_info)
                formatted["hybridScore"] = combined_scores[mid]
                formatted["evidences"] = evidences[mid]
                final_results.append(formatted)

        logger.info(
            f"[HybridSearch] Returning {len(final_results)} hybrid recommendations for user {user_uuid}."
        )

        return final_results
