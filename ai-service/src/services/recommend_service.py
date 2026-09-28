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

logger = logging.getLogger(__name__)


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
        if backend is not None and hasattr(backend, '_collection'):
            if backend._collection is None:
                logger.warning('delete_movie_vector: ChromaDB collection chua khoi tao.')
                return False
            def _sync_delete() -> None:
                backend._collection.delete(ids=[str(movie_id)])
            await asyncio.to_thread(_sync_delete)
            logger.info('delete_movie_vector: movieId=%s da xoa khoi ChromaDB.', movie_id)
            return True
        logger.warning('delete_movie_vector: backend %s khong ho tro xoa.', type(backend).__name__)
        return False
