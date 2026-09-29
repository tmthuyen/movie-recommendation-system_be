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
                # Khi message bi nack(requeue=False), day sang DLX
                "x-dead-letter-exchange": self._settings.rabbitmq_recommendation_dlx,
                "x-dead-letter-routing-key": self._settings.rabbitmq_recommendation_dlq_routing_key
            },
        )

        # ── 5. Bind recommendation.queue vao movie.exchange ───────────────
        await recommend_queue.bind(
            exchange=movie_exchange,
            routing_key=self._settings.rabbitmq_movie_routing_key,  # "movie.#"
        )

        # ── 6. Bat dau consume ────────────────────────────────────────────
        self._consumer_tag = await recommend_queue.consume(
            self._handle_message,
            no_ack=False,  # Manual ack bat buoc
        )

        self._logger.info(
            "MessageQueue started: exchange=%s queue=%s routing_key=%s",
            self._settings.rabbitmq_movie_exchange,
            self._settings.rabbitmq_recommendation_queue,
            self._settings.rabbitmq_movie_routing_key,
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
        # Lay so lan da retry tu header (RabbitMQ gan tu dong qua x-death)
        x_death = message.headers.get("x-death") if message.headers else None
        retry_count = 0
        if x_death and isinstance(x_death, list) and len(x_death) > 0:
            retry_count = int(x_death[0].get("count", 0))
        
        # log routing key
        routing_key = message.routing_key
        if routing_key is None:
            self._logger.warning("Routing key is None!!!!")
            return

        self._logger.info("Movie consumer routing key: %s", routing_key)


        event_type = "(unknown)"
        try:
            body = json.loads(message.body.decode("utf-8"))
            event_type = body.get("eventType", "")
            movie_payload: dict[str, Any] = body.get("payload") or {}

            self._logger.info(
                "Received: event_type=%s routing_key=%s retry=%d",
                event_type, message.routing_key, retry_count,
            )

            if self._handler is None:
                self._logger.error("MovieEventHandler chua duoc inject! Ack message de tranh loop.")
                await message.ack()
                return

            await self._handler.handle(event_type, movie_payload)
            await message.ack()

        except (ValueError, TypeError, KeyError) as exc:
            # Loi du lieu / schema sai -> khong co ich khi retry -> vao DLQ ngay
            self._logger.error(
                "Invalid payload event_type=%s, sending to DLQ: %s", event_type, exc
            )
            await message.nack(requeue=False)

        except Exception as exc:
            # Loi tam thoi -> retry neu chua qua gioi han
            if retry_count < self._settings.rabbitmq_max_retry:
                self._logger.warning(
                    "Error handling event_type=%s (retry %d/%d): %s",
                    event_type, retry_count + 1, self._settings.rabbitmq_max_retry, exc,
                )
                await message.nack(requeue=True)
            else:
                self._logger.error(
                    "Max retry (%d) reached for event_type=%s, sending to DLQ: %s",
                    self._settings.rabbitmq_max_retry, event_type, exc,
                )
                await message.nack(requeue=False)
