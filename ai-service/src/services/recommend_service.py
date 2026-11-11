"""
services/recommend_service.py
Business-logic layer for all AI recommendation operations.
"""

from __future__ import annotations

import asyncio
from typing import Any

from api.schemas import SimilarMoviesResponse
from core.custom_exception import CustomException
from core.fusion import reciprocal_rank_fusion_with_details
from core.integrations import VectorStore
from services.embedding_service import EmbeddingService
from services.mapping_service import mapping_service
from services.movie_vector_service import MovieVectorService
from services.user_vector_service import UserVectorService
from utils import setup_logger
from utils.genre_utils import extract_genres, rerank_similar_candidates

logger = setup_logger(name=__name__, filename=__name__)


# Reuse the exact corpus text builder used by DataLoader; no index rebuild here.
from data.data_loader import build_search_text as _build_search_text


def _format_item(item: dict[str, Any]) -> dict[str, Any]:
    """Format kết gợi phim

    Args:
        item (dict[str, Any]): dữ liệu phim và metadata

    Returns:
        dict[str, Any]: _description_
    """
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
    return result


class RecommendService:
    def __init__(
        self,
        vector_store: VectorStore,
        embedding_service: EmbeddingService,
        movie_vector_service: MovieVectorService,
        user_vector_service: UserVectorService,
    ) -> None:
        """Gợi ý phim tương tự (Content Search), nội dung liên quan cho user dựa trên tương tác (CF)

        Args:
            vector_store (VectorStore): Nơi lưu trữ vector
            embedding_service (EmbeddingService): Embedding text -> vector
            movie_vector_service (MovieVectorService): Service vector phim
            user_vector_service (UserVectorService): Service vector người dùng
        """
        self._vs = vector_store
        self._emb = embedding_service
        self.cf_weight = 0.6
        self.semantic_weight = 0.4
        self._movie_vector_service = movie_vector_service
        self._user_vector_service = user_vector_service

    async def semantic_search(
        self, query: str, top_k: int = 10
    ) -> list[dict[str, Any]]:
        """Semantic Search: Tìm phim dựa trên truy vấn tìm kiếm"""
        vector = await self._emb.encode_async(query, is_query=True)
        raw_results = await self._vs.query(vector, top_k=top_k)
        return [_format_item(item) for item in raw_results]

    async def similar_movies(
        self, movie_id: int, top_k: int = 50
    ) -> list[dict[str, Any]]:
        """Semantic Search: Gợi ý phim tương tự dựa trên movieId và vector similarity"""
        similar_movies = await self._movie_vector_service.find_similar_movies(
            movie_id=movie_id, top_k=top_k
        )

        first = similar_movies[0] if similar_movies else None
        # logger.info(
        #     f"[RecommendService] Tìm kiếm phim tương tự cho movieId={movie_id}. Top-{top_k}. First: {first}"
        # )

        for idx, item in enumerate(similar_movies):
            item["rank"] = idx + 1  # rank bắt đầu từ 1

        # format
        formatted_results = [_format_item(item) for item in similar_movies]

        logger.info(
            f"[RecommendService] Found {len(similar_movies)} similar movies for movieId={movie_id} (Top-{top_k})"
        )

        return formatted_results

    async def similar_movies_rerank(
        self,
        movie_id: int,
        top_k: int = 10,
        mode: str = "soft",
        genre_weight: float = 0.3,
        candidate_k: int = 100,
    ) -> list[dict[str, Any]]:
        """
        Gợi ý danh sách phim tương tự mới dựa trên vector similarity và genre-aware reranking.
        """
        target = await self._vs.get_by_id(movie_id)
        vector = target.get("vector") if target else None
        if vector is None or len(vector) == 0:
            raise CustomException(
                f"Khong tim thay vector cho movieId={movie_id}",
                status_code=404,
                error_code="MOVIE_NOT_FOUND",
            )

        target_meta = target.get("payload") or {}
        target_genres = extract_genres(target_meta.get("genres"))

        # Candidate Retrieval: Lấy pool ứng viên Top-50/100 từ vector store
        # +1 accounts for the source movie occupying an ANN result slot.
        pool_size = max(candidate_k, top_k) + 1
        raw_results = await self._vs.query(vector=vector, top_k=pool_size)

        # Loại bỏ phim gốc và khử trùng lặp movieId
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
            # Normalize IDs, so mixed string/int IDs cannot bypass deduplication.
            candidates.append({**item, "id": cid})

        # Genre-aware Reranking theo chế độ yêu cầu
        reranked = rerank_similar_candidates(
            candidates=candidates,
            target_genres=target_genres,
            mode=mode,
            genre_weight=genre_weight,
            top_k=top_k,
        )

        return [_format_item(item) for item in reranked]

    async def hybrid_recommendation(
        self, user_id: str, top_k: int = 10
    ) -> list[dict[str, Any]]:
        """Gợi ý lại với CF và CBF
        CBF: Lấy danh sách phim liên quan dựa trên user profile vector
        CF: Lấy danh sách phim liên quan dựa trên lịch sử tương tác bằng model iALS (Collaborative Filtering)
        Args:
            user_id (str): id người dùng
            top_k (int, optional): số lượng phim gợi ý. Defaults to 10.

        Returns:
            list[dict[str, Any]]:
            {
                "fused_rank"(int): rank sau khi RRF fusion,
                "movie_id"(int): rank sau khi RRF fusion,
                "rrf_score"(float): điểm RRF fusion,
                "model_ranks"(dict[str, int]): thứ hạng của từng mô hình (CF, CBF),
                "raw_scores"(dict[str, float]): điểm raw score của từng mô hình (CF, CBF),
                "contributing_models"(list[str]): danh sách mô hình đóng góp cho phim này,
                "agreement_count"(int): số lượng mô hình đồng ý với phim này,
                "best_individual_rank"(int): thứ hạng tốt nhất của phim này trong các mô hình.
            }
        """
        user_idx = mapping_service.get_user_idx(user_id)

        logger.info(f"[RecommendService] User {user_id} -> user_idx: {user_idx}")

        # Nếu không có user_idx trong mapping (cold start user)
        # Gợi ý theo user profile vector

        cf_results = []
        cbf_results = []

        # =======================================================
        # CF: gợi ý phim lọc cộng tác với iALS model
        if user_idx is not None:
            logger.info(
                f"[RecommendService] Fetching CF recommendations for user {user_id} (user_idx={user_idx})"
            )
        else:
            logger.info(
                f"[RecommendService] User {user_id} not found in CF mapping (Cold Start)."
            )

        # =======================================================
        # CBF: Gợi ý phim dựa trên sở thích nội dung (semantic) của user

        # tìm user profile vector để lấy semantic recommendations
        try:
            user_data = await self._user_vector_service.find_user_profile_vector(
                user_id=user_id
            )
            user_vector = user_data.get("vector")
            # tìm phim tương tự dựa trên user profile vector
            if user_vector:
                cbf_results = (
                    await self._movie_vector_service.find_similar_movies_with_vector(
                        vector=user_vector, top_k=top_k
                    )
                )
            else:
                logger.warning(
                    f"[RecommendService] User {user_id} has no profile vector; skipping semantic recommendations."
                )
                cbf_results = []

        except Exception as e:
            logger.error(
                f"[RecommendService] Error fetching semantic recommendations for user {user_id}: {e}"
            )
            cbf_results = []

        logger.info(
            f"[RecommendService] Found {len(cf_results)} CF hits and {len(cbf_results)} Semantic hits."
        )

        # =======================================================
        #  Chạy thuật toán rerank RRF cho CF và CBF

        # rank list là movie ids
        ranked_lists = {
            "CF": [item.get("id") for item in cf_results],
            "CBF": [item.get("id") for item in cbf_results],
        }
        raw_scores = {
            "CF": [item.get("score", 0.0) for item in cf_results],
            "CBF": [item.get("score", 0.0) for item in cbf_results],
        }

        # nếu không có user idx thì cf weights thấp
        if user_idx is None:
            weights = {
                "CF": 0.1,
                "CBF": 0.8,
            }
        else:
            weights = {
                "CF": 0.6,
                "CBF": 0.4,
            }
        detailed_fused = reciprocal_rank_fusion_with_details(
            ranked_lists=ranked_lists,
            raw_scores_lists=raw_scores,
            weights=weights,
            k=60,
            top_n=top_k * 2,
        )

        return detailed_fused

        # # 3. Combine and Rerank
        # combined_scores = {}
        # evidences = {}

        # # Normalize scores (assuming cosine similarity [0,1] or similar)
        # for item in cf_results:
        #     mid = item["id"]
        #     cf_score = item["score"]
        #     combined_scores[mid] = (
        #         combined_scores.get(mid, 0) + cf_score * self.cf_weight
        #     )
        #     evidences[mid] = evidences.get(mid, []) + [
        #         f"Được đề xuất dựa trên phân tích hành vi người dùng tương đồng (Điểm CF: {round(cf_score*100, 1)}%)"
        #     ]

        # for item in cbf_results:
        #     mid = item["id"]
        #     sem_score = item["score"]
        #     combined_scores[mid] = (
        #         combined_scores.get(mid, 0) + sem_score * self.semantic_weight
        #     )
        #     evidences[mid] = evidences.get(mid, []) + [
        #         f"Phù hợp với sở thích về nội dung và thể loại phim của bạn (Điểm Semantic: {round(sem_score*100, 1)}%)"
        #     ]

        # # Sort by combined score
        # sorted_mids = sorted(
        #     combined_scores.keys(), key=lambda k: combined_scores[k], reverse=True
        # )[:top_k]

        # # 4. Format Results
        # final_results = []
        # for mid in sorted_mids:
        #     # Get full movie info from semantic collection
        #     movie_info = await self._vs.get_by_id(
        #         mid, collection_name=self._vs.settings.vector_collection
        #     )
        #     if movie_info:
        #         # Add the original score to movie_info so _format_item parses it correctly
        #         movie_info["score"] = combined_scores[mid]
        #         formatted = _format_item(movie_info)
        #         formatted["hybridScore"] = combined_scores[mid]

        #         # Combine evidences into a nice readable string
        #         formatted["evidences"] = evidences[mid]
        #         final_results.append(formatted)

        # logger.info(
        #     f"[RecommendService] Returning {len(final_results)} hybrid recommendations for user {user_id}."
        # )

        # return final_results
