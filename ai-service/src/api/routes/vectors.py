from fastapi import APIRouter, Request, status

from ..response import success
from ..schemas import VectorUpsertRequest


router = APIRouter(prefix="/vectors", tags=["vectors"])


@router.put("/movies/{movie_id}", status_code=status.HTTP_202_ACCEPTED)
async def upsert_movie_vector(movie_id: int, request: VectorUpsertRequest, app_request: Request) -> dict:
    await app_request.app.state.vector_store.upsert(movie_id, request.vector, request.payload)
    return success({"movieId": movie_id}, "Movie vector accepted", status.HTTP_202_ACCEPTED)