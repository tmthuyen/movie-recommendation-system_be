from datetime import datetime
from api.schemas import UserInteractionEvent
from api.schemas import MovieEvent
from utils import setup_logger
import json
from typing import Any
import aio_pika
from redis.asyncio import Redis

from .config import Settings
# ─────────────────────────────────────────────────────────────────────────────
# Message Queue
# ─────────────────────────────────────────────────────────────────────────────


class DomainEvent: 
    event_type: str
    event_id: str
    occurred_at: datetime
    correlation_id: str
    payload: dict[str, Any]

class MovieCreated:
    movie_id: int
    title: str
    title_vi: str
    overview: str
    overview_vi: str 
    genres: list[str]
class MovieUpdated(MovieCreated):
    pass
class MovieDeleted:
    movie_id: int


class MessageQueue:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.connection = None
        self.channel = None
        self.consumer_tag = None
        self.logger = setup_logger(name='FastAPI-Recommendations', filename=__name__)

    async def start(self) -> None:
        if not self.settings.rabbitmq_enabled:
            return
        self.connection = await aio_pika.connect_robust(
            self.settings.rabbitmq_url
        )
        self.channel = await self.connection.channel()
        exchange = await self.channel.declare_exchange(
            self.settings.rabbitmq_exchange,
            type=self.settings.rabbitmq_exchange_type,
            durable=True,
        )

        # queue
        queue = await self.channel.declare_queue(
            self.settings.rabbitmq_queue, 
            durable=True
        )

        # bind queue to exchange
        await queue.bind(
            exchange, 
            self.settings.movie_event_routing_key
        )
        await queue.bind(
            exchange, 
            self.settings.interaction_event_routing_key
        )
        self.consumer_tag = await queue.consume(self._handle_message)
        self.logger.info("Message queue started")

    async def _handle_message(self, message: Any) -> None:
        async with message.process():
            payload = json.loads(message.body.decode("utf-8"))
            self.logger.info("Received event type=%s id=%s", payload.get("eventType"), payload.get("eventId"))
            # TODO: dispatch movie updates and interactions to model/vector services.

    async def publish_movie_event(self, event: MovieEvent) -> None:
        await self._publish(event.eventType, event.model_dump())

    async def publish_interaction_event(self, event: UserInteractionEvent) -> None:
        await self._publish(event.eventType, event.model_dump())

    async def _publish(self, routing_key: str, payload: dict[str, Any]) -> None:
        if self.channel is None:
            self.logger.info("Message queue disabled; accepted event %s", payload.get("eventId"))
            return
        exchange = await self.channel.get_exchange(self.settings.rabbitmq_exchange)
        await exchange.publish(
            aio_pika.Message(body=json.dumps(payload).encode("utf-8")),
            routing_key=routing_key,
        )

    async def close(self) -> None:
        if self.connection:
            await self.connection.close()
            self.logger.info("Message queue closed")

