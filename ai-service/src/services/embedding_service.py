import asyncio
import logging
from sentence_transformers import SentenceTransformer
from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EmbeddingService:
    """Service encoding text queries into 384-dimensional dense vectors using SentenceTransformer."""

    def __init__(self, model_name: str = settings.embedding_model_name) -> None:
        self.model_name = model_name
        self._model: SentenceTransformer | None = None

    def _get_model(self) -> SentenceTransformer:
        if self._model is None:
            logger.info("Loading SentenceTransformer embedding model '%s'...", self.model_name)
            self._model = SentenceTransformer(self.model_name)
            logger.info("SentenceTransformer model loaded successfully.")
        return self._model

    def encode(self, text: str) -> list[float]:
        model = self._get_model()
        vector = model.encode(text, normalize_embeddings=True)
        return vector.tolist()

    async def encode_async(self, text: str) -> list[float]:
        return await asyncio.to_thread(self.encode, text)


embedding_service = EmbeddingService()
