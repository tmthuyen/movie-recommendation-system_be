from fastapi import APIRouter, HTTPException, Query, Request, status
from typing import Any

from ..response import paginated, success
from ..schemas import RecommendationRequest, SearchRequest
from services.embedding_service import embedding_service
from core.config import get_settings
from core.integrations import VectorStore

router = APIRouter(prefix="/recommendations", tags=["recommendations"])
settings = get_settings()


async def _get_vector_store(request: Request) -> VectorStore:
    vector_store = getattr(request.app.state, "vector_store", None)
    if vector_store is None:
        vector_store = VectorStore(settings)
        await vector_store.start()
        request.app.state.vector_store = vector_store
    elif hasattr(vector_store.backend, "_collection") and vector_store.backend._collection is None:
        await vector_store.start()
    return vector_store


def _format_vector_item(item: dict[str, Any]) -> dict[str, Any]:
    meta = item.get("payload", {}) or {}
    title_vi = meta.get("title_vi")
    title_en = meta.get("title")
    display_title = title_vi if (title_vi and str(title_vi).strip() != "nan") else title_en
    
    return {
        "movieId": item.get("id"),
        "similarityScore": round(item.get("score", 0.0), 4),
        "title": display_title,
        "titleVi": title_vi if str(title_vi) != "nan" else None,
        "titleEn": title_en if str(title_en) != "nan" else None,
        "genres": meta.get("genres"),
        "releaseDate": str(meta.get("release_date", ""))[:10],
        "voteAverage": meta.get("vote_average"),
        "tmdbId": meta.get("tmdb_id"),
        "popularity": meta.get("popularity"),
    }


@router.get("/semantic-search")
async def semantic_search(
    app_request: Request,
    query: str = Query(..., min_length=1, max_length=500, description="Truy vấn từ khóa/mô tả ý định tự nhiên"),
    top_k: int = Query(default=10, ge=1, le=100, description="Số lượng phim gợi ý cần trả về"),
) -> dict:
    """Tìm kiếm phim theo ý định tự nhiên (Semantic Search) sử dụng Sentence-BERT và ChromaDB."""
    vector_store = await _get_vector_store(app_request)

    # 1. Embed query string to dense vector
    vector = await embedding_service.encode_async(query)

    # 2. Query ChromaDB Vector Store
    raw_results = await vector_store.query(vector, top_k=top_k)

    # 3. Format result list
    formatted_data = [_format_vector_item(item) for item in raw_results]

    return paginated(
        data=formatted_data,
        total_items=len(formatted_data),
        page=1,
        page_size=top_k,
        message=f"Tìm kiếm ngữ nghĩa thành công cho từ khóa '{query}'",
    )


@router.get("/similar/{movie_id}")
async def get_similar_movies(
    movie_id: int,
    app_request: Request,
    top_k: int = Query(default=10, ge=1, le=50, description="Số phim tương tự cần tìm"),
) -> dict:
    """Gợi ý danh sách phim có nội dung/ngữ nghĩa tương đồng nhất với bộ phim `movie_id` (Item-to-Item Similarity)."""
    vector_store = await _get_vector_store(app_request)

    # 1. Fetch vector embedding of the target movie
    target_item = await vector_store.get_by_id(movie_id)
    if not target_item or not target_item.get("vector"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Không tìm thấy vector embedding cho movieId={movie_id} trong Vector DB",
        )

    # 2. Query top (top_k + 1) nearest vectors to exclude self
    raw_results = await vector_store.query(
        vector=target_item["vector"], top_k=top_k + 1
    )

    # 3. Exclude the query movie itself
    filtered_results = [item for item in raw_results if item.get("id") != movie_id][:top_k]
    formatted_data = [_format_vector_item(item) for item in filtered_results]

    return success(
        data=formatted_data,
        message=f"Lấy danh sách {len(formatted_data)} phim tương tự cho movieId={movie_id} thành công",
    )


@router.post("/search")
async def search(request: SearchRequest, app_request: Request) -> dict:
    """API Search tổng hợp hỗ trợ cả Semantic Search và các mô hình tìm kiếm khác."""
    if request.model in ("semantic", "main", "tfidf"):
        vector_store = await _get_vector_store(app_request)
        vector = await embedding_service.encode_async(request.query)
        raw_results = await vector_store.query(vector, top_k=request.pageSize)
        formatted_data = [_format_vector_item(item) for item in raw_results]
        return paginated(
            data=formatted_data,
            total_items=len(formatted_data),
            page=request.page,
            page_size=request.pageSize,
            message="Semantic search completed",
        )

    return paginated([], 0, request.page, request.pageSize, f"Search model '{request.model}' completed")


@router.post("")
async def recommend(request: RecommendationRequest) -> dict:
    """Endpoint gợi ý phim tổng hợp (Hybrid Recommender Placeholder)."""
    return paginated([], 0, request.page, request.pageSize, "Recommendations generated")


@router.get("/models")
async def models() -> dict:
    return success({"available": ["semantic", "tfidf", "bm25"], "active": "semantic"})