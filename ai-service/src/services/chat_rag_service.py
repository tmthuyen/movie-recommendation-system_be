from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import AsyncGenerator
from enum import Enum
from pathlib import Path
from typing import Any

import httpx
import requests
from dotenv import dotenv_values

from services.recommend_service import RecommendService
from utils import setup_logger

logger = setup_logger(name="FastAPI-ChatRAG")

_ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

DEFAULT_GEMINI_MODELS = (
    "gemini-flash-lite-latest",
    "gemini-flash-latest",
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
)


class ChatIntent(str, Enum):
    """4 nhánh ý định chính của Chatbot."""

    CHITCHAT = "CHITCHAT"
    MOVIE_SEARCH_RAG = "MOVIE_SEARCH_RAG"
    SYSTEM_STATS = "SYSTEM_STATS"
    OUT_OF_SCOPE = "OUT_OF_SCOPE"


class StatType(str, Enum):
    """Phân loại cụ thể cho ý định thống kê hệ thống."""

    MOST_COMMENTED = "most_commented"
    TOP_RATED = "top_rated"
    MOST_VIEWED = "most_viewed"
    MOST_LIKED = "most_liked"
    MOVIE_COUNT = "movie_count"
    GENERAL = "general"


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
    """Dịch vụ Chatbot RAG tích hợp Bộ phân loại ý định (Intent Gatekeeper) 4 nhánh."""

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
            else _read_env_value("GEMINI_MODEL", "gemini-flash-lite-latest")
        )

    async def ask(self, message: str, top_k: int = 5) -> dict[str, Any]:
        """Điều phối yêu cầu người dùng theo 4 nhánh ý định:

        1. CHITCHAT: Chào hỏi, cảm ơn, giới thiệu bản thân (trả lời tức thì, không query vector).
        2. SYSTEM_STATS: Hỏi thống kê hệ thống (top comment, rating cao nhất, số lượng phim).
        3. OUT_OF_SCOPE: Câu hỏi ngoài lề (khoa học, đời sống, toán, lập trình...) -> Từ chối lịch sự.
        4. MOVIE_SEARCH_RAG: Tìm & gợi ý phim -> Hybrid Search Qdrant + Gemini LLM.
        """
        clean_query = (message or "").strip()
        if not clean_query:
            return {
                "intent": ChatIntent.CHITCHAT.value,
                "answer": "Xin chào! Bạn muốn tìm phim theo thể loại, cốt truyện hay cảm xúc nào hôm nay?",
                "movies": [],
            }

        # 1. Phân loại ý định qua Intent Gatekeeper
        intent, stat_type = await asyncio.to_thread(self.classify_intent, clean_query)
        logger.info(
            "Phan loai y dinh cho query '%s': intent=%s, stat_type=%s",
            clean_query,
            intent.value,
            stat_type.value if stat_type else None,
        )

        # 2. Xử lý theo từng nhánh
        if intent == ChatIntent.CHITCHAT:
            answer = self._generate_chitchat_answer(clean_query)
            return {
                "intent": intent.value,
                "answer": answer,
                "movies": [],
            }

        if intent == ChatIntent.OUT_OF_SCOPE:
            answer = self._generate_out_of_scope_answer(clean_query)
            return {
                "intent": intent.value,
                "answer": answer,
                "movies": [],
            }

        if intent == ChatIntent.SYSTEM_STATS:
            # Nhánh thống kê: trả về intent và statType để Backend NestJS truy vấn DB quan hệ
            return {
                "intent": intent.value,
                "statType": stat_type.value if stat_type else StatType.GENERAL.value,
                "answer": f"Đang tổng hợp số liệu thống kê {stat_type.value if stat_type else ''} từ hệ thống Moviere...",
                "movies": [],
            }

        # Nhánh MOVIE_SEARCH_RAG: Tìm phim trên Qdrant + Sinh câu trả lời ngữ cảnh
        movies = await self._retrieve_movies(clean_query, top_k=top_k)
        answer = await asyncio.to_thread(self._generate_answer, clean_query, movies)
        return {
            "intent": intent.value,
            "answer": answer,
            "movies": movies,
        }

    async def ask_stream(
        self, message: str, top_k: int = 5
    ) -> AsyncGenerator[dict[str, Any], None]:
        """Điều phối yêu cầu người dùng theo 4 nhánh ý định và stream dữ liệu theo chuẩn SSE:

        1. Phát event 'metadata' (chứa intent, statType, danh sách phim rút trích).
        2. Phát chuỗi event 'token' (từng token / phần chữ từ Gemini hoặc hệ thống).
        3. Phát event 'done' khi hoàn tất.
        """
        clean_query = (message or "").strip()
        if not clean_query:
            yield {
                "event": "metadata",
                "intent": ChatIntent.CHITCHAT.value,
                "statType": None,
                "movies": [],
            }
            yield {
                "event": "token",
                "text": "Xin chào! Bạn muốn tìm phim theo thể loại, cốt truyện hay cảm xúc nào hôm nay?",
            }
            yield {"event": "done"}
            return

        # 1. Phân loại ý định qua Intent Gatekeeper
        intent, stat_type = await asyncio.to_thread(self.classify_intent, clean_query)
        logger.info(
            "Phan loai y dinh stream cho query '%s': intent=%s, stat_type=%s",
            clean_query,
            intent.value,
            stat_type.value if stat_type else None,
        )

        # 2. Xử lý theo từng nhánh
        if intent == ChatIntent.CHITCHAT:
            answer = self._generate_chitchat_answer(clean_query)
            yield {
                "event": "metadata",
                "intent": intent.value,
                "statType": None,
                "movies": [],
            }
            async for token in self._stream_text_chunks(answer):
                yield {"event": "token", "text": token}
            yield {"event": "done"}
            return

        if intent == ChatIntent.OUT_OF_SCOPE:
            answer = self._generate_out_of_scope_answer(clean_query)
            yield {
                "event": "metadata",
                "intent": intent.value,
                "statType": None,
                "movies": [],
            }
            async for token in self._stream_text_chunks(answer):
                yield {"event": "token", "text": token}
            yield {"event": "done"}
            return

        if intent == ChatIntent.SYSTEM_STATS:
            # Nhánh thống kê: trả về intent và statType để Backend NestJS truy vấn DB quan hệ
            yield {
                "event": "metadata",
                "intent": intent.value,
                "statType": stat_type.value if stat_type else StatType.GENERAL.value,
                "movies": [],
            }
            yield {"event": "done"}
            return

        # Nhánh MOVIE_SEARCH_RAG: Tìm phim trên Qdrant + Stream câu trả lời ngữ cảnh
        movies = await self._retrieve_movies(clean_query, top_k=top_k)
        yield {
            "event": "metadata",
            "intent": intent.value,
            "statType": None,
            "movies": movies,
        }

        has_streamed_any_token = False
        async for token in self._stream_gemini_answer(clean_query, movies):
            has_streamed_any_token = True
            yield {"event": "token", "text": token}

        if not has_streamed_any_token:
            fallback = self._build_fallback_answer(clean_query, movies)
            async for token in self._stream_text_chunks(fallback):
                yield {"event": "token", "text": token}

        yield {"event": "done"}

    def classify_intent(self, query: str) -> tuple[ChatIntent, StatType | None]:
        """Phân loại câu hỏi thành 1 trong 4 nhánh:

        - Heuristic pattern matching tốc độ cao (<1ms).
        - Nếu câu hỏi kiến thức đời sống / mơ hồ -> LLM Gatekeeper phân loại ngữ nghĩa sâu.
        """
        heuristic_intent, stat_type = self._heuristic_classify(query)
        if heuristic_intent is not None:
            return heuristic_intent, stat_type

        # LLM Gatekeeper phân loại sâu nếu query mơ hồ hoặc đa nghĩa
        if self._gemini_api_key:
            return self._llm_classify(query)

        # Kiểm tra fallback nếu không có LLM: câu hỏi kiến thức "tại sao...", "vì sao..."
        q_lower = query.lower()
        if re.search(
            r"^(tại sao|vì sao|nguyên nhân|thế nào là|lý do tại sao)\b", q_lower
        ) and not re.search(
            r"\b(phim|movie|film|nhân vật|đạo diễn|diễn viên)\b", q_lower
        ):
            return ChatIntent.OUT_OF_SCOPE, None

        # Mặc định an toàn cho các câu hỏi còn lại: Tìm phim
        return ChatIntent.MOVIE_SEARCH_RAG, None

    def _heuristic_classify(
        self, query: str
    ) -> tuple[ChatIntent | None, StatType | None]:
        """Quy tắc regex/keyword linh hoạt nhận diện ý định nhanh chóng và chính xác.

        Hỗ trợ đa dạng cách đặt câu hỏi về thống kê, bình luận, đánh giá.
        """
        q_lower = query.lower().strip()

        # Kiểm tra xem có từ khóa điện ảnh rõ ràng hay không
        has_movie_context = bool(
            re.search(
                r"\b(phim|movie|film|chiếu rạp|hoạt hình|anime|cốt truyện|thể loại|đạo diễn|diễn viên)\b",
                q_lower,
            )
        )

        # ----------------------------------------------------
        # 1. Nhánh SYSTEM_STATS: Thống kê số liệu hệ thống (Linh hoạt cấu trúc câu)
        # ----------------------------------------------------
        # Phim nhiều bình luận / comment / thảo luận nhất (ví dụ: "film có nhiều người bình luận nhất", "phim có nhiều comment")
        if re.search(
            r"(bình luận|comment|cmt|thảo luận|review).*?(nhiều|đông|cao|lắm|top|nhất)|(nhiều|đông|cao|lắm|top|ai|ai đó).*?(bình luận|comment|cmt|thảo luận|review)",
            q_lower,
        ):
            return ChatIntent.SYSTEM_STATS, StatType.MOST_COMMENTED

        # Phim đánh giá / rating cao nhất
        if re.search(
            r"(đánh giá|rating|điểm|vote).*?(cao|tốt|hay|top|nhất|chót vót)|(cao|tốt|hay|top).*?(đánh giá|rating|điểm|vote)|hay nhất (hệ thống|trên web)",
            q_lower,
        ):
            return ChatIntent.SYSTEM_STATS, StatType.TOP_RATED

        # Phim nhiều lượt xem / view / hot nhất
        if re.search(
            r"(lượt xem|người xem|view|xem).*?(nhiều|cao|top|nhất|hot)|(nhiều|cao|top|hot).*?(lượt xem|người xem|view|xem)|hot nhất\b",
            q_lower,
        ):
            return ChatIntent.SYSTEM_STATS, StatType.MOST_VIEWED

        # Phim nhiều lượt thích / like nhất
        if re.search(
            r"(lượt thích|người thích|like|thích|tim).*?(nhiều|cao|top|nhất)|(nhiều|cao|top).*?(lượt thích|người thích|like|thích|tim)",
            q_lower,
        ):
            return ChatIntent.SYSTEM_STATS, StatType.MOST_LIKED

        # Thống kê tổng số phim trong hệ thống
        if re.search(
            r"(bao nhiêu|tổng số|số lượng).*?(phim|film|movie)|(kho|hệ thống).*?(có bao nhiêu|bao nhiêu)",
            q_lower,
        ):
            return ChatIntent.SYSTEM_STATS, StatType.MOVIE_COUNT

        # Thống kê hệ thống chung
        if re.search(
            r"\b(thống kê hệ thống|thống kê phim|báo cáo hệ thống|số liệu hệ thống)\b",
            q_lower,
        ):
            return ChatIntent.SYSTEM_STATS, StatType.GENERAL

        # Nếu câu hỏi có từ "hệ thống" / "trên web" kèm từ so sánh nhất -> ưu tiên SYSTEM_STATS
        if re.search(r"\b(hệ thống|trên web|trang web)\b", q_lower) and re.search(
            r"\b(nhất|top|nhiều|cao|lớn|tổng)\b", q_lower
        ):
            return ChatIntent.SYSTEM_STATS, StatType.GENERAL

        # ----------------------------------------------------
        # 2. Nhánh CHITCHAT: Chào hỏi, cảm ơn, hỏi danh tính bot
        # ----------------------------------------------------
        if not has_movie_context:
            # Chào hỏi
            if re.search(
                r"^(xin chào|chào|chào bạn|hello|hi|hey|alo|good morning|good evening|hi bạn|chào ad)\b",
                q_lower,
            ):
                return ChatIntent.CHITCHAT, None

            # Hỏi danh tính / chức năng
            if re.search(
                r"\b(bạn là ai|bạn tên gì|bạn có thể làm gì|bạn làm được gì|hướng dẫn tôi|giúp tôi với|chức năng của bạn|who are you|what can you do)\b",
                q_lower,
            ):
                return ChatIntent.CHITCHAT, None

            # Cảm ơn
            if re.search(
                r"^(cảm ơn|cám ơn|thank|thanks|tks|cam on|ok cảm ơn|cảm ơn bạn)\b",
                q_lower,
            ):
                return ChatIntent.CHITCHAT, None

            # Tạm biệt
            if re.search(
                r"^(tạm biệt|bye|bye bye|tam biet|gặp lại sau|see you)\b",
                q_lower,
            ):
                return ChatIntent.CHITCHAT, None

        # ----------------------------------------------------
        # 3. Nhánh OUT_OF_SCOPE: Không liên quan điện ảnh
        # ----------------------------------------------------
        if not has_movie_context:
            # Câu hỏi kiến thức bách khoa, giải thích hiện tượng tự nhiên/đời sống
            if re.search(
                r"^(tại sao|vì sao|nguyên nhân|thế nào là|lý do tại sao|giải thích vì sao)\b",
                q_lower,
            ):
                return ChatIntent.OUT_OF_SCOPE, None

            # Lập trình / Công nghệ ngoài phim
            if re.search(
                r"\b(viết code|giải thuật|lập trình|python|javascript|typescript|c\+\+|java|html|css|sql query|hàm vlookup|viết hàm)\b",
                q_lower,
            ):
                return ChatIntent.OUT_OF_SCOPE, None

            # Toán học / Khoa học ngoài phim
            if re.search(
                r"\b(giải phương trình|tính đạo hàm|tích phân|bài toán|1\s*\+\s*1|căn bậc hai)\b",
                q_lower,
            ):
                return ChatIntent.OUT_OF_SCOPE, None

            # Tài chính / Tiền tệ / Đời sống không liên quan
            if re.search(
                r"\b(giá bitcoin|giá btc|chứng khoán|đầu tư coin|giá vàng hôm nay|thời tiết hôm nay|dự báo thời tiết|công thức nấu|cách nấu|uống thuốc)\b",
                q_lower,
            ):
                return ChatIntent.OUT_OF_SCOPE, None

        # ----------------------------------------------------
        # 4. Nhánh MOVIE_SEARCH_RAG: Nhận diện chỉ khi có từ khóa tìm kiếm rõ ràng
        # ----------------------------------------------------
        if re.search(
            r"\b(gợi ý|tìm giúp|kiếm phim|muốn xem|recom|recommend|cần tìm|phim giống|tương tự phim)\b",
            q_lower,
        ):
            return ChatIntent.MOVIE_SEARCH_RAG, None

        # Nếu câu hỏi có ngữ cảnh điện ảnh rõ ràng (có từ 'phim', 'movie', 'chiếu rạp',...) và không thuộc các nhánh trên -> MOVIE_SEARCH_RAG tức thì (<1ms)
        if has_movie_context:
            return ChatIntent.MOVIE_SEARCH_RAG, None

        # Trả về None để nhường quyền cho LLM phân loại ngữ nghĩa sâu nếu câu hỏi đổi cách diễn đạt
        return None, None

    def _llm_classify(self, query: str) -> tuple[ChatIntent, StatType | None]:
        """Gọi Gemini LLM (Intent Gatekeeper) để hiểu ngữ nghĩa và phân loại chính xác."""
        prompt = (
            "Bạn là bộ phân loại ý định (Intent Gatekeeper) cho trợ lý điện ảnh Moviere AI.\n"
            "Nhiệm vụ: Phân loại câu hỏi của người dùng vào đúng 1 trong các nhóm dưới đây:\n\n"
            "1. OUT_OF_SCOPE: Câu hỏi kiến thức khoa học, đời sống, tự nhiên, thời tiết, lập trình, xã hội KHÔNG liên quan đến phim ảnh (ví dụ: 'tại sao mặt trăng màu hồng', 'thời tiết hôm nay', 'thủ đô nước Pháp').\n"
            "2. CHITCHAT: Chào hỏi, cảm ơn, tạm biệt, hỏi tên hay chức năng của bot.\n"
            "3. SYSTEM_STATS:<statType>: Hỏi về số liệu thống kê, xếp hạng, bình luận, đánh giá trong hệ thống/trang web:\n"
            "   - SYSTEM_STATS:most_commented (nhiều bình luận, comment, thảo luận, người bàn tán nhất)\n"
            "   - SYSTEM_STATS:top_rated (điểm cao nhất, rating cao nhất, đánh giá cao nhất)\n"
            "   - SYSTEM_STATS:most_viewed (nhiều lượt xem, view cao, hot nhất hệ thống)\n"
            "   - SYSTEM_STATS:most_liked (nhiều like, thích nhất hệ thống)\n"
            "   - SYSTEM_STATS:movie_count (hệ thống có bao nhiêu phim, tổng số phim)\n"
            "   - SYSTEM_STATS:general (thống kê chung về hệ thống)\n"
            "4. MOVIE_SEARCH_RAG: Tìm kiếm, gợi ý phim theo nội dung, cốt truyện, thể loại, diễn viên, đạo diễn.\n\n"
            f'Câu hỏi của người dùng: "{query}"\n\n'
            "Chỉ trả về đúng 1 chuỗi kết quả (ví dụ: OUT_OF_SCOPE hoặc SYSTEM_STATS:most_commented hoặc MOVIE_SEARCH_RAG hoặc CHITCHAT):"
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
                "generationConfig": {"temperature": 0.0, "maxOutputTokens": 32},
            }
            try:
                resp = requests.post(url, json=payload, timeout=6)
                if resp.status_code == 200:
                    raw_text = (
                        resp.json()
                        .get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                        .strip()
                    )
                    if "OUT_OF_SCOPE" in raw_text:
                        return ChatIntent.OUT_OF_SCOPE, None

                    if "SYSTEM_STATS" in raw_text:
                        stat_type = StatType.GENERAL
                        for st in StatType:
                            if st.value in raw_text.lower():
                                stat_type = st
                                break
                        return ChatIntent.SYSTEM_STATS, stat_type

                    if "CHITCHAT" in raw_text:
                        return ChatIntent.CHITCHAT, None

                    if "MOVIE_SEARCH_RAG" in raw_text:
                        return ChatIntent.MOVIE_SEARCH_RAG, None
                logger.warning(
                    "Gatekeeper model %s tra status %s", model_name, resp.status_code
                )
            except Exception as exc:
                logger.warning("Gatekeeper model %s loi: %s", model_name, exc)

        # Fallback an toàn nếu LLM timeout: kiểm tra nếu là câu hỏi kiến thức tự nhiên
        if re.search(r"^(tại sao|vì sao|nguyên nhân|thế nào là)\b", query.lower()):
            return ChatIntent.OUT_OF_SCOPE, None

        return ChatIntent.MOVIE_SEARCH_RAG, None

    def _generate_chitchat_answer(self, query: str) -> str:
        """Tạo câu trả lời thân thiện cho nhánh CHITCHAT."""
        q_lower = query.lower()
        if re.search(r"\b(cảm ơn|cám ơn|thank|thanks|tks)\b", q_lower):
            return (
                "Rất vui được hỗ trợ bạn! Chúc bạn tìm được bộ phim ưng ý "
                "và có những giây phút xem phim thật tuyệt vời. Nếu cần thêm gợi ý nào, cứ hỏi tôi nhé!"
            )
        if re.search(r"\b(tạm biệt|bye|gặp lại sau)\b", q_lower):
            return "Tạm biệt bạn! Hẹn gặp lại bạn trên Moviere. Chúc bạn một ngày tốt lành!"

        if re.search(r"\b(bạn là ai|bạn tên gì|bạn làm được gì|chức năng)\b", q_lower):
            return (
                "Tôi là **Moviere AI** – trợ lý điện ảnh thông minh của hệ thống Moviere.\n\n"
                "Tôi có thể giúp bạn:\n"
                "- 🎬 **Tìm & gợi ý phim**: theo thể loại, cốt truyện, diễn viên hay cảm xúc bạn muốn xem.\n"
                "- 📊 **Thống kê hệ thống**: xem phim nào có nhiều bình luận nhất, điểm đánh giá cao nhất hoặc hot nhất.\n\n"
                "Bạn muốn khám phá bộ phim nào hôm nay?"
            )

        return (
            "Xin chào! Tôi là **Moviere AI** – trợ lý phim ảnh thông minh.\n\n"
            'Bạn có thể yêu cầu tôi tìm phim (ví dụ: *"gợi ý phim hành động gay cấn"*, '
            '*"tìm phim giống Người Nhện"*) hoặc hỏi thống kê (ví dụ: *"phim nào nhiều bình luận nhất"*).\n\n'
            "Hôm nay bạn muốn xem phim gì nào?"
        )

    def _generate_out_of_scope_answer(self, _query: str) -> str:
        """Tạo câu trả lời từ chối lịch sự cho nhánh OUT_OF_SCOPE."""
        return (
            "Tôi là **Moviere AI**, trợ lý chuyên sâu về phim ảnh và điện ảnh của hệ thống Moviere.\n\n"
            "Hiện tại tôi chỉ có thể hỗ trợ các thông tin, gợi ý và thống kê liên quan đến phim ảnh, "
            "chưa thể giải đáp các chủ đề ngoài lĩnh vực điện ảnh như câu hỏi này.\n\n"
            "Bạn hãy thử hỏi tôi về các bộ phim yêu thích, thể loại muốn xem hoặc các phim hot nhất hệ thống nhé!"
        )

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
            title = (
                movie.get("titleVi") or movie.get("title") or f"Phim #{movie.get('id')}"
            )
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

    def _generate_answer(self, user_message: str, movies: list[dict[str, Any]]) -> str:
        """Gọi Gemini LLM với ngữ cảnh phim; tự động fallback nếu không có API key hoặc lỗi mạng."""
        if not self._gemini_api_key:
            return self._build_fallback_answer(user_message, movies)

        context_text = self._build_context_text(movies)
        prompt = (
            "Bạn là trợ lý tư vấn phim thông minh của hệ thống gợi ý phim Moviere.\n"
            "Hãy trả lời câu hỏi của người dùng bằng tiếng Việt tự nhiên, súc tích, thân thiện "
            "dựa trên danh sách phim trong phần NGỮ CẢNH dưới đây.\n"
            "Nếu có phim phù hợp, hãy giới thiệu các bộ phim tiêu biểu (tối đa 3-4 phim) kèm thể loại và lý do ngắn gọn vì sao phim phù hợp. "
            "Mở đầu bằng lời văn tự nhiên (ví dụ: 'Dưới đây là các bộ phim phù hợp với yêu cầu của bạn:'), "
            "tránh tự ý chốt số lượng cứng nhắc như 'gợi ý 2 bộ phim' để luôn đồng bộ với danh sách thẻ phim hiển thị bên dưới.\n\n"
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
                        parts = candidates[0].get("content", {}).get("parts") or []
                        text = "".join(str(p.get("text", "")) for p in parts).strip()
                        if text:
                            return text
                logger.warning(
                    "Gemini model %s tra status %s", model_name, resp.status_code
                )
            except Exception as exc:
                logger.warning("Loi khi goi Gemini model %s: %s", model_name, exc)

        return self._build_fallback_answer(user_message, movies)

    async def _stream_gemini_answer(
        self, user_message: str, movies: list[dict[str, Any]]
    ) -> AsyncGenerator[str, None]:
        """Gọi Gemini LLM stream endpoint (?alt=sse) để nhận token theo thời gian thực."""
        if not self._gemini_api_key:
            return

        context_text = self._build_context_text(movies)
        prompt = (
            "Bạn là trợ lý tư vấn phim thông minh của hệ thống gợi ý phim Moviere.\n"
            "Hãy trả lời câu hỏi của người dùng bằng tiếng Việt tự nhiên, súc tích, thân thiện "
            "dựa trên danh sách phim trong phần NGỮ CẢNH dưới đây.\n"
            "Nếu có phim phù hợp, hãy giới thiệu các bộ phim tiêu biểu (tối đa 3-4 phim) kèm thể loại và lý do ngắn gọn vì sao phim phù hợp. "
            "Mở đầu bằng lời văn tự nhiên (ví dụ: 'Dưới đây là các bộ phim phù hợp với yêu cầu của bạn:'), "
            "tránh tự ý chốt số lượng cứng nhắc như 'gợi ý 2 bộ phim' để luôn đồng bộ với danh sách thẻ phim hiển thị bên dưới.\n\n"
            f"--- NGỮ CẢNH PHIM TỪ HỆ THỐNG ---\n{context_text}\n\n"
            f"--- CÂU HỎI CỦA NGƯỜI DÙNG ---\n{user_message}\n\n"
            "--- CÂU TRẢ LỜI ---"
        )

        candidate_models: list[str] = []
        for m in (self._gemini_model, *DEFAULT_GEMINI_MODELS):
            if m and m not in candidate_models:
                candidate_models.append(m)

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.4,
                "maxOutputTokens": 512,
            },
        }

        for model_name in candidate_models:
            url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/"
                f"{model_name}:streamGenerateContent?alt=sse&key={self._gemini_api_key}"
            )
            try:
                async with httpx.AsyncClient(timeout=25.0) as client:
                    async with client.stream("POST", url, json=payload) as resp:
                        if resp.status_code != 200:
                            logger.warning(
                                "Gemini streaming model %s tra status %s",
                                model_name,
                                resp.status_code,
                            )
                            continue

                        async for line in resp.aiter_lines():
                            line = line.strip()
                            if not line.startswith("data:"):
                                continue
                            raw_data = line[len("data:") :].strip()
                            if not raw_data:
                                continue
                            try:
                                chunk = json.loads(raw_data)
                                candidates = chunk.get("candidates") or []
                                if not candidates:
                                    continue
                                parts = (
                                    candidates[0].get("content", {}).get("parts") or []
                                )
                                for part in parts:
                                    txt = part.get("text", "")
                                    if txt:
                                        yield txt
                            except Exception:
                                continue
                        return
            except Exception as exc:
                logger.warning("Loi stream tu Gemini model %s: %s", model_name, exc)

    @staticmethod
    async def _stream_text_chunks(text: str) -> AsyncGenerator[str, None]:
        """Tách chuỗi thành các chunk ngắn và yield bất đồng bộ."""
        words = text.split(" ")
        for i, word in enumerate(words):
            chunk = word if i == len(words) - 1 else word + " "
            yield chunk
            await asyncio.sleep(0.015)

    @staticmethod
    def _build_fallback_answer(user_message: str, movies: list[dict[str, Any]]) -> str:
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
                movie.get("titleVi") or movie.get("title") or f"Phim #{movie.get('id')}"
            )
            genres = movie.get("genres") or ", ".join(movie.get("genreNames") or [])
            overview = movie.get("overviewVi") or movie.get("overview")
            item_line = f"- **{idx}. {title}**"
            if genres:
                item_line += f" (*{genres}*)"
            if overview:
                short_overview = (
                    overview[:140].rstrip() + "..." if len(overview) > 140 else overview
                )
                item_line += f": {short_overview}"
            lines.append(item_line)

        lines.append("\nBạn có thể nhấn vào từng phim bên dưới để xem chi tiết nhé!")
        return "\n".join(lines)
