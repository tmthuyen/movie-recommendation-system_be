import json
from typing import Any, TYPE_CHECKING
import aio_pika
from aio_pika import ExchangeType, IncomingMessage

from core.config import Settings
from utils.logger import setup_logger

from services.interaction_event_handler import InteractionEventHandler

# ─────────────────────────────────────────────────────────────────────────────
# InteractionQueue — RabbitMQ consumer for user interactions
# ─────────────────────────────────────────────────────────────────────────────

class InteractionQueue:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._connection = None
        self._channel = None
        self._consumer_tag = None
        self._handler: InteractionEventHandler | None = None
        self._logger = setup_logger(name='FastAPI-Interactions', filename=__name__)

    def set_handler(self, handler: InteractionEventHandler) -> None:
        """Inject InteractionEventHandler."""
        self._handler = handler

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if not self._settings.rabbitmq_enabled:
            self._logger.info("RabbitMQ disabled, skipping InteractionQueue.")
            return

        self._connection = await aio_pika.connect_robust(self._settings.rabbitmq_url)
        self._channel = await self._connection.channel()

        # Prefetch 10 messages
        await self._channel.set_qos(prefetch_count=10)

        # ── 1. Khai bao Exchange ─────────────────────────────────────
        interaction_exchange = await self._channel.declare_exchange(
            self._settings.rabbitmq_interaction_exchange,
            type=ExchangeType.TOPIC,
            durable=True,
        )

        # ── 2. Khai bao DLX ────────────────────────
        dlx = await self._channel.declare_exchange(
            self._settings.rabbitmq_interaction_dlx,
            type=ExchangeType.TOPIC,
            durable=True,
        )

        # ── 3. Khai bao DLQ ──────────
        dlq = await self._channel.declare_queue(
            self._settings.rabbitmq_interaction_dlq,
            durable=True,
        )
        await dlq.bind(
            exchange=dlx, 
            routing_key=self._settings.rabbitmq_interaction_dlq_routing_key
        )

        # ── 4. Khai bao Queue voi DLX config ───────────────
        interaction_queue = await self._channel.declare_queue(
            self._settings.rabbitmq_interaction_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": self._settings.rabbitmq_interaction_dlx,
                "x-dead-letter-routing-key": self._settings.rabbitmq_interaction_dlq_routing_key
            },
        )

        # ── 5. Bind vao Exchange ───────────────
        await interaction_queue.bind(
            exchange=interaction_exchange,
            routing_key=self._settings.rabbitmq_interaction_routing_key,
        )

        # ── 6. Bat dau consume ────────────────────────────────────────────
        self._consumer_tag = await interaction_queue.consume(
            self._handle_message,
            no_ack=False,
        )

        self._logger.info(
            f'Started Interaction Queue: {self._settings.rabbitmq_interaction_queue}'
            f'\nDLX: {self._settings.rabbitmq_interaction_dlx}'
            f'\nDLQ: {self._settings.rabbitmq_interaction_dlq}'
        )

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()
            self._logger.info("InteractionQueue closed.")

    # ── Consumer ──────────────────────────────────────────────────────────────

    async def _handle_message(self, message: IncomingMessage) -> None:
        """Xu ly message tu RabbitMQ."""
        event_type = "(unknown)"
        try:
            routing_key = message.routing_key
            body = json.loads(message.body.decode("utf-8"))

            self._logger.info(
                f'Received [Interaction]: message \n'
                f'Routing Key: {routing_key} \n'
                f'Event: body'
            )

            if routing_key is None:
                self._logger.warning("Routing key is None!")
                await message.nack(requeue=False)
                return

            event_type = body.get("eventType", "")
            payload: dict[str, Any] = body.get("payload") or {}

            if self._handler is None:
                self._logger.error("InteractionEventHandler not injected! Ack to prevent loop.")
                await message.ack()
                return

            await self._handler.handle(event_type, payload)
            await message.ack()

        except (ValueError, TypeError, KeyError) as exc:
            self._logger.error(
                "[Interaction Queue] Invalid payload event_type=%s, sending to DLQ: %s", event_type, exc
            )
            await message.nack(requeue=False)
        except Exception as exc:
            self._logger.error(
                f"[Interaction Queue] Error handling message: {exc}"
            )
            await message.nack(requeue=False)
