from __future__ import annotations
from aio_pika import IncomingMessage

import json
from typing import Any, TYPE_CHECKING

import aio_pika
from aio_pika import ExchangeType

from core.config import Settings
from utils.logger import setup_logger

if TYPE_CHECKING:
    from services.movie_event_handler import MovieEventHandler


# ─────────────────────────────────────────────────────────────────────────────
# MessageQueue — RabbitMQ consumer cho AI Service
#
# Kien truc:
#   movie.exchange (TOPIC)
#       -> recommendation.queue  (routing key: movie.#)
#           DLX -> recommendation.queue.dlx
#           DLQ -> recommendation.queue.dlq  (message het retry)
# ─────────────────────────────────────────────────────────────────────────────

class MessageQueue:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._connection = None
        self._channel = None
        self._consumer_tag = None
        self._handler: MovieEventHandler | None = None
        self._logger = setup_logger(name='FastAPI-Recommendations', filename=__name__)

    def set_handler(self, handler: MovieEventHandler) -> None:
        """Inject MovieEventHandler sau khi khoi tao app (tranh circular import)."""
        self._handler = handler

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if not self._settings.rabbitmq_enabled:
            self._logger.info("RabbitMQ bi tat (RABBITMQ_ENABLED=false), bo qua.")
            return

        self._connection = await aio_pika.connect_robust(self._settings.rabbitmq_url)
        self._channel = await self._connection.channel()

        # Cho phep toi da 10 message chua xu ly cung luc (tranh qua tai)
        await self._channel.set_qos(prefetch_count=10)

        # ── 1. Khai bao movie.exchange ─────────────────────────────────────
        movie_exchange = await self._channel.declare_exchange(
            self._settings.rabbitmq_movie_exchange,
            type=ExchangeType.TOPIC,
            durable=True,
        )
        # exchange retry 10s
        movie_exchange_retry_10s = await self._channel.declare_exchange(
            f'{self._settings.rabbitmq_movie_exchange}.retry.10s',
            type=ExchangeType.DIRECT,
            durable=True,
        )

        # ── 2. Khai bao DLX (Dead Letter Exchange) ────────────────────────
        dlx = await self._channel.declare_exchange(
            self._settings.rabbitmq_recommendation_dlx,
            type=ExchangeType.TOPIC,
            durable=True,
        )

        # ── 3. Khai bao DLQ (Dead Letter Queue) va bind vao DLX ──────────
        dlq = await self._channel.declare_queue(
            self._settings.rabbitmq_recommendation_dlq,
            durable=True,
        )
        
        await dlq.bind(
            exchange=dlx, 
            routing_key=self._settings.rabbitmq_recommendation_dlq_routing_key
        )

        # ── 4. Khai bao recommendation.queue voi DLX config ───────────────
        recommend_queue = await self._channel.declare_queue(
            self._settings.rabbitmq_recommendation_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": f'{self._settings.rabbitmq_movie_exchange}.retry.10s',
                "x-dead-letter-routing-key": f'{self._settings.rabbitmq_recommendation_queue}.retry.10s.rk'
            },
        )
        
        recommend_queue_retry_10s = await self._channel.declare_queue(
            f'{self._settings.rabbitmq_recommendation_queue}.retry.10s',
            durable=True,
            arguments={
                "x-message-ttl": 10_000,
                "x-dead-letter-exchange": self._settings.rabbitmq_recommendation_dlx,
                "x-dead-letter-routing-key": self._settings.rabbitmq_recommendation_dlq_routing_key
            },
        )

        # ── 5. Bind recommendation.queue vao movie.exchange ───────────────
        await recommend_queue.bind(
            exchange=movie_exchange,
            routing_key=self._settings.rabbitmq_movie_routing_key,  # "movie.#"
        )

        await recommend_queue_retry_10s.bind(
            exchange=movie_exchange_retry_10s,
            routing_key=f'{self._settings.rabbitmq_recommendation_queue}.retry.10s.rk',
        )

        # ── 6. Bat dau consume ────────────────────────────────────────────
        self._consumer_tag = await recommend_queue.consume(
            self._handle_message,
            no_ack=False,  # Manual ack bat buoc
        )
        self._consumer_tag_retry_10s = await recommend_queue_retry_10s.consume(
            self._handle_message,
            no_ack=False,  # Manual ack bat buoc
        )

        self._logger.info(
            f'Started Queues: {self._settings.rabbitmq_recommendation_queue}'
            f'\nRetry Queues: {self._settings.rabbitmq_recommendation_queue}.retry.10s'
            f'\nDLX: {self._settings.rabbitmq_recommendation_dlx}'
            f'\nDLQ: {self._settings.rabbitmq_recommendation_dlq}'
        )

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()
            self._logger.info("MessageQueue closed.")

    # ── Consumer ──────────────────────────────────────────────────────────────

    async def _handle_message(self, message: IncomingMessage) -> None:
        """
        Xu ly message tu RabbitMQ.

        Flow:
            1. Parse JSON body -> lay event_type va payload
            2. Goi MovieEventHandler.handle(event_type, payload)
            3. Neu OK -> ack()
            4. Neu loi du lieu (ValueError/ValidationError) -> nack requeue=False -> vao DLQ
            5. Neu loi tam thoi (timeout, DB down...) -> nack requeue=True -> retry
               Qua rabbitmq_max_retry -> nack requeue=False -> vao DLQ
        """

        event_type = "(unknown)"
        try:
        
            routing_key = message.routing_key
            body = json.loads(message.body.decode("utf-8"))

            self._logger.info(
                f'Received [Message]: message \n'
                f'with [Routing Key]: {routing_key} \n'
                f'and [Event]: body'
            )
            
            # log routing key
            if routing_key is None:
                self._logger.warning("Routing key is None!!!!")
                return


            event_type = body.get("eventType", "")
            movie_payload: dict[str, Any] = body.get("payload") or {}
            

            if self._handler is None:
                self._logger.error("MovieEventHandler chua duoc inject! Ack message de tranh loop.")
                await message.ack()
                return

            await self._handler.handle(event_type, movie_payload)
            await message.ack()

        except (ValueError, TypeError, KeyError) as exc:
            # Loi du lieu / schema sai -> khong co ich khi retry -> vao DLQ ngay
            self._logger.error(
                "[Recommendations Queue] Invalid payload event_type=%s, sending to DLQ: %s", event_type, exc
            )
            await message.nack(requeue=False)

        except Exception as exc:
            self._logger.error(
                f"[Recommendations Queue] Error when handling message queue: {exc}"
            )
            await message.nack(requeue=False)

