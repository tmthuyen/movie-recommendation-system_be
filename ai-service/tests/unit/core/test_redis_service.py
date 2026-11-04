"""Unit test cho ``core/redis_service.py`` — không kết nối Redis thật."""

import asyncio
from unittest.mock import MagicMock

from src.core.redis_service import RedisStore


def run(coro):
    return asyncio.run(coro)


class FakeRedisClient:
    def __init__(self):
        self.closed = False

    async def aclose(self):
        self.closed = True


class TestRedisStoreStart:
    def test_disabled_does_not_create_client(self, monkeypatch):
        import src.core.redis_service as redis_module

        factory = MagicMock(return_value=FakeRedisClient())
        monkeypatch.setattr(redis_module.Redis, "from_url", factory)
        settings = type("S", (), {"redis_enabled": False, "redis_url": "redis://x"})()
        store = RedisStore(settings)

        run(store.start())

        assert store.client is None
        factory.assert_not_called()

    def test_enabled_creates_client_with_decode_responses(self, monkeypatch):
        import src.core.redis_service as redis_module

        sentinel = FakeRedisClient()
        calls = {}

        def fake_from_url(url, **kwargs):
            calls["url"] = url
            calls["kwargs"] = kwargs
            return sentinel

        monkeypatch.setattr(redis_module.Redis, "from_url", fake_from_url)
        settings = type(
            "S", (), {"redis_enabled": True, "redis_url": "redis://localhost:6379/9"}
        )()
        store = RedisStore(settings)

        run(store.start())

        assert store.client is sentinel
        assert calls["url"] == "redis://localhost:6379/9"
        assert calls["kwargs"] == {"decode_responses": True}


class TestRedisStoreClose:
    def test_close_calls_aclose(self):
        store = RedisStore(type("S", (), {"redis_enabled": True, "redis_url": ""})())
        client = FakeRedisClient()
        store.client = client

        run(store.close())

        assert client.closed is True

    def test_close_without_client_is_noop(self):
        store = RedisStore(type("S", (), {"redis_enabled": False, "redis_url": ""})())
        run(store.close())
        assert store.client is None
