from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

import requests
from dotenv import dotenv_values

from services.recommend_service import RecommendService
from utils import setup_logger

logger = setup_logger(name="FastAPI-ChatRAG")

_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

DEFAULT_GEMINI_MODELS = (
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-flash-latest",
    "gemini-2.5-flash-lite",
)


def _read_env_value(key: str, default: str = "") -> str:
    val = os.getenv(key, "").strip()
    if val:
        return val
    if _ENV_PATH.is_file():
        env_map = dotenv_values(_ENV_PATH)
        raw = env_map.get(key)
        if raw:
            return str(raw).strip()
    return default


class ChatRagService:
    """Dịch vụ Chatbot RAG cơ bản: Truy xuất ngữ cảnh phim từ Qdrant + Sinh câu trả lời."""

    def __init__(
        self,
        recommend_service: RecommendService,
        gemini_api_key: str | None = None,
        gemini_model: str | None = None,
    ) -> None:
        self._recommend_service = recommend_service
        self._gemini_api_key = (
            gemini_api_key.strip()
            if gemini_api_key is not None
            else _read_env_value("GEMINI_API_KEY", "")
        )
        self._gemini_model = (
            gemini_model.strip()
            if gemini_model is not None
            else _read_env_value("GEMINI_MODEL", "gemini-2.5-flash")
        )

    async def ask(self, message: str, top_k: int = 5) -> dict[str, Any]:
        """Thực hiện luồng RAG cơ bản: Retrieve từ Qdrant -> Augment Prompt -> Generate câu trả lời."""
        clean_query = (message or "").strip()
        if not clean_query:
            return {
                "answer": "Vui lòng nhập câu hỏi hoặc mô tả bộ phim bạn đang tìm kiếm.",
                "movies": [],
            }

        movies = await self._retrieve_movies(clean_query, top_k=top_k)
        answer = await asyncio.to_thread(
            self._generate_answer, clean_query, movies
        )
        return {
            "answer": answer,
            "movies": movies,
        }

    async def _retrieve_movies(
        self, query: str, top_k: int = 5
    ) -> list[dict[str, Any]]:
        """Truy xuất danh sách phim liên quan từ Qdrant (Hybrid BM25 + Semantic hoặc Semantic)."""
        try:
            results = await self._recommend_service.search_lexical_semantic_rerank(
                query=query,
                top_k=top_k,
                candidate_k=max(top_k * 4, 20),
            )
            if results:
                return results
        except Exception as exc:
            logger.warning(
                "Hybrid rerank retrieval fallback sang semantic_search: %s", exc
            )

        try:
            return await self._recommend_service.semantic_search(
                query=query, top_k=top_k
            )
        except Exception as exc:
            logger.error("Semantic search retrieval that bai: %s", exc)
            return []

    def _build_context_text(self, movies: list[dict[str, Any]]) -> str:
        """Tạo văn bản ngữ cảnh từ danh sách phim truy xuất được."""
        if not movies:
            return "Không tìm thấy bộ phim nào khớp trực tiếp trong cơ sở dữ liệu."

        lines: list[str] = []
        for idx, movie in enumerate(movies, start=1):
            title = movie.get("titleVi") or movie.get("title") or f"Phim #{movie.get('id')}"
            orig_title = movie.get("title")
            title_display = (
                f"{title} ({orig_title})"
                if orig_title and orig_title != title
                else str(title)
            )
            genres = movie.get("genres") or ", ".join(movie.get("genreNames") or [])
            overview = movie.get("overviewVi") or movie.get("overview") or ""
            score = movie.get("similarityScore") or movie.get("score") or 0.0

            line = f"{idx}. Tên phim: {title_display}"
            if genres:
                line += f" | Thể loại: {genres}"
            if overview:
                line += f" | Tóm tắt: {overview}"
            line += f" | Điểm phù hợp: {float(score):.2f}"
            lines.append(line)

        return "\n".join(lines)

    def _generate_answer(
        self, user_message: str, movies: list[dict[str, Any]]
    ) -> str:
        """Gọi Gemini LLM với ngữ cảnh phim; tự động fallback nếu không có API key hoặc lỗi mạng."""
        if not self._gemini_api_key:
            return self._build_fallback_answer(user_message, movies)

        context_text = self._build_context_text(movies)
        prompt = (
            "Bạn là trợ lý tư vấn phim thông minh của hệ thống gợi ý phim.\n"
            "Hãy trả lời câu hỏi của người dùng bằng tiếng Việt tự nhiên, ngắn gọn, thân thiện "
            "và CHỈ dựa trên danh sách phim trong phần NGỮ CẢNH dưới đây.\n"
            "Nếu có phim phù hợp, hãy giới thiệu tên phim, thể loại và lý do ngắn gọn vì sao phim phù hợp.\n\n"
            f"--- NGỮ CẢNH PHIM TỪ HỆ THỐNG ---\n{context_text}\n\n"
            f"--- CÂU HỎI CỦA NGƯỜI DÙNG ---\n{user_message}\n\n"
            "--- CÂU TRẢ LỜI ---"
        )

        candidate_models: list[str] = []
        for m in (self._gemini_model, *DEFAULT_GEMINI_MODELS):
            if m and m not in candidate_models:
                candidate_models.append(m)

        for model_name in candidate_models:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model_name}:generateContent?key={self._gemini_api_key}"
            )
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.4,
                    "maxOutputTokens": 512,
                },
            }
            try:
                resp = requests.post(url, json=payload, timeout=10)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates") or []
                    if candidates:
                        parts = (
                            candidates[0].get("content", {}).get("parts") or []
                        )
                        text = "".join(
                            str(p.get("text", "")) for p in parts
                        ).strip()
                        if text:
                            return text
                logger.warning(
                    "Gemini model %s tra status %s", model_name, resp.status_code
                )
            except Exception as exc:
                logger.warning("Loi khi goi Gemini model %s: %s", model_name, exc)

        return self._build_fallback_answer(user_message, movies)

    @staticmethod
    def _build_fallback_answer(
        user_message: str, movies: list[dict[str, Any]]
    ) -> str:
        """Câu trả lời RAG tổng hợp trực tiếp từ dữ liệu Qdrant khi LLM không khả dụng."""
        if not movies:
            return (
                f"Xin lỗi, tôi chưa tìm thấy bộ phim nào phù hợp với yêu cầu "
                f'"{user_message}". Bạn hãy thử mô tả thêm về thể loại hoặc cốt truyện nhé!'
            )

        lines = [
            f'Dựa trên yêu cầu "{user_message}", tôi gợi ý cho bạn các bộ phim phù hợp nhất từ hệ thống:'
        ]
        for idx, movie in enumerate(movies[:5], start=1):
            title = (
                movie.get("titleVi")
                or movie.get("title")
                or f"Phim #{movie.get('id')}"
            )
            genres = movie.get("genres") or ", ".join(
                movie.get("genreNames") or []
            )
            overview = movie.get("overviewVi") or movie.get("overview")
            item_line = f"- **{idx}. {title}**"
            if genres:
                item_line += f" (*{genres}*)"
            if overview:
                short_overview = (
                    overview[:140].rstrip() + "..."
                    if len(overview) > 140
                    else overview
                )
                item_line += f": {short_overview}"
            lines.append(item_line)

        lines.append(
            "\nBạn có thể nhấn vào từng phim bên dưới để xem chi tiết nhé!"
        )
        return "\n".join(lines)
