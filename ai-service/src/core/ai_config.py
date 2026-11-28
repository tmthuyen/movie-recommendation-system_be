"""AI config động: default/metadata từ YAML, value override từ Redis.

Thiết kế tối giản:
- YAML là nguồn default + group/label/description/type duy nhất.
- Redis chỉ lưu value override (flat key).
- Class này đọc Redis mỗi lần dùng; thiếu/lỗi/sai JSON → trả default YAML.
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, TYPE_CHECKING

import yaml

from utils.logger import setup_logger

if TYPE_CHECKING:
    from infra.redis.redis_service import RedisStore

logger = setup_logger(name="FastAPI-Recommendations")

CONFIG_HASH = "config:v1:ai"
VERSION_KEY = "config:v1:ai:version"
YAML_RELOAD_INTERVAL_SECONDS = 5.0


@dataclass(frozen=True)
class ConfigDef:
    """Một key config và metadata/default tương ứng."""

    key: str
    group: str
    group_label: str
    label: str
    description: str
    type: str
    default: Any
    min: float | None = None
    max: float | None = None


@dataclass(frozen=True)
class ForYouConfig:
    """Snapshot config cho một request For You."""

    weights: dict[str, float]
    cold_weights: dict[str, float]
    cf_popular_weights: dict[str, float]
    popular_only_weight: float
    rrf_k: int
    candidate_multiplier: int
    cold_max: int
    low_max: int
    medium_max: int


@dataclass(frozen=True)
class GenreConfig:
    """Snapshot config cho genre ranking/update."""

    alpha: float
    min_abs_weight: float
    top_movies_per_genre: int


@dataclass(frozen=True)
class TrainingConfig:
    """Snapshot config cho một lần train CF."""

    factors: int
    alpha: float
    regularization: float
    iterations: int
    random_state: int
    min_user_interactions: int
    min_item_interactions: int
    action_scores: dict[str, float]


FOR_YOU_WEIGHT_KEYS = (
    "ai.for_you.weights.CF",
    "ai.for_you.weights.LONG_TERM",
    "ai.for_you.weights.SHORT_TERM",
    "ai.for_you.weights.SEARCH",
    "ai.for_you.weights.GENRE",
)

COLD_WEIGHT_KEYS = (
    "ai.for_you.cold_weights.LONG_TERM",
    "ai.for_you.cold_weights.SHORT_TERM",
    "ai.for_you.cold_weights.SEARCH",
    "ai.for_you.cold_weights.GENRE",
)

CF_POPULAR_WEIGHT_KEYS = (
    "ai.for_you.cf_popular_weights.CF",
    "ai.for_you.cf_popular_weights.POPULAR",
)


class AIConfig:
    """Đọc/ghi AI config từ Redis, fallback default từ YAML."""

    def __init__(
        self,
        redis_store: "RedisStore | None" = None,
        yaml_path: str | Path | None = None,
    ) -> None:
        self._redis = redis_store
        self._yaml_path = self._resolve_yaml_path(yaml_path)
        self._defs: dict[str, ConfigDef] = {}
        self._groups: list[dict[str, Any]] = []
        self._yaml_mtime = 0.0
        self._last_reload_check = 0.0
        self._load_yaml(force=True)

    @staticmethod
    def _resolve_yaml_path(yaml_path: str | Path | None) -> Path:
        if yaml_path:
            return Path(yaml_path).expanduser().resolve()
        env_path = os.getenv("AI_CONFIG_PATH")
        if env_path:
            return Path(env_path).expanduser().resolve()
        # .../ai-service/src/core/ai_config.py -> .../ai-service/config/ai_config.yaml
        return (
            Path(__file__).resolve().parents[2] / "config" / "ai_config.yaml"
        ).resolve()

    def _load_yaml(self, force: bool = False) -> None:
        if not self._yaml_path.exists():
            raise RuntimeError(f"AI config YAML không tồn tại: {self._yaml_path}")

        mtime = self._yaml_path.stat().st_mtime
        if not force and mtime == self._yaml_mtime:
            return

        with self._yaml_path.open("r", encoding="utf-8") as file:
            payload = yaml.safe_load(file) or {}

        defs: dict[str, ConfigDef] = {}
        groups: list[dict[str, Any]] = []
        for group in payload.get("groups", []):
            group_id = str(group["id"])
            group_label = str(group.get("label", group_id))
            items: list[dict[str, Any]] = []
            for item in group.get("items", []):
                definition = ConfigDef(
                    key=str(item["key"]),
                    group=group_id,
                    group_label=group_label,
                    label=str(item.get("label", item["key"])),
                    description=str(item.get("description", "")),
                    type=str(item.get("type", "json")),
                    default=item.get("default"),
                    min=item.get("min"),
                    max=item.get("max"),
                )
                defs[definition.key] = definition
                items.append(
                    {
                        "key": definition.key,
                        "label": definition.label,
                        "description": definition.description,
                        "type": definition.type,
                        "default": definition.default,
                        "min": definition.min,
                        "max": definition.max,
                    }
                )
            groups.append({"group": group_id, "label": group_label, "items": items})

        if not defs:
            raise RuntimeError(
                f"AI config YAML rỗng hoặc sai cấu trúc: {self._yaml_path}"
            )

        self._defs = defs
        self._groups = groups
        self._yaml_mtime = mtime
        logger.info(
            "[AIConfig] Loaded YAML path=%s keys=%d groups=%d",
            self._yaml_path,
            len(defs),
            len(groups),
        )

    def _maybe_reload_yaml(self) -> None:
        now = time.monotonic()
        if now - self._last_reload_check < YAML_RELOAD_INTERVAL_SECONDS:
            return
        self._last_reload_check = now
        try:
            self._load_yaml()
        except Exception as exc:
            logger.warning("[AIConfig] reload YAML thất bại: %s", exc)

    def _redis_client(self):
        return getattr(self._redis, "client", None) if self._redis else None

    def _cast(self, definition: ConfigDef, value: Any) -> Any:
        if definition.type == "float":
            return float(value)
        if definition.type == "int":
            return int(value)
        if definition.type == "boolean":
            if isinstance(value, bool):
                return value
            return str(value).lower() in ("1", "true", "yes", "on")
        if definition.type == "string":
            return str(value)
        if definition.type == "json":
            return json.loads(value) if isinstance(value, str) else value
        return value

    def _validate(self, definition: ConfigDef, value: Any) -> None:
        if definition.type in ("float", "int"):
            numeric = float(value)
            if definition.min is not None and numeric < float(definition.min):
                raise ValueError(f"value < min {definition.min}")
            if definition.max is not None and numeric > float(definition.max):
                raise ValueError(f"value > max {definition.max}")

    def _parse_raw(self, definition: ConfigDef, raw: Any) -> Any:
        if raw is None:
            return definition.default
        try:
            value = self._cast(definition, json.loads(raw))
            self._validate(definition, value)
            return value
        except Exception as exc:
            logger.warning(
                "[AIConfig] invalid key=%s raw=%r error=%s fallback=%r",
                definition.key,
                raw,
                exc,
                definition.default,
            )
            return definition.default

    async def get(self, key: str) -> Any:
        self._maybe_reload_yaml()
        definition = self._defs.get(key)
        if definition is None:
            logger.warning("[AIConfig] unknown key=%s", key)
            return None

        client = self._redis_client()
        if client is None:
            logger.debug(
                "[AIConfig] redis disabled key=%s default=%r source=yaml",
                key,
                definition.default,
            )
            return definition.default

        try:
            raw = await client.hget(CONFIG_HASH, key)
        except Exception as exc:
            logger.warning(
                "[AIConfig] redis_error key=%s fallback=%r error=%s",
                key,
                definition.default,
                exc,
            )
            return definition.default

        if raw is None:
            logger.debug(
                "[AIConfig] miss key=%s default=%r source=yaml",
                key,
                definition.default,
            )
            return definition.default

        value = self._parse_raw(definition, raw)
        logger.debug("[AIConfig] hit key=%s value=%r source=redis", key, value)
        return value

    async def get_many(self, keys: list[str]) -> dict[str, Any]:
        self._maybe_reload_yaml()
        client = self._redis_client()
        result: dict[str, Any] = {}
        definitions = [self._defs.get(key) for key in keys]
        raws: list[Any] = [None] * len(keys)

        if client is not None:
            try:
                raws = await client.hmget(CONFIG_HASH, keys)
            except Exception as exc:
                logger.warning(
                    "[AIConfig] redis_error hmget keys=%s error=%s", keys, exc
                )

        for key, definition, raw in zip(keys, definitions, raws):
            if definition is None:
                logger.warning("[AIConfig] unknown key=%s", key)
                result[key] = None
                continue
            result[key] = self._parse_raw(definition, raw)
            if raw is None:
                logger.debug(
                    "[AIConfig] miss key=%s default=%r source=yaml",
                    key,
                    definition.default,
                )
            else:
                logger.debug(
                    "[AIConfig] hit key=%s value=%r source=redis",
                    key,
                    result[key],
                )
        return result

    async def set_many(self, changes: dict[str, Any]) -> int:
        normalized: dict[str, str] = {}
        for key, value in changes.items():
            if not key.startswith("ai."):
                raise ValueError(f"Key không thuộc AI config: {key}")
            definition = self._defs.get(key)
            if definition is None:
                raise ValueError(f"Key không có trong registry: {key}")
            casted = self._cast(definition, value)
            self._validate(definition, casted)
            normalized[key] = json.dumps(casted, ensure_ascii=False)

        client = self._redis_client()
        if client is None:
            raise RuntimeError("Redis chưa sẵn sàng để ghi AI config")

        await client.hset(CONFIG_HASH, mapping=normalized)
        version = int(await client.incr(VERSION_KEY))
        logger.info(
            "[AIConfig] updated keys=%s version=%d",
            list(normalized.keys()),
            version,
        )
        return version

    async def describe(self) -> dict[str, Any]:
        self._maybe_reload_yaml()
        client = self._redis_client()
        raws: dict[str, Any] = {}
        version = 0

        if client is not None:
            try:
                raws = await client.hgetall(CONFIG_HASH)
                raw_version = await client.get(VERSION_KEY)
                version = int(raw_version or 0)
            except Exception as exc:
                logger.warning("[AIConfig] redis_error describe error=%s", exc)

        groups: list[dict[str, Any]] = []
        for group in self._groups:
            items: list[dict[str, Any]] = []
            for item in group["items"]:
                definition = self._defs[item["key"]]
                raw = raws.get(definition.key)
                value = self._parse_raw(definition, raw)
                items.append(
                    {
                        **item,
                        "value": value,
                        "source": "redis" if raw is not None else "default",
                    }
                )
            groups.append({**group, "items": items})

        logger.debug(
            "[AIConfig] describe version=%d keys=%d source=%s",
            version,
            len(self._defs),
            "redis" if client is not None else "yaml",
        )
        return {"version": version, "groups": groups}

    async def for_you_snapshot(self) -> ForYouConfig:
        keys = [
            *FOR_YOU_WEIGHT_KEYS,
            *COLD_WEIGHT_KEYS,
            *CF_POPULAR_WEIGHT_KEYS,
            "ai.for_you.popular_only_weight",
            "ai.for_you.rrf.k",
            "ai.for_you.candidate_multiplier",
            "ai.for_you.segments.cold_max",
            "ai.for_you.segments.low_max",
            "ai.for_you.segments.medium_max",
        ]
        values = await self.get_many(keys)
        weights = {
            key.removeprefix("ai.for_you.weights."): float(values[key])
            for key in FOR_YOU_WEIGHT_KEYS
        }
        if sum(weights.values()) <= 0:
            logger.warning("[AIConfig] toàn bộ For You weights = 0, dùng default YAML")
            weights = {
                key.removeprefix("ai.for_you.weights."): float(self._defs[key].default)
                for key in FOR_YOU_WEIGHT_KEYS
            }

        return ForYouConfig(
            weights=weights,
            cold_weights={
                key.removeprefix("ai.for_you.cold_weights."): float(values[key])
                for key in COLD_WEIGHT_KEYS
            },
            cf_popular_weights={
                key.removeprefix("ai.for_you.cf_popular_weights."): float(values[key])
                for key in CF_POPULAR_WEIGHT_KEYS
            },
            popular_only_weight=float(values["ai.for_you.popular_only_weight"]),
            rrf_k=int(values["ai.for_you.rrf.k"]),
            candidate_multiplier=int(values["ai.for_you.candidate_multiplier"]),
            cold_max=int(values["ai.for_you.segments.cold_max"]),
            low_max=int(values["ai.for_you.segments.low_max"]),
            medium_max=int(values["ai.for_you.segments.medium_max"]),
        )

    async def genre_snapshot(self) -> GenreConfig:
        values = await self.get_many(
            [
                "ai.genre.alpha",
                "ai.genre.min_abs_weight",
                "ai.genre.top_movies_per_genre",
            ]
        )
        return GenreConfig(
            alpha=float(values["ai.genre.alpha"]),
            min_abs_weight=float(values["ai.genre.min_abs_weight"]),
            top_movies_per_genre=int(values["ai.genre.top_movies_per_genre"]),
        )

    async def training_snapshot(self) -> TrainingConfig:
        keys = [
            "ai.training.cf.factors",
            "ai.training.cf.alpha",
            "ai.training.cf.regularization",
            "ai.training.cf.iterations",
            "ai.training.cf.random_state",
            "ai.training.cf.min_user_interactions",
            "ai.training.cf.min_item_interactions",
            "ai.training.action_scores.click",
            "ai.training.action_scores.comment",
            "ai.training.action_scores.like",
        ]
        values = await self.get_many(keys)
        return TrainingConfig(
            factors=int(values["ai.training.cf.factors"]),
            alpha=float(values["ai.training.cf.alpha"]),
            regularization=float(values["ai.training.cf.regularization"]),
            iterations=int(values["ai.training.cf.iterations"]),
            random_state=int(values["ai.training.cf.random_state"]),
            min_user_interactions=int(values["ai.training.cf.min_user_interactions"]),
            min_item_interactions=int(values["ai.training.cf.min_item_interactions"]),
            action_scores={
                "click": float(values["ai.training.action_scores.click"]),
                "comment": float(values["ai.training.action_scores.comment"]),
                "like": float(values["ai.training.action_scores.like"]),
            },
        )
