from typing import Annotated

import requests
from fastapi import APIRouter, Depends, Request

from api.dependencies.auth import get_current_user
from api.schemas import CurrentUser
from infra.monitoring.prometheus import check_infra
from utils import setup_logger

from ..response import success

logger = setup_logger(name="FastAPI-Recommendations", filename=__name__)
router = APIRouter(tags=["health"])


@router.get("/health")
async def health(req: Request) -> dict:
    logger.info(f"health API called")

    data = {
        "status": "up",
        "infrastructure": check_infra(),
    }
    return success(
        data=data,
        message="Health check successful",
        status_code=200,
    )


@router.get("/tracing")
async def tracing(req: Request) -> dict:
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
) -> dict:

    logger.info("test auth API called")
    logger.info("User: %s", current_user.model_dump_json())
    return success(
        data=current_user,
    )
