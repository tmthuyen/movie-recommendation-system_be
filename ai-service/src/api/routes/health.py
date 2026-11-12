from typing import Annotated

import requests
from fastapi import APIRouter, Depends, Request

from api.dependencies.auth import get_current_user
from api.schemas import ApiResponse, CurrentUser
from core.vector_health import build_vector_db_health
from infra.monitoring.prometheus import check_infra
from utils import setup_logger

from ..response import success

logger = setup_logger(name="FastAPI-Recommendations")
router = APIRouter(tags=["health"])


@router.get("/health")
async def health(req: Request) -> ApiResponse[dict]:
    logger.info(f"health API called")

    vector_db = None
    vector_store = getattr(req.app.state, "vector_store", None)
    if vector_store is not None:
        try:
            vector_db = await build_vector_db_health(
                vector_store, getattr(vector_store, "settings", None)
            )
            vector_db.pop("location", None)
        except Exception as exc:
            logger.warning("Cannot read vector DB health: %s", exc)

    data = {
        "status": "up",
        "infrastructure": check_infra(),
        "vector_db": vector_db,
    }
    return success(
        data=data,
        message="Health check successful",
        status_code=200,
    )


@router.get("/tracing")
async def tracing(req: Request) -> ApiResponse[dict]:
    """test API"""
    logger.info("tracing API called")

    response = requests.get("http://localhost:8081/api/health")

    return success(
        data=response.json(),
    )


# Test auth
@router.get("/test-auth")
async def test_auth(
    current_user: Annotated[CurrentUser, Depends(get_current_user)],
) -> ApiResponse[CurrentUser]:

    logger.info("test auth API called")
    logger.info("User: %s", current_user.model_dump_json())
    return success(
        data=current_user,
    )
