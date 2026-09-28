import requests
from fastapi import Request
from fastapi import APIRouter
from fastapi import Depends
from typing import Annotated

from api.schemas import CurrentUser
from api.dependencies.auth import get_current_user
from utils import setup_logger

from ..response import success

logger = setup_logger(name='FastAPI-Recommendations', filename=__name__)
router = APIRouter(tags=["health"])


@router.get("/health")
async def health(req: Request) -> dict:
    logger.info(f"health API called")
    return success({"status": "up"}, "AI service is healthy")



@router.get("/tracing")
async def tracing(
    req: Request
) -> dict:
    """test API"""
    logger.info("tracing API called")

    response = requests.get('http://localhost:8081/api/health')
    
    return success(
        data=response.json(),
    )

# Test auth
@router.get("/test-auth")
async def test_auth(current_user: Annotated[CurrentUser, Depends(get_current_user)]) -> dict:
    
    logger.info("test auth API called")
    logger.info("User: %s", current_user.model_dump_json())
    return success(
        data=current_user,
    )


@router.get("")
async def readiness(req: Request) -> dict:
    logger.info("readiness API called")
    return success({"status": "ready"}, "AI service is ready")