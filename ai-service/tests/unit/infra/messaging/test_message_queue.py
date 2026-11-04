"""Unit test cho ``core/message_queue.py`` — mock aio-pika, không có broker thật."""

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import infra.messaging.message_queue as queue_module
from infra.messaging.message_queue import MessageQueue


def run(coro):
    return asyncio.run(coro)


class FakeMessage:
    def __init__(self, body: bytes, routing_key: str | None = "movie.created"):
        self.body = body
        self.routing_key = routing_key
        self.ack_count = 0
        self.nack_calls: list[bool] = []

    async def ack(self):
        self.ack_count += 1

    async def nack(self, requeue: bool = True):
        self.nack_calls.append(requeue)


def make_settings(rabbitmq_enabled: bool = False):
    return type("S", (), {"rabbitmq_enabled": rabbitmq_enabled})()


class TestHandleMessageAck:
    def test_valid_message_calls_handler_and_acks(self):
        queue = MessageQueue(make_settings())
        handler = MagicMock()
        handler.handle = AsyncMock()
        queue.set_handler(handler)
        message = FakeMessage(
            json.dumps(
                {"eventType": "movie.created", "payload": {"movieId": 1}}
            ).encode()
        )

        run(queue._handle_message(message))

        handler.handle.assert_awaited_once_with("movie.created", {"movieId": 1})
        assert message.ack_count == 1
        assert message.nack_calls == []

    def test_missing_payload_defaults_to_empty_dict(self):
        queue = MessageQueue(make_settings())
        handler = MagicMock()
        handler.handle = AsyncMock()
        queue.set_handler(handler)
        message = FakeMessage(json.dumps({"eventType": "movie.deleted"}).encode())

        run(queue._handle_message(message))

        handler.handle.assert_awaited_once_with("movie.deleted", {})
        assert message.ack_count == 1

    def test_missing_event_type_defaults_to_empty_string(self):
        queue = MessageQueue(make_settings())
        handler = MagicMock()
        handler.handle = AsyncMock()
        queue.set_handler(handler)
        message = FakeMessage(json.dumps({"payload": {}}).encode())

        run(queue._handle_message(message))

        handler.handle.assert_awaited_once_with("", {})


class TestHandleMessageFailure:
    def test_none_routing_key_returns_without_ack_or_nack(self):
        # Hành vi hiện tại: bỏ qua message mà không ack/nack (xem báo cáo gap).
        queue = MessageQueue(make_settings())
        message = FakeMessage(b'{"eventType": "x"}', routing_key=None)

        run(queue._handle_message(message))

        assert message.ack_count == 0
        assert message.nack_calls == []

    def test_invalid_json_is_nacked(self):
        queue = MessageQueue(make_settings())
        message = FakeMessage(b"{not-json")

        run(queue._handle_message(message))

        assert message.nack_calls == [False]
        assert message.ack_count == 0

    def test_missing_handler_acks(self):
        queue = MessageQueue(make_settings())
        message = FakeMessage(b'{"eventType": "x", "payload": {}}')

        run(queue._handle_message(message))

        assert message.ack_count == 1
        assert message.nack_calls == []

    def test_handler_value_error_is_nacked(self):
        queue = MessageQueue(make_settings())
        handler = MagicMock()
        handler.handle = AsyncMock(side_effect=ValueError("schema sai"))
        queue.set_handler(handler)
        message = FakeMessage(b'{"eventType": "x", "payload": {}}')

        run(queue._handle_message(message))

        assert message.nack_calls == [False]
        assert message.ack_count == 0

    def test_handler_generic_error_is_nacked(self):
        queue = MessageQueue(make_settings())
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
        queue = MessageQueue(make_settings(rabbitmq_enabled=False))

        run(queue.start())

        connect.assert_not_called()
        assert queue._connection is None

    def test_close_without_connection_is_noop(self):
        queue = MessageQueue(make_settings())
        run(queue.close())
        assert queue._connection is None

    def test_close_closes_connection(self):
        queue = MessageQueue(make_settings())
        connection = MagicMock()
        connection.close = AsyncMock()
        queue._connection = connection

        run(queue.close())

        connection.close.assert_awaited_once()

    def test_set_handler(self):
        queue = MessageQueue(make_settings())
        handler = MagicMock()
        queue.set_handler(handler)
        assert queue._handler is handler
