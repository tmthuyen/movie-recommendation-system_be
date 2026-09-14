from fastapi import APIRouter

from ..response import paginated, success
from ..schemas import RecommendationRequest, SearchRequest


router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.post("/search")
async def search(request: SearchRequest) -> dict:
    # Replace this placeholder with the baseline/main model service.
    return paginated([], 0, request.page, request.pageSize, "Search completed")


@router.post("")
async def recommend(request: RecommendationRequest) -> dict:
    # Combine content-based, collaborative and main model results here.
    return paginated([], 0, request.page, request.pageSize, "Recommendations generated")


@router.get("/models")
async def models() -> dict:
    return success({"available": ["tfidf", "bm25"], "active": "main"})