import json

import aio_pika
from aio_pika import ExchangeType, IncomingMessage

from core.config import Settings, get_settings
from infra.messaging.consumers.interaction_event_handler import InteractionEventHandler
from infra.messaging.event_constant import MessageEventBus
from utils.logger import setup_logger

# ─────────────────────────────────────────────────────────────────────────────
# InteractionQueue — RabbitMQ consumer for user interactions
# ─────────────────────────────────────────────────────────────────────────────

logger = setup_logger(name="FastAPI-Recommendations")
settings = get_settings()


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
            name=MessageEventBus.INTERACTION_EXCHANGE,
            type=ExchangeType.TOPIC,
            durable=True,
        )

        # ── 2. Khai bao DLX ────────────────────────
        dlx = await self._channel.declare_exchange(
            name=MessageEventBus.INTERACTION_DLX,
            type=ExchangeType.TOPIC,
            durable=True,
        )

        # ── 3. Khai bao DLQ ──────────
        dlq = await self._channel.declare_queue(
            name=MessageEventBus.INTERACTION_DLQ,
            durable=True,
        )
        await dlq.bind(
            exchange=dlx,
            routing_key=MessageEventBus.INTERACTION_DLQ_RK,
        )

        # ── 4. Khai bao Queue voi DLX config ───────────────
        interaction_queue = await self._channel.declare_queue(
            self._settings.rabbitmq_interaction_queue,
            durable=True,
            arguments={
                "x-dead-letter-exchange": MessageEventBus.INTERACTION_DLX,
                "x-dead-letter-routing-key": MessageEventBus.INTERACTION_DLQ_RK,
            },
        )

        # bind queue
        # interaction
        await interaction_queue.bind(
            exchange=interaction_exchange,
            routing_key=MessageEventBus.INTERACTION_BINDING_ROUTING_KEY,
        )
        # training: binding key có thể khác hoặc trùng routing key thật sự
        # binding key: training.#, routing key: training.request, training.batch, ...
        await interaction_queue.bind(
            exchange=interaction_exchange,
            routing_key=MessageEventBus.TRAINING_BINDING_ROUTING_KEY,
        )

        # ── 6. Bat dau consume ────────────────────────────────────────────
        self._consumer_tag = await interaction_queue.consume(
            self._handle_message,
            no_ack=False,
        )

        logger.info(
            f"Started Interaction Queue:"
            f"\nQueue: {MessageEventBus.INTERACTION_QUEUE}"
            f"\nDLX: {MessageEventBus.INTERACTION_DLX}"
            f"\nDLQ: {MessageEventBus.INTERACTION_DLQ}"
        )

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()
            logger.info("InteractionQueue closed.")

    # ── Consumer ──────────────────────────────────────────────────────────────

    async def _handle_message(self, message: IncomingMessage) -> None:
        """Xu ly message tu RabbitMQ."""
        event_type = "(unknown)"
        correlation_id = message.correlation_id or "(unknown)"
        routing_key = message.routing_key
        try:
            body = json.loads(message.body.decode("utf-8"))

            correlation_id = message.correlation_id or body.get("correlationId", None)
            event_type = body.get("eventType", None)

            logger.info(
                f"[InteractionQueue] correlation_id={correlation_id} - Nhận message từ RabbitMQ: routing_key={routing_key or '(unknown)'} event_type={event_type}"
            )

            if routing_key is None:
                logger.error("[InteractionQueue] Routing key is None!")
                await message.nack(requeue=False)
                return

            if event_type is None:
                logger.error("[InteractionQueue] eventType is None in message body!")
                await message.nack(requeue=False)
                return

            if self._handler is None:
                logger.error(
                    "InteractionEventHandler not injected! Ack to prevent loop."
                )
                await message.ack()
                return

            await self._handler.handle(
                event=body,
            )
            await message.ack()

        except (ValueError, TypeError, KeyError) as exc:
            logger.error(
                "[InteractionQueue] correlation_id=%s - Invalid payload event_type=%s, sending to DLQ: %s",
                correlation_id,
                event_type,
                exc,
            )
            await message.nack(requeue=False)
        except Exception as exc:
            logger.error(
                f"[InteractionQueue] correlation_id={correlation_id} - Error handling message: {exc}"
            )
            await message.nack(requeue=False)
