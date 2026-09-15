from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "movie-recommendation-ai-service"
    app_version: str = "0.1.0"
    app_port: int = 8082
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:3000,http://localhost:8081"

    service_name: str = "ai-service"
    otel_exporter_url: str = "http://localhost:4317"
    otel_enabled: bool = False

    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"
    rabbitmq_exchange: str = "movie.events"
    rabbitmq_exchange_type: str = "topic"
    rabbitmq_queue: str = "ai-service.movie-events"
    rabbitmq_enabled: bool = False
    movie_event_routing_key: str = "movie.#"
    interaction_event_routing_key: str = "user.interaction.#"

    redis_url: str = "redis://localhost:6379/0"
    redis_enabled: bool = False
    redis_key_prefix: str = "movie-recommendation:"

    vector_db_url: str = "http://localhost:6333"
    vector_db_api_key: str | None = None
    vector_db_provider: str = "qdrant"
    vector_collection: str = "movies"
    vector_size: int = 384
    vector_db_enabled: bool = False

    model_train_cron: str = "0 3 * * 0"
    model_train_enabled: bool = False

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.development", ".env.production"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()