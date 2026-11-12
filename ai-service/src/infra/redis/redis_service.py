import asyncio
import json
from collections.abc import Awaitable, Callable
from typing import Any

from redis.asyncio import Redis

from core.config import Settings
from utils import setup_logger


class RedisStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.client: Redis | None = None
        self.logger = setup_logger(name="FastAPI-Recommendations")

    async def start(self) -> None:
        if self.settings.redis_enabled:
            self.client = Redis.from_url(
                self.settings.redis_url,
                decode_responses=True,
            )
            self.logger.info("Redis store started")

    async def close(self) -> None:
        if self.client:
            await self.client.aclose()
            self.logger.info("Redis store closed")

    async def publish(
        self,
        channel: str,
        payload: dict[str, Any],
    ) -> int:
        if not self.client:
            raise RuntimeError("Redis is not started")

        res = await self.client.publish(
            channel,
            json.dumps(payload),
        )

        self.logger.info(f"Published Redis event channel={channel} payload={payload}")

        return res

    async def subscribe(
        self,
        channel: str,
        handler: Callable[[dict[str, Any]], Awaitable[None]],
    ) -> None:
        if not self.client:
            raise RuntimeError("Redis is not started")

        pubsub = self.client.pubsub()

        await pubsub.subscribe(channel)

        self.logger.info(f"Subscribed Redis channel: {channel}")

        try:
            async for message in pubsub.listen():
                if message["type"] != "message":
                    continue

                self.logger.info(
                    f"Received Redis event channel={channel} payload={message['data']}"
                )

                try:
                    payload = json.loads(message["data"])

                    await handler(payload)
                    self.logger.info(
                        f"Handled Redis event channel={channel} payload={payload}"
                    )

                except Exception as exc:
                    self.logger.exception(
                        f"Failed handling Redis event " f"channel={channel}: {exc}"
                    )

        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
