"""
services/search_rerank_service.py
Service độc lập xử lý kết hợp và xếp hạng lại (Rerank) giữa tìm kiếm từ khóa
(Lexical Search từ PostgreSQL / BM25) và tìm kiếm ngữ nghĩa (Semantic Vector Search).
"""

from __future__ import annotations

from typing import Any

from core.fusion import reciprocal_rank_fusion_with_details
from core.integrations import VectorStore
from services.embedding_service import EmbeddingService
from utils import setup_logger

logger = setup_logger(name=__name__, filename=__name__)


class SearchRerankService:
    """Service kết hợp Lexical Search (PostgreSQL/BM25) và Semantic Search (Vector DB)."""

    def __init__(
        self, vector_store: VectorStore, embedding_service: EmbeddingService
    ) -> None:
        self._vs = vector_store
        self._emb = embedding_service

    async def rerank_lexical_and_semantic(
        self,
        query: str,
        lexical_ids: list[int] | None = None,
        top_k: int = 10,
        candidate_k: int = 50,
        rrf_k: int = 60,
        lexical_weight: float = 1.0,
        semantic_weight: float = 1.0,
    ) -> list[dict[str, Any]]:
        """Kết hợp danh sách ứng viên Lexical (từ PostgreSQL) với Semantic Search bằng RRF.

        Args:
            query: Từ khóa / câu truy vấn của người dùng.
            lexical_ids: Danh sách ID phim theo thứ tự khớp từ khóa từ PostgreSQL (nếu có).
            top_k: Số lượng kết quả trả về sau khi rerank.
            candidate_k: Số lượng ứng viên lấy từ Semantic Vector Store.
            rrf_k: Hằng số làm mượt RRF (mặc định 60).
            lexical_weight: Trọng số cho nhánh Lexical.
            semantic_weight: Trọng số cho nhánh Semantic.
        """
        pool_size = max(candidate_k, top_k)
        query_vector = await self._emb.encode_async(query, is_query=True)
        sem_hits = await self._vs.query(query_vector, top_k=pool_size)

        sem_ids: list[int] = []
        sem_scores: list[float] = []
        sem_meta_by_id: dict[int, dict[str, Any]] = {}
        sem_score_by_id: dict[int, float] = {}

        for hit in sem_hits:
            try:
                mid = int(hit["id"])
            except (KeyError, TypeError, ValueError):
                continue
            score = float(hit.get("score", 0.0))
            sem_ids.append(mid)
            sem_scores.append(score)
            sem_meta_by_id[mid] = hit.get("payload") or {}
            sem_score_by_id[mid] = score

        clean_lexical_ids: list[int] = []
        if lexical_ids:
            seen_lex: set[int] = set()
            for raw_id in lexical_ids:
                try:
                    lid = int(raw_id)
                except (TypeError, ValueError):
                    continue
                if lid not in seen_lex:
                    seen_lex.add(lid)
                    clean_lexical_ids.append(lid)

        ranked_lists: dict[str, list[int]] = {"Semantic": sem_ids}
        raw_scores_lists: dict[str, list[float]] = {"Semantic": sem_scores}
        weights: dict[str, float] = {"Semantic": semantic_weight}

        if clean_lexical_ids:
            ranked_lists["Lexical"] = clean_lexical_ids
            raw_scores_lists["Lexical"] = [
                round(1.0 / (idx + 1), 4) for idx in range(len(clean_lexical_ids))
            ]
            weights["Lexical"] = lexical_weight

        fused = reciprocal_rank_fusion_with_details(
            ranked_lists=ranked_lists,
            raw_scores_lists=raw_scores_lists,
            k=rrf_k,
            weights=weights,
            top_n=top_k,
        )

        results: list[dict[str, Any]] = []
        for item in fused:
            mid = int(item["movie_id"])
            meta = sem_meta_by_id.get(mid)
            if meta is None:
                fetched = await self._vs.get_by_id(mid)
                meta = (fetched.get("payload") if fetched else None) or {}

            cos_score = sem_score_by_id.get(mid, 0.0)
            rrf_score = float(item["rrf_score"])

            results.append(
                {
                    "id": mid,
                    "score": cos_score if cos_score > 0 else rrf_score,
                    "raw_cosine_score": cos_score if cos_score > 0 else rrf_score,
                    "rrf_score": rrf_score,
                    "rank": int(item["fused_rank"]),
                    "payload": meta,
                    "contributing_models": item.get("contributing_models", []),
                }
            )

        return results

