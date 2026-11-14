import json

import aio_pika
from aio_pika import ExchangeType, IncomingMessage

from core.config import Settings
from infra.messaging.consumers.user_event_handler import UserEventHandler
from infra.messaging.event_constant import MessageEventBus
from utils.logger import setup_logger

# ─────────────────────────────────────────────────────────────────────────────
# UserQueue — RabbitMQ consumer for user events
# ─────────────────────────────────────────────────────────────────────────────

logger = setup_logger(name="FastAPI-Recommendations")


class UserQueue:
    def __init__(
        self, settings: Settings, event_handler: UserEventHandler | None = None
    ) -> None:
        self._settings = settings
        self._connection = None
        self._channel = None
        self._consumer_tag = None
        self._handler = event_handler

    def set_handler(self, handler: UserEventHandler) -> None:
        """Inject userEventHandler."""
        self._handler = handler

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    async def start(self) -> None:
        if not self._settings.rabbitmq_enabled:
            logger.info("[UserQueue] RabbitMQ disabled, skipping UserQueue.")
            return

        self._connection = await aio_pika.connect_robust(self._settings.rabbitmq_url)
        self._channel = await self._connection.channel()

        # Prefetch 10 messages
        await self._channel.set_qos(prefetch_count=10)

        # ── 1. Khai bao Exchange ─────────────────────────────────────
        user_exchange = await self._channel.declare_exchange(
            name=MessageEventBus.USER_EXCHANGE,
            type=ExchangeType.TOPIC,
            durable=True,
        )

        # ── 2. Khai bao DLX ────────────────────────
        dlx = await self._channel.declare_exchange(
            name=MessageEventBus.USER_DLX,
            type=ExchangeType.TOPIC,
            durable=True,
        )

        # ── 3. Khai bao DLQ ──────────
        dlq = await self._channel.declare_queue(
            name=MessageEventBus.USER_DLQ,
            durable=True,
        )
        await dlq.bind(
            exchange=dlx,
            routing_key=MessageEventBus.USER_DLQ_RK,
        )

        # ── 4. Khai bao Queue voi DLX config ───────────────
        user_queue = await self._channel.declare_queue(
            name=MessageEventBus.USER_RECOMMENDATION_QUEUE,
            durable=True,
            arguments={
                "x-dead-letter-exchange": MessageEventBus.USER_DLX,
                "x-dead-letter-routing-key": MessageEventBus.USER_DLQ_RK,
            },
        )

        await user_queue.bind(
            exchange=user_exchange,
            routing_key=MessageEventBus.USER_ROUTING_KEY,
        )

        # ── 6. Bat dau consume ────────────────────────────────────────────
        self._consumer_tag = await user_queue.consume(
            self._handle_message,
            no_ack=False,
        )

        logger.info(
            f"[UserQueue] Started user Queue:"
            f"\nQueue: {MessageEventBus.USER_RECOMMENDATION_QUEUE}"
            f"\nDLX: {MessageEventBus.USER_DLX}"
            f"\nDLQ: {MessageEventBus.USER_DLQ}"
        )

    async def close(self) -> None:
        if self._connection:
            await self._connection.close()
            logger.info("[UserQueue] UserQueue closed.")

    # ── Consumer ──────────────────────────────────────────────────────────────

    async def _handle_message(self, message: IncomingMessage) -> None:
        """Xu ly message tu RabbitMQ."""
        correlation_id = message.correlation_id
        event_type = "(unknown)"
        try:
            routing_key = message.routing_key
            body = json.loads(message.body.decode("utf-8"))

            correlation_id = message.correlation_id or body.get("correlationId")
            event_type = body.get("eventType", None)

            logger.info(
                f"[UserQueue] correlation_id={correlation_id} - Nhận message từ RabbitMQ: routing_key={routing_key} event_type={event_type}"
            )

            if routing_key is None:
                logger.error("[UserQueue] Routing key is None!")
                await message.nack(requeue=False)
                return

            if event_type is None:
                logger.error("[UserQueue] eventType is None in message body!")
                await message.nack(requeue=False)
                return

            if self._handler is None:
                logger.error(
                    "[UserQueue] userEventHandler not injected! Ack to prevent loop."
                )
                await message.ack()
                return

            await self._handler.handle(
                event=body,
            )
            await message.ack()

        except (ValueError, TypeError, KeyError) as exc:
            logger.error(
                "[UserQueue] correlation_id=%s - Invalid payload event_type=%s, sending to DLQ: %s",
                correlation_id,
                event_type,
                exc,
            )
            await message.nack(requeue=False)
        except Exception as exc:
            logger.error(
                f"[UserQueue] correlation_id={correlation_id} - Error handling message: {exc}"
            )
            await message.nack(requeue=False)
