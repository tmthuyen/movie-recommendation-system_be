from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "movie-recommendation-ai-service"
    app_version: str = "0.1.0"
    app_port: int = 8082
    api_prefix: str = "/api/recommendations"
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    jwt_secret_key: str
    jwt_algorithm: str

    service_name: str = "ai-service"
    otel_exporter_url: str = "http://localhost:4318"
    otel_enabled: bool = True

    rabbitmq_url: str = "amqp://guest:guest@localhost:5672/"
    rabbitmq_exchange: str = "movie.events"
    rabbitmq_exchange_type: str = "topic"
    rabbitmq_queue: str = "recommendation.queue"
    rabbitmq_dlx: str = "recommendation.dlx"
    rabbitmq_dlq: str = "recommendation.dlq"
    rabbitmq_enabled: bool = True
    movie_event_routing_key: str = "movie.#"
    interaction_event_routing_key: str = "user.interaction.#"

    redis_url: str = "redis://localhost:6379/0"
    redis_enabled: bool = True
    redis_key_prefix: str = "movie-recommendation:"

    vector_db_url: str = "http://localhost:6333"
    vector_db_api_key: str | None = None
    # Set to "chroma" | "qdrant" | "redis" | "memory"
    vector_db_provider: str = "chroma"
    vector_collection: str = "movies"
    # Dimension of paraphrase-multilingual-MiniLM-L12-v2 (multilingual, 384-dim)
    vector_size: int = 384
    vector_db_enabled: bool = True

    # ChromaDB — persistent storage directory (relative to ai-service working dir)
    chroma_persist_dir: str = "./data/chroma_db"

    # SBERT model used for embedding (also referenced by build_vector_db.py)
    embedding_model_name: str = "paraphrase-multilingual-MiniLM-L12-v2"

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
