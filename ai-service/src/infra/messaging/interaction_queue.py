import json
from typing import TYPE_CHECKING, Any

import aio_pika
from aio_pika import ExchangeType, IncomingMessage

from core.config import Settings
from infra.messaging.consumers.interaction_event_handler import InteractionEventHandler
from infra.messaging.event_schemas import (
    InteractionCreatedEvent,
    InteractionCreatedPayload,
)
from utils.logger import setup_logger

# ─────────────────────────────────────────────────────────────────────────────
# InteractionQueue — RabbitMQ consumer for user interactions
# ─────────────────────────────────────────────────────────────────────────────

logger = setup_logger(name="FastAPI-Recommendations")


class InteractionQueue:
    def __init__(
        self, settings: Settings, event_handler: InteractionEventHandler | None = None
    ) -> None:
        self._settings = settings
        self._connection = None
        self._channel = None
        self._consumer_tag = None
        self._handler = event_handler

    def set_handler(self, handler: InteractionEventHandler) -> None:
        """Inject InteractionEventHandler."""
        self._handler = handler

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if not self._settings.rabbitmq_enabled:
            logger.info("RabbitMQ disabled, skipping InteractionQueue.")
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
            routing_key=self._settings.rabbitmq_interaction_dlq_routing_key,
        )

        # ── 4. Khai bao Queue voi DLX config ───────────────
        interaction_queue = await self._channel.declare_queue(
            self._settings.rabbitmq_interaction_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": self._settings.rabbitmq_interaction_dlx,
                "x-dead-letter-routing-key": self._settings.rabbitmq_interaction_dlq_routing_key,
            },
        )

        # ── 5. Bind vao Exchange ───────────────
        await interaction_queue.bind(
            exchange=interaction_exchange,
            routing_key=self._settings.rabbitmq_interaction_routing_key,
        )
        # Batch training do backend cron publish với routing key riêng
        await interaction_queue.bind(
            exchange=interaction_exchange,
            routing_key="training.batch",
        )

        # ── 6. Bat dau consume ────────────────────────────────────────────
        self._consumer_tag = await interaction_queue.consume(
            self._handle_message,
            no_ack=False,
        )

        logger.info(
            f"Started Interaction Queue: {self._settings.rabbitmq_interaction_queue}"
            f"\nDLX: {self._settings.rabbitmq_interaction_dlx}"
            f"\nDLQ: {self._settings.rabbitmq_interaction_dlq}"
        )

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()
            logger.info("InteractionQueue closed.")

    # ── Consumer ──────────────────────────────────────────────────────────────

    async def _handle_message(self, message: IncomingMessage) -> None:
        """Xu ly message tu RabbitMQ."""
        event_type = "(unknown)"
        try:
            routing_key = message.routing_key
            logger.info(
                f"[InteractionQueue] Nhận message từ RabbitMQ: routing_key={routing_key}, correlation_id={message.correlation_id}"
            )
            body = json.loads(message.body.decode("utf-8"))

            # log nhận sự kiện tương trác

            logger.info(
                f"[InteractionQueue] Nhận sự kiện tương tác: body={json.dumps(body, indent=2)}"
            )

            if routing_key is None:
                logger.error("[InteractionQueue] Routing key is None!")
                await message.nack(requeue=False)
                return

            event_type = body.get("eventType", None)
            if event_type is None:
                logger.error("[InteractionQueue] eventType is None in message body!")
                await message.nack(requeue=False)
                return

            # parse
            if event_type == "interaction.created":
                event_obj = InteractionCreatedEvent.model_validate(body)
                correlation_id = event_obj.correlationId
                payload = event_obj.payload

            if self._handler is None:
                logger.error(
                    "InteractionEventHandler not injected! Ack to prevent loop."
                )
                await message.ack()
                return

            await self._handler.handle(
                event_type=event_type,
                payload=payload.model_dump(),
                event=event_obj,
            )
            await message.ack()

        except (ValueError, TypeError, KeyError) as exc:
            logger.error(
                "[InteractionQueue] Invalid payload event_type=%s, sending to DLQ: %s",
                event_type,
                exc,
            )
            await message.nack(requeue=False)
        except Exception as exc:
            logger.error(f"[InteractionQueue] Error handling message: {exc}")
            await message.nack(requeue=False)
