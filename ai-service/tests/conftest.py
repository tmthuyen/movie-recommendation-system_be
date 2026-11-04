"""Fixture & helper dùng chung cho toàn bộ unit test của ``ai-service``.

Mục tiêu:
- Thiết lập biến môi trường bắt buộc **trước khi** bất kỳ module ``src.*`` nào
  được import (``Settings`` yêu cầu ``JWT_SECRET_KEY`` / ``JWT_ALGORITHM``).
- Vô hiệu hoá các dependency bên ngoài (RabbitMQ, Redis, vector DB, R2, OTel)
  để unit test không bao giờ mở kết nối thật.
- Cung cấp mock nhẹ cho các dependency nặng: ``FakeChroma`` (vector store) và
  ``FakeModel`` (SentenceTransformer).
- Đảm bảo thư mục ``logs/`` ghi được vì ``utils.logger.setup_logger`` tạo file
  log ngay khi logger được khởi tạo.

Lưu ý: ``boto3`` không có trong môi trường Python global dùng để chạy test,
trong khi ``services.storage_service`` import nó ở module level. Ta cài một
stub tối thiểu vào ``sys.modules`` (không kết nối mạng) để import được module
mà không phải sửa code production.
"""

import hashlib
import importlib.machinery
import logging
import math
import os
import sys
import types
import uuid
from pathlib import Path

import numpy as np
import pytest

from core.config import get_settings

# Thiết lập encoding UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Thiết lập biến môi trường bắt buộc cho Pydantic Settings trong unit tests
# os.environ.setdefault("JWT_SECRET_KEY", "test-jwt-secret-key-32-chars-minimum!!")
# os.environ.setdefault("JWT_ALGORITHM", "HS256")
# os.environ.setdefault("VECTOR_DB_PROVIDER", "memory")
# os.environ.setdefault("RABBITMQ_ENABLED", "false")
# os.environ.setdefault("REDIS_ENABLED", "false")
# os.environ.setdefault("OTEL_ENABLED", "false")

# ─────────────────────────────────────────────────────────────────────────────
# 1. Biến môi trường
# ─────────────────────────────────────────────────────────────────────────────

os.environ["JWT_SECRET_KEY"] = "unit-test-jwt-secret"
os.environ["JWT_ALGORITHM"] = "HS256"
os.environ["RABBITMQ_ENABLED"] = "false"
os.environ["REDIS_ENABLED"] = "false"
os.environ["VECTOR_DB_ENABLED"] = "false"
os.environ["MODEL_TRAIN_ENABLED"] = "false"
os.environ["OTEL_ENABLED"] = "false"
# R2/S3: để rỗng ⇒ StorageService.is_enabled = False, không tạo boto3 client.
for _s3_key in ("S3_ENDPOINT", "S3_ACCESS_KEY", "S3_SECRET_KEY"):
    os.environ[_s3_key] = ""


def _install_boto3_stub() -> None:
    """Cài stub ``boto3``/``botocore`` nếu môi trường không có (chỉ cho test)."""
    try:
        import boto3  # noqa: F401
    except ImportError:
        pass
    else:
        return

    boto3 = types.ModuleType("boto3")
    boto3.__spec__ = importlib.machinery.ModuleSpec("boto3", None)
    boto3.client = lambda *args, **kwargs: None
    sys.modules["boto3"] = boto3

    botocore = types.ModuleType("botocore")
    botocore.__spec__ = importlib.machinery.ModuleSpec("botocore", None)
    botocore.__path__ = []  # cho phép import botocore.exceptions

    exceptions = types.ModuleType("botocore.exceptions")
    exceptions.__spec__ = importlib.machinery.ModuleSpec("botocore.exceptions", None)

    class ClientError(Exception):
        pass

    exceptions.ClientError = ClientError
    botocore.exceptions = exceptions
    sys.modules["botocore"] = botocore
    sys.modules["botocore.exceptions"] = exceptions


_install_boto3_stub()


# ─────────────────────────────────────────────────────────────────────────────
# 2. Mock dependency nặng
# ─────────────────────────────────────────────────────────────────────────────


class FakeChroma:
    """Vector store in-memory thay cho ChromaDB/VectorStore.

    Hỗ trợ đúng các method mà production code gọi:
    ``start``, ``upsert``, ``get_by_id``, ``query``, ``close``.
    Ghi lại mọi lần upsert để test assert.
    """

    def __init__(self) -> None:
        # collection -> {id: {"vector": list[float], "payload": dict}}
        self._collections: dict[str, dict[int, dict]] = {}
        self.upserts: list[dict] = []
        self.started = False
        self.closed = False

    async def start(self) -> None:
        self.started = True

    async def close(self) -> None:
        self.closed = True

    def seed(
        self,
        item_id: int,
        vector: list[float],
        payload: dict | None = None,
        collection_name: str = "default",
    ) -> None:
        """Nạp sẵn dữ liệu (dùng trong test) — không tính là một lần upsert."""
        self._collections.setdefault(collection_name, {})[item_id] = {
            "vector": list(vector),
            "payload": dict(payload or {}),
        }

    async def upsert(
        self,
        movie_id: int,
        vector: list[float],
        payload: dict,
        collection_name: str | None = None,
    ) -> None:
        name = collection_name or "default"
        self._collections.setdefault(name, {})[movie_id] = {
            "vector": list(vector),
            "payload": dict(payload),
        }
        self.upserts.append(
            {
                "movie_id": movie_id,
                "vector": list(vector),
                "payload": dict(payload),
                "collection_name": collection_name,
            }
        )

    async def get_by_id(
        self, movie_id: int, collection_name: str | None = None
    ) -> dict | None:
        item = self._collections.get(collection_name or "default", {}).get(movie_id)
        if item is None:
            return None
        return {
            "id": movie_id,
            "vector": list(item["vector"]),
            "payload": dict(item["payload"]),
        }

    async def query(
        self,
        vector: list[float],
        top_k: int = 10,
        where: dict | None = None,
        collection_name: str | None = None,
    ) -> list[dict]:
        items = self._collections.get(collection_name or "default", {})
        results = []
        for item_id, item in items.items():
            if where and any(item["payload"].get(k) != v for k, v in where.items()):
                continue
            results.append(
                {
                    "id": item_id,
                    "score": _cosine(vector, item["vector"]),
                    "payload": dict(item["payload"]),
                }
            )
        results.sort(key=lambda row: row["score"], reverse=True)
        return results[:top_k]


class FakeModel:
    """SentenceTransformer giả: encode deterministic, không load torch/model."""

    def __init__(self, dim: int = 8) -> None:
        self.dim = dim
        self.encoded: list[str] = []

    def get_sentence_embedding_dimension(self) -> int:
        return self.dim

    def encode(self, text: str, normalize_embeddings: bool = False):

        self.encoded.append(text)
        digest = hashlib.sha256(text.encode("utf-8")).digest()
        values = [(byte / 255.0) * 2.0 - 1.0 for byte in digest[: self.dim]]
        vector = np.array(values, dtype=float)
        if normalize_embeddings:
            norm = float(np.linalg.norm(vector))
            if norm > 0:
                vector = vector / norm
        return vector


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    norm_a = math.sqrt(sum(x * x for x in a))
    norm_b = math.sqrt(sum(y * y for y in b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Fixtures
# ─────────────────────────────────────────────────────────────────────────────


@pytest.fixture(scope="session", autouse=True)
def project_logs_dir() -> Path:
    """Đảm bảo ``logs/`` tồn tại & ghi được (logger tạo file ngay khi setup)."""
    logs = Path("logs")
    logs.mkdir(parents=True, exist_ok=True)
    probe = logs / ".pytest_write_probe"
    probe.write_text("ok", encoding="utf-8")
    probe.unlink()
    return logs


@pytest.fixture
def logs_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Chạy test trong thư mục tạm để logger ghi ``logs/`` vào ``tmp_path``."""
    monkeypatch.chdir(tmp_path)
    logs = tmp_path / "logs"
    logs.mkdir()
    return logs


@pytest.fixture
def unique_logger_name():
    """Tên logger duy nhất + dọn sạch handler/file sau khi test kết thúc."""

    name = f"pytest-logger-{uuid.uuid4().hex}"
    yield name
    logger = logging.getLogger(name)
    for handler in list(logger.handlers):
        handler.close()
        logger.removeHandler(handler)


@pytest.fixture
def settings():
    """Settings thật nhưng đã bị ép tắt mọi external service trong conftest."""

    return get_settings()


@pytest.fixture
def storage_tmp_dir(tmp_path: Path) -> Path:
    """Thư mục tạm dùng cho file mapping/storage (không đụng ``data/`` thật)."""
    directory = tmp_path / "storage"
    directory.mkdir()
    return directory


@pytest.fixture
def fake_chroma() -> FakeChroma:
    return FakeChroma()


@pytest.fixture
def fake_model() -> FakeModel:
    return FakeModel()
