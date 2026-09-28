from aio_pika import ExchangeType
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

class MessageQueueMetadata:
    movie_exchange = 'movie.exchange'
    movie_event_routing_key = 'movie.#'
    movie_event_create_routing_key = 'movie.created'
    movie_event_update_routing_key = 'movie.updated'
    movie_event_delete_routing_key = 'movie.deleted'

    recommendation_queue = 'recommendation.queue'
    
    


class MessageQueue:
    def __init__(self) -> None:
        self.settings = MessageQueueMetadata()
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

        # Exchange
        movie_exchange = await self.channel.declare_exchange(
            self.settings.movie_exchange,
            type=ExchangeType.TOPIC,
            durable=True,
        )

        # queue
        recommend_queue = await self.channel.declare_queue(
            self.settings.recommendation_queue, 
            durable=True,
            arguments={
                'x-dead-letter-exchange': self.settings.recommendation_queue + '.dlx',
                'x-dead-letter-routing-key': self.settings.recommendation_queue + '.dlq',
            }
        )


        # bind queue to exchange
        await recommend_queue.bind(
            exchange=movie_exchange, 
            routing_key='movie.#'
        )

        # dlx
        await self.channel.declare_exchange(
            self.settings.recommendation_queue + '.dlx',
            type=ExchangeType.TOPIC,
            durable=True,
        )
        # dlq
        await self.channel.declare_queue(
            self.settings.recommendation_queue + '.dlq',
            durable=True,
        )

        # bind dlq to dlx
        dlq = await self.channel.get_queue(self.settings.recommendation_queue + '.dlq')
        await dlq.bind(
            exchange=self.settings.recommendation_queue + '.dlx',
            routing_key='movie.#'
        )
        
        self.consumer_tag = await recommend_queue.consume(self._handle_message)
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

