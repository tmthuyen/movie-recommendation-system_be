from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, requests, status

from api.dependencies.auth import get_current_user
from api.schemas import CurrentUser, HybridRequest, SearchRequest, SimilarMoviesResponse
from core.config import get_settings
from core.integrations import VectorStore
from services.embedding_service import embedding_service
from services.recommend_service import RecommendService
from utils import setup_logger

from ..response import paginated, success

router = APIRouter(tags=["recommendations"])
settings = get_settings()

logger = setup_logger(name="FastAPI-Recommendations", filename=__name__)


async def _get_recommend_service(request: Request) -> RecommendService:
    """Lấy hoặc khởi tạo RecommendService từ app.state."""
    svc = getattr(request.app.state, "recommend_service", None)
    if svc is not None:
        return svc

    # Khởi tạo VectorStore nếu chưa có
    vector_store = getattr(request.app.state, "vector_store", None)
    if vector_store is None:
        vector_store = VectorStore(settings)
        await vector_store.start()
        request.app.state.vector_store = vector_store
    elif (
        hasattr(vector_store.backend, "_collection")
        and vector_store.backend._collection is None
    ):
        await vector_store.start()

    svc = RecommendService(
        vector_store=vector_store, embedding_service=embedding_service
    )
    request.app.state.recommend_service = svc
    return svc


@router.get("/semantic-search")
async def semantic_search(
    app_request: Request,
    keyword: str = Query(
        ..., min_length=1, max_length=500, description="Tu khoa / mo ta y dinh tu nhien"
    ),
    topK: int = Query(
        default=10, ge=1, le=100, description="So luong phim goi y can tra ve"
    ),
) -> dict:
    """Tim kiem phim theo y dinh tu nhien (Semantic Search) su dung Sentence-BERT va ChromaDB."""
    svc = await _get_recommend_service(app_request)
    data = await svc.semantic_search(query=keyword, top_k=topK)
    return paginated(
        data=data,
        total_items=len(data),
        page=1,
        page_size=topK,
        message=f"Tim kiem ngu nghia thanh cong cho tu khoa '{keyword}'",
    )


# @router.post("")
# async def recommend(request: RecommendationRequest) -> dict:
#     # Combine content-based, collaborative and main model results here.
#     return paginated([], 0, request.page, request.limit, "Recommendations generated")


@router.get("/similar/{movie_id}")
async def get_similar_movies(
    movie_id: int,
    app_request: Request,
    topK: int = Query(default=10, ge=1, le=50, description="So phim tuong tu can tim"),
) -> dict:
    svc = await _get_recommend_service(app_request)
    try:
        data: list[SimilarMoviesResponse] = await svc.similar_movies(
            movie_id=movie_id, top_k=topK
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return paginated(
        data=data,
        total_items=len(data),
        page=1,
        page_size=topK,
        message=f"Goi y {len(data)} phim tuong tu voi movie_id={movie_id}",
    )


@router.get("/similar-rerank/{movie_id}")
@router.get("/similar/{movie_id}/rerank")
async def get_similar_movies_rerank(
    movie_id: int,
    app_request: Request,
    topK: int | None = Query(default=None, ge=1, le=50, description="So luong phim can tim (camelCase)"),
    top_k: int = Query(default=10, ge=1, le=50, description="Alias cho topK"),
    mode: str = Query(
        default="soft",
        pattern="^(off|soft|strict)$",
        description="Che do reranking the loai: off | soft | strict",
    ),
    genreWeight: float | None = Query(
        default=None,
        ge=0.0,
        le=1.0,
        description="Trong so the loai khi dung soft (camelCase)",
    ),
    genre_weight: float = Query(
        default=0.3,
        ge=0.0,
        le=1.0,
        description="Alias cho genreWeight",
    ),
    candidateK: int | None = Query(
        default=None,
        ge=20,
        le=200,
        description="Kich thuoc pool ung vien retrieval (camelCase)",
    ),
    candidate_k: int = Query(
        default=100,
        ge=20,
        le=200,
        description="Alias cho candidateK",
    ),
) -> dict:
    """Goi y danh sach phim tuong tu kem Genre-aware Reranking (off | soft | strict) - Endpoint moi (chuan camelCase)."""
    limit = topK if topK is not None else top_k
    weight = genreWeight if genreWeight is not None else genre_weight
    cand_k = candidateK if candidateK is not None else candidate_k

    svc = await _get_recommend_service(app_request)
    try:
        data = await svc.similar_movies_rerank(
            movie_id=movie_id,
            top_k=limit,
            mode=mode,
            genre_weight=weight,
            candidate_k=cand_k,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return paginated(
        data=data,
        total_items=len(data),
        page=1,
        page_size=limit,
        message=f"Goi y {len(data)} phim tuong tu voi movie_id={movie_id} (mode={mode})",
    )


@router.get("/search")
async def search(request: SearchRequest, app_request: Request) -> dict:
    """API Search tong hop ho tro ca Semantic Search va cac mo hinh tim kiem khac."""
    svc = await _get_recommend_service(app_request)
    if request.model in ("semantic", "main", "tfidf"):
        data = await svc.semantic_search(query=request.query, top_k=request.pageSize)
        return paginated(
            data=data,
            total_items=len(data),
            page=request.page,
            page_size=request.pageSize,
            message="Semantic search completed",
        )
    return paginated(
        [],
        0,
        request.page,
        request.pageSize,
        f"Search model '{request.model}' completed",
    )


# @router.post('')
# async def recommend(request: RecommendationRequest) -> dict:
#     '''Endpoint goi y phim tong hop (Hybrid Recommender Placeholder).'''
#     return paginated([], 0, request.page, request.pageSize, 'Recommendations generated')


@router.get("/hybrid-search")
async def hybrid_search(
    request: Annotated[HybridRequest, Query()],
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
    app_request: Request,
) -> dict:
    """search API"""
    logger.info("hybrid search API called")
    logger.info(f"hybrid search req: {request}")
    logger.info(f"hybrid search user: {current_user.sub}")

    if current_user.sub != request.userId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không có quyền truy cập gợi ý của người khác",
            headers={"WWW-Authenticate": "Bearer"},
        )

    svc = await _get_recommend_service(app_request)
    data = await svc.hybrid_recommendation(user_uuid=request.userId, top_k=request.topK)

    total_items = len(data)
    if total_items == 0:
        message = f"Không tìm thấy gợi ý cho userId={request.userId}"
    else:
        message = f"Gợi ý {total_items} phim cho userId={request.userId} thành công"

    return paginated(
        data,
        total_items=total_items,
        page=request.page,
        page_size=request.pageSize,
        message=message,
    )


# ===================
# DEBUG APIs
# ===================


@router.get("/hybrid/no-auth")
async def hybrid_search_debug(
    userId: str,
    app_request: Request,
    topK: int = 10,
) -> dict:
    """Debug API: Lấy Hybrid Recommendation cho bất kỳ User ID nào (không cần token JWT)"""
    logger.info(f"hybrid debug search API called for user: {userId}")

    svc = await _get_recommend_service(app_request)

    data = await svc.hybrid_recommendation(user_uuid=userId, top_k=topK)

    res = paginated(
        data,
        len(data),
        1,
        topK,
        f"Debug Hybrid Recommendations generated for userId={userId}",
    )
    logger.info(
        f"hybrid debug search API response: {len(data)} recommendations for user: {userId}"
    )

    return res
