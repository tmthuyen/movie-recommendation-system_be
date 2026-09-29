from fastapi import requests
from fastapi import APIRouter, HTTPException, Query, Request, status, Depends 
from typing import Annotated 

from api.schemas import CurrentUser, HybridRequest, SearchRequest
from api.dependencies.auth import get_current_user
from core.config import get_settings
from core.integrations import VectorStore
from services.recommend_service import RecommendService
from services.embedding_service import embedding_service
from utils import setup_logger
from ..response import paginated, success

router = APIRouter(tags=["recommendations"])
settings = get_settings()

logger = setup_logger(name='FastAPI-Recommendations', filename=__name__)

async def _get_recommend_service(request: Request) -> RecommendService:
    '''Lấy hoặc khởi tạo RecommendService từ app.state.'''
    svc = getattr(request.app.state, 'recommend_service', None)
    if svc is not None:
        return svc

    # Khởi tạo VectorStore nếu chưa có
    vector_store = getattr(request.app.state, 'vector_store', None)
    if vector_store is None:
        vector_store = VectorStore(settings)
        await vector_store.start()
        request.app.state.vector_store = vector_store
    elif hasattr(vector_store.backend, '_collection') and vector_store.backend._collection is None:
        await vector_store.start()

    svc = RecommendService(vector_store=vector_store, embedding_service=embedding_service)
    request.app.state.recommend_service = svc
    return svc


@router.get('/semantic-search')
async def semantic_search(
    app_request: Request,
    query: str = Query(..., min_length=1, max_length=500, description='Tu khoa / mo ta y dinh tu nhien'),
    top_k: int = Query(default=10, ge=1, le=100, description='So luong phim goi y can tra ve'),
) -> dict:
    '''Tim kiem phim theo y dinh tu nhien (Semantic Search) su dung Sentence-BERT va ChromaDB.'''
    svc = await _get_recommend_service(app_request)
    data = await svc.semantic_search(query=query, top_k=top_k)
    return paginated(
        data=data,
        total_items=len(data),
        page=1,
        page_size=top_k,
        message=f"Tim kiem ngu nghia thanh cong cho tu khoa '{query}'",
    )
# @router.post("")
# async def recommend(request: RecommendationRequest) -> dict:
#     # Combine content-based, collaborative and main model results here.
#     return paginated([], 0, request.page, request.limit, "Recommendations generated")

 
 
@router.get('/similar/{movie_id}')
async def get_similar_movies(
    movie_id: int,
    app_request: Request,
    top_k: int = Query(default=10, ge=1, le=50, description='So phim tuong tu can tim'),
) -> dict:
    '''Goi y danh sach phim co noi dung/ngu nghia tuong dong nhat voi movie_id (Item-to-Item).'''
    svc = await _get_recommend_service(app_request)
    try:
        data = await svc.similar_movies(movie_id=movie_id, top_k=top_k)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return success(
        data=data,
        message=f'Lay danh sach {len(data)} phim tuong tu cho movieId={movie_id} thanh cong',
    )


@router.post('/search')
async def search(request: SearchRequest, app_request: Request) -> dict:
    '''API Search tong hop ho tro ca Semantic Search va cac mo hinh tim kiem khac.'''
    svc = await _get_recommend_service(app_request)
    if request.model in ('semantic', 'main', 'tfidf'):
        data = await svc.semantic_search(query=request.query, top_k=request.pageSize)
        return paginated(
            data=data,
            total_items=len(data),
            page=request.page,
            page_size=request.pageSize,
            message='Semantic search completed',
        )
    return paginated([], 0, request.page, request.pageSize, f"Search model '{request.model}' completed")


# @router.post('')
# async def recommend(request: RecommendationRequest) -> dict:
#     '''Endpoint goi y phim tong hop (Hybrid Recommender Placeholder).'''
#     return paginated([], 0, request.page, request.pageSize, 'Recommendations generated')


@router.get("/hybrid")
async def hybrid_search(
    request: Annotated[HybridRequest, Query()],
    current_user: Annotated[
        CurrentUser,
        Depends(get_current_user)
    ],
) -> dict:
    """search API"""
    logger.info("hybrid search API called")
    logger.info(f'hybrid search req: {request}')
    logger.info(f'hybrid search user: {current_user.sub}')


    if current_user.sub != request.userId:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Không có quyền truy cập gợi ý của người khác",
            headers={
                "WWW-Authenticate": "Bearer"
            },
        )

    # Replace this placeholder with the baseline/main model service.
    return paginated([], 0, request.page, request.limit, "Search completed")



# ===================
# DEBUG APIs
# ===================

@router.get("/tracing")
async def tracing(req: Request) -> dict:
    """test API"""
    # Không cần truyền headers nữa, OTel tự động kẹp traceparent vào requests.get
    response = requests.get('http://localhost:8081/api/health')
    
    logger.info("tracing API called")
    return success(
        data=response.json(),
    )

