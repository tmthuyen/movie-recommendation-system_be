from fastapi import Request
from utils import setup_logger
from fastapi import APIRouter

from ..response import success

logger = setup_logger(name='FastAPI-Recommendations', filename=__name__)
router = APIRouter(tags=["health"])


@router.get("/health")
async def health(req: Request) -> dict:
    logger.info(f"health API called")
    return success({"status": "up"}, "AI service is healthy")


@router.get("")
async def readiness(req: Request) -> dict:
    logger.info("readiness API called")
    return success({"status": "ready"}, "AI service is ready")