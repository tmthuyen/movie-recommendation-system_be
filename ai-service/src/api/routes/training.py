from fastapi import APIRouter, Request, status

from ..response import success
from ..schemas import TrainRequest


router = APIRouter(prefix="/training", tags=["training"])


@router.post("/train", status_code=status.HTTP_202_ACCEPTED)
async def train(request: TrainRequest, app_request: Request) -> dict:
    job_id = await app_request.app.state.training_scheduler.enqueue(request)
    return success({"jobId": job_id, "modelName": request.modelName}, "Training accepted", status.HTTP_202_ACCEPTED)