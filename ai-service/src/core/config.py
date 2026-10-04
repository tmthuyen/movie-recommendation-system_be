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
    rabbitmq_enabled: bool = True

    # Exchange
    rabbitmq_movie_exchange: str = "movie.exchange"

    # Queue AI Service lắng nghe
    rabbitmq_recommendation_queue: str = "recommendation.queue"

    # Dead Letter Exchange & Queue (nhận message thất bại sau khi hết retry)
    rabbitmq_recommendation_dlx: str = "recommendation.queue.dlx"
    rabbitmq_recommendation_dlq: str = "recommendation.queue.dlq"
    # dlq routing key
    rabbitmq_recommendation_dlq_routing_key: str = "recommendation.queue.dlq.rk"
    # Số lần retry tối đa trước khi đẩy vào DLQ
    rabbitmq_max_retry: int = 3

    # Routing key AI Service subscribe
    rabbitmq_movie_routing_key: str = "movie.#"

    # Interaction Exchange & Queue
    rabbitmq_interaction_exchange: str = "interaction.exchange"
    rabbitmq_interaction_queue: str = "interaction.queue"
    rabbitmq_interaction_dlx: str = "interaction.queue.dlx"
    rabbitmq_interaction_dlq: str = "interaction.queue.dlq"
    rabbitmq_interaction_dlq_routing_key: str = "interaction.queue.dlq.rk"
    rabbitmq_interaction_routing_key: str = "interaction.event"



    redis_url: str = "redis://localhost:6379/0"
    redis_enabled: bool = True
    redis_key_prefix: str = "movie-recommendation:"

    vector_db_url: str = "http://localhost:6333"
    vector_db_api_key: str | None = None
    # Set to "chroma" | "qdrant" | "redis" | "memory"
    vector_db_provider: str = "chroma"
    vector_collection: str = "movies"
    
    # AI Collaborative & Hybrid Collections
    vector_user_cf_collection: str = "user_cf_vectors"
    vector_movie_cf_collection: str = "movie_cf_vectors"
    vector_user_profile_collection: str = "user_profile_vectors"
    
    # Dimension of paraphrase-multilingual-MiniLM-L12-v2 (multilingual, 384-dim)
    vector_size: int = 384
    cf_vector_size: int = 64 # Kích thước vector của ALS model (implicit)
    
    vector_db_enabled: bool = True

    # ChromaDB — persistent storage directory (relative to ai-service working dir)
    chroma_persist_dir: str = "./data/chroma_db"

    # SBERT model used for embedding (also referenced by build_vector_db.py)
    embedding_model_name: str = "paraphrase-multilingual-MiniLM-L12-v2"

    model_train_cron: str = "0 3 * * 0"
    model_train_enabled: bool = False

    # Storage R2 Configuration
    s3_region: str = "auto"
    s3_token: str = ""
    s3_endpoint: str = ""
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_bucket_name: str = "movie-recommendation"
    s3_public_url: str = ""


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
