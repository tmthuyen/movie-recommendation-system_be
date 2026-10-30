import asyncio
import logging

from sentence_transformers import SentenceTransformer

from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def format_query_text_for_model(query: str, model_name: str) -> str:
    """Định dạng chuỗi truy vấn theo chuẩn của từng mô hình (e.g. e5 yêu cầu 'query: ')."""
    if "e5" in model_name.lower():
        if not query.startswith("query: "):
            return f"query: {query}"
    return query


def format_document_text_for_model(document: str, model_name: str) -> str:
    """Định dạng chuỗi văn bản tài liệu theo chuẩn của từng mô hình (e.g. e5 yêu cầu 'passage: ')."""
    if "e5" in model_name.lower():
        if not document.startswith("passage: "):
            return f"passage: {document}"
    return document


class EmbeddingService:
    """Service encoding text queries and documents into dense vectors using SentenceTransformer."""

    def __init__(self, model_name: str = settings.embedding_model_name) -> None:
        self.model_name = model_name
        self._model: SentenceTransformer | None = None

    def _get_model(self) -> SentenceTransformer:
        if self._model is None:
            logger.info(
                "Loading SentenceTransformer embedding model '%s'...", self.model_name
            )
            self._model = SentenceTransformer(self.model_name)
            logger.info("SentenceTransformer model loaded successfully.")
        return self._model

    @property
    def dimension(self) -> int:
        model = self._get_model()
        dim = model.get_sentence_embedding_dimension()
        return int(dim) if dim is not None else 384

    def format_text(self, text: str, is_query: bool = True) -> str:
        if is_query:
            return format_query_text_for_model(text, self.model_name)
        return format_document_text_for_model(text, self.model_name)

    def encode(self, text: str, is_query: bool = True) -> list[float]:
        formatted_text = self.format_text(text, is_query=is_query)
        model = self._get_model()
        vector = model.encode(formatted_text, normalize_embeddings=True)
        return vector.tolist()

    async def encode_async(self, text: str, is_query: bool = True) -> list[float]:
        return await asyncio.to_thread(self.encode, text, is_query)

    def encode_query(self, text: str) -> list[float]:
        return self.encode(text, is_query=True)

    async def encode_query_async(self, text: str) -> list[float]:
        return await self.encode_async(text, is_query=True)

    def encode_document(self, text: str) -> list[float]:
        return self.encode(text, is_query=False)

    async def encode_document_async(self, text: str) -> list[float]:
        return await self.encode_async(text, is_query=False)


embedding_service = EmbeddingService()
