"""Unit test cho ``src/core/config.py``.

Bao phủ:
- ``Settings``: giá trị mặc định, override từ biến môi trường, parse
  ``CORS_ORIGINS`` (dấu phẩy) qua property ``allowed_origins``, các field
  boolean/int, cấu hình vector DB và model embedding.
- ``get_settings``: cache ``lru_cache`` (cùng instance) và hành vi sau
  ``cache_clear()``.

Ghi chú: mọi ``Settings`` trong test được tạo với ``_env_file=None`` để không
đọc file ``.env`` thật của máy dev; biến môi trường do ``monkeypatch.setenv``
điều khiển. ``get_settings`` dùng cache toàn cục nên fixture autouse luôn
``cache_clear()`` trước/sau mỗi test.
"""

from pathlib import Path

import pytest
from pydantic import ValidationError

from src.core import config as config_module
from src.core.config import Settings, get_settings


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    """``get_settings`` dùng ``lru_cache`` toàn cục → phải clear giữa các test."""
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _settings(**overrides) -> Settings:
    """Tạo ``Settings`` mới, bỏ qua ``.env`` để test thuần biến môi trường."""
    return Settings(_env_file=None, **overrides)


class TestSettings:
    """Giá trị mặc định của ``Settings`` (không phụ thuộc ``.env``)."""

    def test_app_metadata_defaults(self):
        settings = _settings()

        assert settings.app_name == "movie-recommendation-ai-service"
        assert settings.app_version == "0.1.0"
        assert settings.app_port == 8082
        assert settings.api_prefix == "/api/recommendations"

    def test_service_and_otel_defaults(self):
        settings = _settings()

        assert settings.service_name == "ai-service"
        assert settings.otel_exporter_url == "http://localhost:4318"

    def test_jwt_fields_are_required_and_read_from_env(self):
        # conftest.py đặt JWT_SECRET_KEY/JWT_ALGORITHM trước khi import src.*
        settings = _settings()

        assert settings.jwt_secret_key == "unit-test-jwt-secret"
        assert settings.jwt_algorithm == "HS256"

    def test_default_cors_origins_and_allowed_origins(self):
        settings = _settings()

        assert settings.cors_origins == "http://localhost:3000,http://localhost:5173"
        assert settings.allowed_origins == [
            "http://localhost:3000",
            "http://localhost:5173",
        ]

    def test_vector_db_defaults(self):
        settings = _settings()

        assert settings.vector_db_provider == "chroma"
        assert settings.vector_db_url == "http://localhost:6333"
        assert settings.vector_db_api_key is None
        assert settings.vector_collection == "movies"
        assert settings.vector_size == 384
        assert settings.cf_vector_size == 64
        assert settings.chroma_persist_dir == "./data/chroma_db"

    def test_vector_db_collection_defaults(self):
        settings = _settings()

        assert settings.vector_user_cf_collection == "user_cf_vectors"
        assert settings.vector_movie_cf_collection == "movie_cf_vectors"
        assert settings.vector_user_profile_collection == "user_profile_vectors"

    def test_embedding_model_default(self):
        settings = _settings()

        assert settings.embedding_model_name == "paraphrase-multilingual-MiniLM-L12-v2"

    def test_chroma_persist_path_resolves_relative_to_ai_service(self):
        settings = _settings()
        expected = (
            Path(config_module.__file__).resolve().parents[2] / "data" / "chroma_db"
        )

        assert settings.chroma_persist_path == expected

    def test_chroma_persist_path_keeps_absolute_directory(self, tmp_path):
        target = tmp_path / "chroma"
        settings = _settings(chroma_persist_dir=str(target))

        assert settings.chroma_persist_path == target.resolve()

    def test_training_schedule_defaults(self):
        settings = _settings()

        assert settings.model_train_cron == "0 3 * * 0"
        assert settings.model_train_enabled is False

    def test_rabbitmq_defaults(self):
        settings = _settings()

        assert settings.rabbitmq_url.startswith("amqp://")
        assert settings.rabbitmq_movie_exchange == "movie.exchange"
        assert settings.rabbitmq_recommendation_queue == "recommendation.queue"
        assert settings.rabbitmq_max_retry == 3
        assert settings.rabbitmq_movie_routing_key == "movie.#"

    def test_redis_defaults(self):
        settings = _settings()

        assert settings.redis_url == "redis://localhost:6379/0"
        assert settings.redis_key_prefix == "movie-recommendation:"

    def test_settings_config_ignores_extra_keys(self):
        config = Settings.model_config

        assert config["extra"] == "ignore"
        assert config["case_sensitive"] is False
        assert ".env" in config["env_file"]


class TestSettingsEnvOverride:
    """Biến môi trường override giá trị mặc định."""

    def test_scalar_fields_are_overridden(self, monkeypatch):
        monkeypatch.setenv("APP_NAME", "custom-ai-service")
        monkeypatch.setenv("APP_PORT", "9099")
        monkeypatch.setenv("API_PREFIX", "/api/v2")
        monkeypatch.setenv("SERVICE_NAME", "custom-service")

        settings = _settings()

        assert settings.app_name == "custom-ai-service"
        assert settings.app_port == 9099
        assert settings.api_prefix == "/api/v2"
        assert settings.service_name == "custom-service"

    def test_int_field_parses_numeric_string(self, monkeypatch):
        monkeypatch.setenv("VECTOR_SIZE", "768")

        assert _settings().vector_size == 768

    def test_vector_db_fields_are_overridden(self, monkeypatch):
        monkeypatch.setenv("VECTOR_DB_PROVIDER", "qdrant")
        monkeypatch.setenv("VECTOR_COLLECTION", "custom_movies")
        monkeypatch.setenv("VECTOR_DB_URL", "http://vector-db:6333")
        monkeypatch.setenv("EMBEDDING_MODEL_NAME", "custom-model-v2")

        settings = _settings()

        assert settings.vector_db_provider == "qdrant"
        assert settings.vector_collection == "custom_movies"
        assert settings.vector_db_url == "http://vector-db:6333"
        assert settings.embedding_model_name == "custom-model-v2"

    def test_otel_enabled_can_be_turned_on_from_env(self, monkeypatch):
        # conftest ép OTEL_ENABLED=false để test không tạo exporter thật.
        monkeypatch.setenv("OTEL_ENABLED", "true")

        settings = _settings()

        assert settings.otel_enabled is True
        assert settings.otel_exporter_url == "http://localhost:4318"

    def test_init_kwargs_win_over_env(self, monkeypatch):
        monkeypatch.setenv("APP_PORT", "9099")

        assert _settings(app_port=1234).app_port == 1234

    def test_unknown_env_var_is_ignored(self, monkeypatch):
        monkeypatch.setenv("TOTALLY_UNKNOWN_SETTING_XYZ", "whatever")

        settings = _settings()

        assert settings.app_name == "movie-recommendation-ai-service"

    def test_missing_required_jwt_fields_raise_validation_error(self, monkeypatch):
        monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
        monkeypatch.delenv("JWT_ALGORITHM", raising=False)

        with pytest.raises(ValidationError) as exc_info:
            _settings()

        missing = {error["loc"][0] for error in exc_info.value.errors()}
        assert missing == {"jwt_secret_key", "jwt_algorithm"}

    def test_invalid_int_raises_validation_error(self, monkeypatch):
        monkeypatch.setenv("APP_PORT", "not-a-number")

        with pytest.raises(ValidationError):
            _settings()

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("true", True),
            ("True", True),
            ("1", True),
            ("yes", True),
            ("on", True),
            ("false", False),
            ("False", False),
            ("0", False),
            ("no", False),
            ("off", False),
        ],
    )
    def test_boolean_env_parsing(self, monkeypatch, raw, expected):
        monkeypatch.setenv("OTEL_ENABLED", raw)

        assert _settings().otel_enabled is expected

    def test_invalid_boolean_raises_validation_error(self, monkeypatch):
        monkeypatch.setenv("OTEL_ENABLED", "maybe")

        with pytest.raises(ValidationError):
            _settings()


class TestSettingsAllowedOrigins:
    """``CORS_ORIGINS`` là chuỗi phân tách bằng dấu phẩy → ``allowed_origins``."""

    @pytest.mark.parametrize(
        ("raw", "expected"),
        [
            ("http://a,http://b", ["http://a", "http://b"]),
            ("http://a, http://b", ["http://a", "http://b"]),
            ("  http://a  ,  http://b  ", ["http://a", "http://b"]),
            ("http://a,", ["http://a"]),
            (",http://a,,http://b,", ["http://a", "http://b"]),
            ("http://only-one", ["http://only-one"]),
            ("", []),
            ("   ", []),
            (",,,", []),
        ],
    )
    def test_parse_comma_separated_origins(self, monkeypatch, raw, expected):
        monkeypatch.setenv("CORS_ORIGINS", raw)

        assert _settings().allowed_origins == expected

    def test_allowed_origins_reflects_assignment(self):
        settings = _settings()
        settings.cors_origins = " https://a.com , , https://b.com "

        assert settings.allowed_origins == ["https://a.com", "https://b.com"]


class TestGetSettings:
    """``get_settings`` được bọc ``lru_cache``."""

    def test_returns_settings_instance(self):
        assert isinstance(get_settings(), Settings)

    def test_returns_same_instance_when_cached(self):
        first = get_settings()
        second = get_settings()

        assert first is second
        assert get_settings.cache_info().hits >= 1

    def test_cache_clear_returns_new_instance(self):
        first = get_settings()
        get_settings.cache_clear()
        second = get_settings()

        assert first is not second

    def test_env_change_ignored_until_cache_clear(self, monkeypatch):
        monkeypatch.setenv("APP_NAME", "before-clear")
        assert get_settings().app_name == "before-clear"

        monkeypatch.setenv("APP_NAME", "after-clear")
        # Cache vẫn trả instance cũ dù env đã đổi.
        assert get_settings().app_name == "before-clear"

        get_settings.cache_clear()
        assert get_settings().app_name == "after-clear"

    def test_get_settings_reads_required_jwt_from_environment(self):
        settings = get_settings()

        assert settings.jwt_secret_key
        assert settings.jwt_algorithm == "HS256"
