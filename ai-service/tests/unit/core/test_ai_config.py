import asyncio
from types import SimpleNamespace

import pytest

from core.ai_config import AIConfig, CONFIG_HASH, VERSION_KEY


class FakeRedis:
    """Redis tối giản cho test AIConfig, không cần server thật."""

    def __init__(self) -> None:
        self.hashes: dict[str, dict[str, str]] = {}
        self.values: dict[str, int] = {}

    async def hget(self, key: str, field: str) -> str | None:
        return self.hashes.get(key, {}).get(field)

    async def hmget(self, key: str, fields: list[str]) -> list[str | None]:
        bucket = self.hashes.get(key, {})
        return [bucket.get(field) for field in fields]

    async def hset(self, key: str, mapping: dict[str, str]) -> None:
        self.hashes.setdefault(key, {}).update(mapping)

    async def hgetall(self, key: str) -> dict[str, str]:
        return dict(self.hashes.get(key, {}))

    async def get(self, key: str) -> str | None:
        value = self.values.get(key)
        return str(value) if value is not None else None

    async def incr(self, key: str) -> int:
        self.values[key] = self.values.get(key, 0) + 1
        return self.values[key]


def make_config(redis: FakeRedis | None = None) -> AIConfig:
    store = SimpleNamespace(client=redis) if redis is not None else None
    return AIConfig(redis_store=store)


def test_describe_returns_yaml_defaults() -> None:
    config = make_config()
    data = asyncio.run(config.describe())

    assert data["version"] == 0
    assert len(data["groups"]) == 8
    items = [item for group in data["groups"] for item in group["items"]]
    assert len(items) == 31
    assert all(item["source"] == "default" for item in items)
    first = next(item for item in items if item["key"] == "ai.for_you.weights.CF")
    assert first["value"] == pytest.approx(0.375)
    assert first["default"] == pytest.approx(0.375)


def test_get_hit_miss_and_invalid_json() -> None:
    redis = FakeRedis()
    config = make_config(redis)

    assert asyncio.run(config.get("ai.for_you.rrf.k")) == 60

    redis.hashes.setdefault(CONFIG_HASH, {})["ai.for_you.rrf.k"] = "80"
    assert asyncio.run(config.get("ai.for_you.rrf.k")) == 80

    redis.hashes[CONFIG_HASH]["ai.for_you.rrf.k"] = "not-json"
    assert asyncio.run(config.get("ai.for_you.rrf.k")) == 60


def test_get_unknown_key_returns_none() -> None:
    config = make_config()
    assert asyncio.run(config.get("ai.unknown.key")) is None


def test_get_many_fills_defaults() -> None:
    redis = FakeRedis()
    config = make_config(redis)
    redis.hashes.setdefault(CONFIG_HASH, {})["ai.for_you.rrf.k"] = "75"

    values = asyncio.run(config.get_many(["ai.for_you.rrf.k", "ai.genre.alpha"]))

    assert values["ai.for_you.rrf.k"] == 75
    assert values["ai.genre.alpha"] == pytest.approx(0.05)


def test_set_many_updates_redis_and_version() -> None:
    redis = FakeRedis()
    config = make_config(redis)

    version = asyncio.run(
        config.set_many(
            {
                "ai.for_you.rrf.k": 90,
                "ai.for_you.weights.CF": 0.25,
            }
        )
    )

    assert version == 1
    assert redis.values[VERSION_KEY] == 1
    assert asyncio.run(config.get("ai.for_you.rrf.k")) == 90
    assert asyncio.run(config.get("ai.for_you.weights.CF")) == pytest.approx(0.25)


def test_set_many_rejects_unknown_key_and_wrong_prefix() -> None:
    config = make_config(FakeRedis())

    with pytest.raises(ValueError):
        asyncio.run(config.set_many({"ai.unknown.key": 1}))
    with pytest.raises(ValueError):
        asyncio.run(config.set_many({"backend.foo": 1}))


def test_set_many_requires_redis() -> None:
    config = make_config()
    with pytest.raises(RuntimeError):
        asyncio.run(config.set_many({"ai.for_you.rrf.k": 70}))


def test_snapshots_use_defaults() -> None:
    config = make_config()

    for_you = asyncio.run(config.for_you_snapshot())
    genre = asyncio.run(config.genre_snapshot())
    training = asyncio.run(config.training_snapshot())

    assert for_you.weights["CF"] == pytest.approx(0.375)
    assert for_you.rrf_k == 60
    assert for_you.candidate_multiplier == 2
    assert genre.alpha == pytest.approx(0.05)
    assert genre.top_movies_per_genre == 100
    assert training.factors == 64
    assert training.min_user_interactions == 5
    assert training.action_scores["like"] == pytest.approx(5.0)


def test_for_you_snapshot_falls_back_when_all_weights_zero() -> None:
    redis = FakeRedis()
    config = make_config(redis)
    redis.hashes[CONFIG_HASH] = {
        "ai.for_you.weights.CF": "0",
        "ai.for_you.weights.LONG_TERM": "0",
        "ai.for_you.weights.SHORT_TERM": "0",
        "ai.for_you.weights.SEARCH": "0",
        "ai.for_you.weights.GENRE": "0",
    }

    snapshot = asyncio.run(config.for_you_snapshot())

    assert snapshot.weights["CF"] == pytest.approx(0.375)
    assert sum(snapshot.weights.values()) > 0
