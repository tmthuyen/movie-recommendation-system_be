from api.schemas import UserInteractionEvent
from api.schemas import MovieEvent
from utils import setup_logger
from typing import Any
from redis.asyncio import Redis

from .config import Settings
# ─────────────────────────────────────────────────────────────────────────────
# Redis Store (cache)
# ─────────────────────────────────────────────────────────────────────────────

class RedisStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: Redis | None = None
        self.logger = setup_logger(name='FastAPI-Recommendations', filename=__name__)

    async def start(self) -> None:
        if self.settings.redis_enabled:
            self.client = Redis.from_url(self.settings.redis_url, decode_responses=True)
            self.logger.info("Redis store started")

    async def close(self) -> None:
        if self.client:
            await self.client.aclose()
            self.logger.info("Redis store closed")
