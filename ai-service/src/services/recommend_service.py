'''
services/recommend_service.py
Business-logic layer for all AI recommendation operations.
'''

from __future__ import annotations

import asyncio
import logging
from typing import Any

from core.integrations import VectorStore
from services.embedding_service import EmbeddingService
from services.mapping_service import mapping_service
from utils import setup_logger

logger = setup_logger(name=__name__, filename=__name__)


def _build_search_text(data: dict[str, Any]) -> str:
    parts: list[str] = []
    title_vi: str = str(data.get('title_vi') or '').strip()
    title_en: str = str(data.get('title') or data.get('title_en') or '').strip()
    if title_vi and title_vi.lower() not in ('nan', 'none', ''):
        parts.append(title_vi)
    elif title_en:
        parts.append(title_en)
    genres = data.get('genres') or ''
    if isinstance(genres, list):
        genres = ' '.join(genres)
    if genres and str(genres).lower() not in ('nan', 'none', ''):
        parts.append(str(genres).strip())
    overview: str = str(data.get('overview') or '').strip()
    if overview and overview.lower() not in ('nan', 'none', ''):
        parts.append(overview)
    return '. '.join(filter(None, parts))


def _format_item(item: dict[str, Any]) -> dict[str, Any]:
    meta = item.get('payload') or {}
    title_vi = meta.get('title_vi')
    title_en = meta.get('title')
    display_title = (
        title_vi
        if (title_vi and str(title_vi).strip() not in ('nan', 'None', ''))
        else title_en
    )
    return {
        'movieId': item.get('id'),
        'similarityScore': round(float(item.get('score', 0.0)), 4),
        'title': display_title,
        'titleVi': title_vi if str(title_vi) not in ('nan', 'None') else None,
        'titleEn': title_en if str(title_en) not in ('nan', 'None') else None,
        'genres': meta.get('genres'),
        'releaseDate': str(meta.get('release_date', ''))[:10],
        'voteAverage': meta.get('vote_average'),
        'tmdbId': meta.get('tmdb_id'),
        'popularity': meta.get('popularity'),
    }


class RecommendService:
    def __init__(self, vector_store: VectorStore, embedding_service: EmbeddingService) -> None:
        self._vs = vector_store
        self._emb = embedding_service
        self.cf_weight = 0.6
        self.semantic_weight = 0.4

    async def semantic_search(self, query: str, top_k: int = 10) -> list[dict[str, Any]]:
        vector = await self._emb.encode_async(query)
        raw_results = await self._vs.query(vector, top_k=top_k)
        return [_format_item(item) for item in raw_results]

    async def similar_movies(self, movie_id: int, top_k: int = 10) -> list[dict[str, Any]]:
        target = await self._vs.get_by_id(movie_id)
        if not target or not target.get('vector'):
            raise ValueError(f'Khong tim thay vector cho movieId={movie_id}')
        raw_results = await self._vs.query(vector=target['vector'], top_k=top_k + 1)
        filtered = [item for item in raw_results if item.get('id') != movie_id][:top_k]
        return [_format_item(item) for item in filtered]

    async def upsert_movie_vector(self, movie_data: dict[str, Any]) -> None:
        movie_id = movie_data.get('movieId') or movie_data.get('movie_id')
        if movie_id is None:
            raise ValueError("movie_data phai chua truong 'movieId'")
        movie_id = int(movie_id)
        search_text = _build_search_text(movie_data)
        if not search_text.strip():
            logger.warning('upsert_movie_vector: movieId=%s khong du metadata, bo qua.', movie_id)
            return
        vector: list[float] = await self._emb.encode_async(search_text)
        payload: dict[str, Any] = {
            k: (v if isinstance(v, (str, int, float, bool)) else str(v))
            for k, v in movie_data.items()
            if k not in ('movieId', 'movie_id')
        }
        payload['search_text'] = search_text
        await self._vs.upsert(movie_id, vector, payload)
        logger.info('upsert_movie_vector: movieId=%s text_len=%d', movie_id, len(search_text))

    async def delete_movie_vector(self, movie_id: int) -> bool:
        movie_id = int(movie_id)
        backend = getattr(self._vs, 'backend', None)
        if backend is not None and hasattr(backend, '_collections'):
            collection = backend._get_collection(backend.settings.vector_collection)
            if collection is None:
                logger.warning('delete_movie_vector: ChromaDB collection chua khoi tao.')
                return False
            def _sync_delete() -> None:
                collection.delete(ids=[str(movie_id)])
            await asyncio.to_thread(_sync_delete)
            logger.info('delete_movie_vector: movieId=%s da xoa khoi ChromaDB.', movie_id)
            return True
        logger.warning('delete_movie_vector: backend %s khong ho tro xoa.', type(backend).__name__)
        return False

    async def hybrid_recommendation(self, user_uuid: str, top_k: int = 10) -> list[dict[str, Any]]:
        """Combine Collaborative Filtering and Semantic Profile for Hybrid Recommendations."""
        user_idx = mapping_service.get_user_idx(user_uuid)
        pseudo_id = user_idx if user_idx is not None else (abs(hash(user_uuid)) % (10**9))
        
        logger.info(f"[HybridSearch] User {user_uuid} -> user_idx: {user_idx}, pseudo_id: {pseudo_id}")
        
        cf_results = []
        sem_results = []
        
        # 1. Fetch CF Recommendations
        if user_idx is not None:
            u_cf = await self._vs.get_by_id(user_idx, collection_name=self._vs.settings.vector_user_cf_collection)
            if u_cf and u_cf.get("vector"):
                logger.info(f"[HybridSearch] Found CF vector for user {user_uuid} (idx {user_idx})")
                cf_hits = await self._vs.query(u_cf["vector"], top_k=top_k*2, collection_name=self._vs.settings.vector_movie_cf_collection)
                cf_results = cf_hits
            else:
                logger.info(f"[HybridSearch] User {user_uuid} is in mapping, but NO CF vector found in ChromaDB.")
        else:
            logger.info(f"[HybridSearch] User {user_uuid} not found in CF mapping (Cold Start).")
                
        # 2. Fetch Semantic Recommendations
        u_sem = await self._vs.get_by_id(pseudo_id, collection_name=self._vs.settings.vector_user_profile_collection)
        if u_sem and u_sem.get("vector"):
            logger.info(f"[HybridSearch] Found Semantic vector for user {user_uuid}")
            sem_hits = await self._vs.query(u_sem["vector"], top_k=top_k*2, collection_name=self._vs.settings.vector_collection)
            sem_results = sem_hits
        else:
            logger.info(f"[HybridSearch] NO Semantic vector found for user {user_uuid} (id {pseudo_id}).")
            
        logger.info(f"[HybridSearch] Found {len(cf_results)} CF hits and {len(sem_results)} Semantic hits.")
            
        # 3. Combine and Rerank
        combined_scores = {}
        evidences = {}
        
        # Normalize scores (assuming cosine similarity [0,1] or similar)
        for item in cf_results:
            mid = item["id"]
            cf_score = item["score"]
            combined_scores[mid] = combined_scores.get(mid, 0) + cf_score * self.cf_weight
            evidences[mid] = evidences.get(mid, []) + [f"Được đề xuất dựa trên phân tích hành vi người dùng tương đồng (Điểm CF: {round(cf_score*100, 1)}%)"]
            
        for item in sem_results:
            mid = item["id"]
            sem_score = item["score"]
            combined_scores[mid] = combined_scores.get(mid, 0) + sem_score * self.semantic_weight
            evidences[mid] = evidences.get(mid, []) + [f"Phù hợp với sở thích về nội dung và thể loại phim của bạn (Điểm Semantic: {round(sem_score*100, 1)}%)"]
            
        # Sort by combined score
        sorted_mids = sorted(combined_scores.keys(), key=lambda k: combined_scores[k], reverse=True)[:top_k]
        
        # 4. Format Results
        final_results = []
        for mid in sorted_mids:
            # Get full movie info from semantic collection
            movie_info = await self._vs.get_by_id(mid, collection_name=self._vs.settings.vector_collection)
            if movie_info:
                # Add the original score to movie_info so _format_item parses it correctly
                movie_info["score"] = combined_scores[mid]
                formatted = _format_item(movie_info)
                formatted["hybridScore"] = combined_scores[mid]
                
                # Combine evidences into a nice readable string
                formatted["evidences"] = evidences[mid]
                final_results.append(formatted)
                
        return final_results

