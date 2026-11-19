from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from api.routes.recommendations import _get_recommend_service
from api.schemas import ApiResponse
from services.chat_rag_service import ChatRagService
from utils import setup_logger

from ..response import success

router = APIRouter(tags=["chat"])
logger = setup_logger(name="FastAPI-ChatRAG")


class ChatRagRequest(BaseModel):
    message: str = Field(
        ...,
        min_length=1,
        max_length=1000,
        description="Câu hỏi hoặc yêu cầu gợi ý phim của người dùng",
    )
    topK: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Số lượng phim ngữ cảnh truy xuất từ Qdrant",
    )


@router.post("/chat", response_model=ApiResponse[dict[str, Any]])
async def chat_rag(
    body: ChatRagRequest,
    app_request: Request,
) -> ApiResponse[dict[str, Any]]:
    """Endpoint Chatbot RAG cơ bản: Truy xuất phim từ Qdrant và sinh câu trả lời."""
    logger.info("Nhan yeu cau Chat RAG voi topK=%s", body.topK)
    recommend_svc = await _get_recommend_service(app_request)
    chat_svc = ChatRagService(recommend_service=recommend_svc)
    data = await chat_svc.ask(message=body.message, top_k=body.topK)
    return success(
        data=data,
        message="Trả lời câu hỏi thành công",
    )
