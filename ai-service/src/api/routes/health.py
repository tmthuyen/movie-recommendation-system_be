from fastapi import APIRouter

from ..response import success


router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def health() -> dict:
    return success({"status": "up"}, "AI service is healthy")


@router.get("/readiness")
async def readiness() -> dict:
    return success({"status": "ready"}, "AI service is ready")