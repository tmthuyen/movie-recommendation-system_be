"""
services/search_rerank_service.py
Service độc lập xử lý kết hợp và xếp hạng lại (Rerank) giữa tìm kiếm từ khóa
(Lexical Search bằng BM25) và tìm kiếm ngữ nghĩa (Semantic Vector Search) bằng RRF.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from core.fusion import reciprocal_rank_fusion_with_details
from core.integrations import VectorStore
from services.embedding_service import EmbeddingService
from utils import setup_logger

if TYPE_CHECKING:
    from services.bm25_index_service import Bm25IndexService

logger = setup_logger(name=__name__, filename=__name__)


class SearchRerankService:
    """Service kết hợp Lexical Search (BM25) và Semantic Search (Vector DB)."""

    def __init__(
        self,
        vector_store: VectorStore,
        embedding_service: EmbeddingService,
        bm25_index: Bm25IndexService | None = None,
    ) -> None:
        self._vs = vector_store
        self._emb = embedding_service
        self._bm25 = bm25_index

    async def _lexical_candidates(
        self, query: str, lexical_ids: list[int] | None, pool_size: int
    ) -> tuple[list[int], list[float]]:
        """Lấy danh sách ứng viên Lexical (id, điểm) theo thứ tự giảm dần độ khớp.

        Ưu tiên BM25. Chỉ khi chưa nạp được index BM25 mới dùng ``lexical_ids`` do
        client truyền (tương thích ngược); không có gì thì trả rỗng (chỉ Semantic).
        """
        if self._bm25 is not None and self._bm25.is_ready:
            hits = await self._bm25.search_async(query, top_k=pool_size)
            return (
                [int(hit["movie_id"]) for hit in hits],
                [float(hit["score"]) for hit in hits],
            )

        if lexical_ids:
            logger.warning(
                "BM25 chua san sang, fallback sang lexical_ids do client truyen."
            )
            clean: list[int] = []
            seen: set[int] = set()
            for raw_id in lexical_ids:
                try:
                    lid = int(raw_id)
                except (TypeError, ValueError):
                    continue
                if lid not in seen:
                    seen.add(lid)
                    clean.append(lid)
            return clean, [round(1.0 / (idx + 1), 4) for idx in range(len(clean))]

        logger.warning("BM25 chua san sang va khong co lexical_ids: chi dung Semantic.")
        return [], []

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
        """Kết hợp danh sách ứng viên Lexical (BM25) với Semantic Search bằng RRF.

        Args:
            query: Từ khóa / câu truy vấn của người dùng.
            lexical_ids: (Tuỳ chọn, deprecated) danh sách ID do client truyền; chỉ dùng
                khi index BM25 chưa được nạp.
            top_k: Số lượng kết quả trả về sau khi rerank.
            candidate_k: Số lượng ứng viên lấy từ mỗi nhánh (BM25 và Semantic).
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

        lexical_list, lexical_scores = await self._lexical_candidates(
            query, lexical_ids, pool_size
        )

        ranked_lists: dict[str, list[int]] = {"Semantic": sem_ids}
        raw_scores_lists: dict[str, list[float]] = {"Semantic": sem_scores}
        weights: dict[str, float] = {"Semantic": semantic_weight}

        if lexical_list:
            ranked_lists["Lexical"] = lexical_list
            raw_scores_lists["Lexical"] = lexical_scores
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
