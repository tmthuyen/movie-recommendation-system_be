"""Unit test cho ``core/interaction_queue.py`` — mock aio-pika, không có broker thật."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

import infra.messaging.interaction_queue as queue_module
from infra.messaging.interaction_queue import InteractionQueue


def run(coro):
    return asyncio.run(coro)


class FakeMessage:
    def __init__(
        self,
        body: bytes,
        routing_key: str | None = "interaction.event",
        correlation_id: str | None = None,
    ):
        self.body = body
        self.routing_key = routing_key
        self.correlation_id = correlation_id
        self.ack_count = 0
        self.nack_calls: list[bool] = []

    async def ack(self):
        self.ack_count += 1

    async def nack(self, requeue: bool = True):
        self.nack_calls.append(requeue)


def make_settings(rabbitmq_enabled: bool = False):
    return type("S", (), {"rabbitmq_enabled": rabbitmq_enabled})()


class TestHandleMessageAck:
    def test_valid_message_calls_handler_and_acks(self, monkeypatch):
        queue = InteractionQueue(make_settings())
        handler = MagicMock()
        handler.handle = AsyncMock()
        queue.set_handler(handler)
        message = FakeMessage(
            json.dumps(
                {
                    "eventType": "interaction.created",
                    "payload": {"userId": "u-1", "movieId": 2},
                }
            ).encode()
        )

        run(queue._handle_message(message))

        handler.handle.assert_awaited_once_with(
            event={
                "eventType": "interaction.created",
                "payload": {"userId": "u-1", "movieId": 2},
            }
        )
        assert message.ack_count == 1
        assert message.nack_calls == []

    def test_missing_payload_is_passed_as_full_body(self):
        queue = InteractionQueue(make_settings())
        handler = MagicMock()
        handler.handle = AsyncMock()
        queue.set_handler(handler)
        message = FakeMessage(json.dumps({"eventType": "interaction.event"}).encode())

        run(queue._handle_message(message))

        handler.handle.assert_awaited_once_with(
            event={"eventType": "interaction.event"}
        )
        assert message.ack_count == 1

    def test_missing_event_type_is_nacked_without_requeue(self):
        queue = InteractionQueue(make_settings())
        handler = MagicMock()
        handler.handle = AsyncMock()
        queue.set_handler(handler)
        message = FakeMessage(json.dumps({"payload": {}}).encode())

        run(queue._handle_message(message))

        handler.handle.assert_not_awaited()
        assert message.ack_count == 0
        assert message.nack_calls == [False]


class TestHandleMessageNack:
    def test_none_routing_key_is_nacked_without_requeue(self):
        queue = InteractionQueue(make_settings())
        handler = MagicMock()
        handler.handle = AsyncMock()
        queue.set_handler(handler)
        message = FakeMessage(b'{"eventType": "x"}', routing_key=None)

        run(queue._handle_message(message))

        assert message.nack_calls == [False]
        assert message.ack_count == 0
        handler.handle.assert_not_awaited()

    def test_invalid_json_is_nacked(self):
        queue = InteractionQueue(make_settings())
        message = FakeMessage(b"{not-json")

        run(queue._handle_message(message))

        assert message.nack_calls == [False]
        assert message.ack_count == 0

    def test_missing_handler_acks_to_prevent_loop(self):
        queue = InteractionQueue(make_settings())
        message = FakeMessage(b'{"eventType": "x", "payload": {}}')

        run(queue._handle_message(message))

        assert message.ack_count == 1
        assert message.nack_calls == []

    def test_handler_value_error_is_nacked(self):
        queue = InteractionQueue(make_settings())
        handler = MagicMock()
        handler.handle = AsyncMock(side_effect=ValueError("payload sai"))
        queue.set_handler(handler)
        message = FakeMessage(b'{"eventType": "x", "payload": {}}')

        run(queue._handle_message(message))

        assert message.nack_calls == [False]
        assert message.ack_count == 0

    def test_handler_runtime_error_is_nacked(self):
        queue = InteractionQueue(make_settings())
        handler = MagicMock()
        handler.handle = AsyncMock(side_effect=RuntimeError("db down"))
        queue.set_handler(handler)
        message = FakeMessage(b'{"eventType": "x", "payload": {}}')

        run(queue._handle_message(message))

        assert message.nack_calls == [False]
        assert message.ack_count == 0


class TestLifecycle:
    def test_start_disabled_does_not_connect(self, monkeypatch):
        connect = MagicMock()
        monkeypatch.setattr(queue_module.aio_pika, "connect_robust", connect)
        queue = InteractionQueue(make_settings(rabbitmq_enabled=False))

        run(queue.start())

        connect.assert_not_called()
        assert queue._connection is None

    def test_close_without_connection_is_noop(self):
        queue = InteractionQueue(make_settings())
        run(queue.close())
        assert queue._connection is None

    def test_close_closes_connection(self):
        queue = InteractionQueue(make_settings())
        connection = MagicMock()
        connection.close = AsyncMock()
        queue._connection = connection

        run(queue.close())

        connection.close.assert_awaited_once()

    def test_set_handler_is_used_by_consumer(self):
        queue = InteractionQueue(make_settings())
        handler = MagicMock()
        queue.set_handler(handler)
        assert queue._handler is handler
