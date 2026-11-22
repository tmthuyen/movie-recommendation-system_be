"""
services/bm25_index_service.py
Index BM25 (Lexical) trên Qdrant Sparse Vector (``Modifier.IDF``) dùng cho nhánh
Lexical của Hybrid Search (BM25 + Semantic, RRF) kèm quản lý CRUD (Thêm / Sửa / Xoá).

- Build ban đầu từ corpus PostgreSQL (``scripts/build_bm25_index.py``), lưu snapshot
  Qdrant sparse points + manifest (corpus fingerprint) vào ``data/bm25/`` và đồng bộ
  lên Qdrant Server (nếu cấu hình ``bm25_qdrant_url``).
- Runtime: ``Bm25IndexService.load()`` khởi tạo collection Qdrant ``movies_bm25`` với
  ``SparseVectorParams(modifier=Modifier.IDF)`` một lần trong FastAPI lifespan.
  Nếu không có Qdrant Server từ xa, tự động nạp in-memory từ snapshot đĩa để server
  luôn hoạt động ổn định và sẵn sàng phục vụ.
- CRUD thời gian thực: ``upsert_movie`` / ``delete_movie`` cập nhật trực tiếp point
  trên Qdrant và lưu đồng bộ xuống snapshot khi nhận event RabbitMQ
  (``movie.created``, ``movie.updated``, ``movie.deleted``).
"""

from __future__ import annotations

import asyncio
import json
import zlib
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
from qdrant_client import QdrantClient, models

from core.tokenizer import BaseTokenizer
from data.data_loader import build_search_text as _build_search_text
from data.data_loader import compute_corpus_fingerprint
from utils import setup_logger

logger = setup_logger(name=__name__, filename=__name__)

MANIFEST_FILE = "bm25_manifest.json"
QDRANT_SNAPSHOT_FILE = "bm25_qdrant_points.joblib"
IDS_FILE = "movie_ids.joblib"

DEFAULT_COLLECTION = "movies_bm25"
SPARSE_VECTOR_NAME = "bm25"
BM25_K1 = 1.5
BM25_B = 0.75
UPSERT_BATCH_SIZE = 1000


def token_to_sparse_id(token: str) -> int:
    """Ánh xạ tất định một token sang chỉ số nguyên dương 31-bit cho Qdrant SparseVector."""
    return zlib.crc32(token.encode("utf-8")) & 0x7FFFFFFF


def compute_doc_sparse_vector(
    tokens: list[str],
    avgdl: float,
    k1: float = BM25_K1,
    b: float = BM25_B,
) -> tuple[list[int], list[float]]:
    """Tính trọng số TF bão hoà của Okapi BM25 cho một tài liệu (phần IDF do Qdrant tính)."""
    clean_tokens = [t for t in tokens if t and t.strip()]
    if not clean_tokens:
        return [], []

    doc_len = len(clean_tokens)
    safe_avgdl = max(float(avgdl), 1.0)
    counts = Counter(token_to_sparse_id(t) for t in clean_tokens)

    indices: list[int] = []
    values: list[float] = []
    for tid, freq in sorted(counts.items()):
        denom = freq + k1 * (1.0 - b + b * (doc_len / safe_avgdl))
        weight = (freq * (k1 + 1.0)) / denom if denom > 0 else 0.0
        if weight > 0:
            indices.append(int(tid))
            values.append(round(float(weight), 6))
    return indices, values


def compute_query_sparse_vector(tokens: list[str]) -> tuple[list[int], list[float]]:
    """Tính SparseVector cho câu truy vấn (trọng số tần suất từ trong câu truy vấn)."""
    clean_tokens = [t for t in tokens if t and t.strip()]
    if not clean_tokens:
        return [], []

    counts = Counter(token_to_sparse_id(t) for t in clean_tokens)
    indices: list[int] = []
    values: list[float] = []
    for tid, freq in sorted(counts.items()):
        indices.append(int(tid))
        values.append(float(freq))
    return indices, values


def read_manifest(model_dir: str | Path) -> dict[str, Any] | None:
    """Đọc manifest của index BM25; ``None`` nếu chưa có hoặc hỏng."""
    path = Path(model_dir) / MANIFEST_FILE
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def is_index_stale(model_dir: str | Path, corpus_fingerprint: str) -> bool:
    """True nếu index chưa tồn tại / thiếu file snapshot Qdrant / fingerprint corpus đã đổi."""
    model_dir = Path(model_dir)
    manifest = read_manifest(model_dir)
    if manifest is None:
        return True
    if (
        not (model_dir / QDRANT_SNAPSHOT_FILE).is_file()
        or not (model_dir / IDS_FILE).is_file()
    ):
        return True
    return manifest.get("corpus_fingerprint") != corpus_fingerprint


def _ensure_qdrant_bm25_collection(
    client: QdrantClient, collection_name: str, recreate: bool = False
) -> None:
    """Đảm bảo collection Qdrant tồn tại với cấu hình SparseVector Modifier.IDF."""
    existing = {c.name for c in client.get_collections().collections}
    if recreate and collection_name in existing:
        client.delete_collection(collection_name=collection_name)
        existing.remove(collection_name)

    if collection_name not in existing:
        client.create_collection(
            collection_name=collection_name,
            vectors_config={},
            sparse_vectors_config={
                SPARSE_VECTOR_NAME: models.SparseVectorParams(
                    modifier=models.Modifier.IDF
                )
            },
        )


def _upsert_records_to_qdrant(
    client: QdrantClient,
    collection_name: str,
    records: list[dict[str, Any]],
) -> None:
    """Upsert danh sách bản ghi sparse vector vào Qdrant theo từng batch."""
    for start in range(0, len(records), UPSERT_BATCH_SIZE):
        batch = records[start : start + UPSERT_BATCH_SIZE]
        points = [
            models.PointStruct(
                id=int(rec["movie_id"]),
                vector={
                    SPARSE_VECTOR_NAME: models.SparseVector(
                        indices=rec["indices"],
                        values=rec["values"],
                    )
                },
                payload={
                    "movie_id": int(rec["movie_id"]),
                    "doc_len": int(rec.get("doc_len", 0)),
                },
            )
            for rec in batch
        ]
        if points:
            client.upsert(collection_name=collection_name, points=points)


def build_bm25_index(
    corpus: list[str],
    movie_ids: list[int],
    output_dir: str | Path,
    tokenizer: BaseTokenizer,
    source: str = "unknown",
    qdrant_url: str | None = None,
    qdrant_api_key: str | None = None,
    collection_name: str = DEFAULT_COLLECTION,
) -> dict[str, Any]:
    """Tính toán BM25 Sparse Vectors trên ``corpus``, lưu snapshot Qdrant + đồng bộ Qdrant Server."""
    if len(corpus) != len(movie_ids):
        raise ValueError("corpus và movie_ids phải cùng độ dài")
    if not corpus:
        raise ValueError("corpus rỗng, không thể build BM25")

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    ids = [int(mid) for mid in movie_ids]
    tokenized_corpus = [tokenizer.tokenize(doc) for doc in corpus]
    total_tokens = sum(len(tokens) for tokens in tokenized_corpus)
    avgdl = total_tokens / len(tokenized_corpus) if tokenized_corpus else 1.0

    records: list[dict[str, Any]] = []
    for mid, tokens in zip(ids, tokenized_corpus):
        indices, values = compute_doc_sparse_vector(tokens, avgdl=avgdl)
        records.append(
            {
                "movie_id": mid,
                "indices": indices,
                "values": values,
                "doc_len": len(tokens),
            }
        )

    snapshot_payload = {
        "avgdl": float(avgdl),
        "k1": BM25_K1,
        "b": BM25_B,
        "collection_name": collection_name,
        "records": records,
    }
    joblib.dump(snapshot_payload, output_path / QDRANT_SNAPSHOT_FILE)
    joblib.dump(ids, output_path / IDS_FILE)

    # Nếu có cấu hình Qdrant Server URL thì đồng bộ trực tiếp lên Qdrant Server
    if qdrant_url:
        try:
            remote_client = QdrantClient(
                url=qdrant_url, api_key=qdrant_api_key, timeout=10.0
            )
            _ensure_qdrant_bm25_collection(
                remote_client, collection_name, recreate=True
            )
            _upsert_records_to_qdrant(remote_client, collection_name, records)
            remote_client.close()
            logger.info(
                "Da dong bo %d BM25 sparse points len Qdrant Server (%s)",
                len(records),
                qdrant_url,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Khong the dong bo len Qdrant Server (%s), da luu snapshot tai %s: %s",
                qdrant_url,
                output_path,
                exc,
            )

    manifest = {
        "corpus_fingerprint": compute_corpus_fingerprint(corpus, ids),
        "doc_count": len(ids),
        "avgdl": round(float(avgdl), 4),
        "tokenizer": tokenizer.name(),
        "tokenizer_config_hash": tokenizer.get_config_hash(),
        "algorithm": "Qdrant-BM25-Sparse-IDF",
        "collection_name": collection_name,
        "source": source,
        "built_at": datetime.now(timezone.utc).isoformat(),
    }
    (output_path / MANIFEST_FILE).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest


class Bm25IndexService:
    """Quản lý tìm kiếm và CRUD (Thêm / Sửa / Xoá) cho BM25 trên Qdrant Sparse Vector."""

    def __init__(
        self,
        model_dir: str | Path,
        tokenizer: BaseTokenizer | None = None,
        qdrant_url: str | None = None,
        qdrant_api_key: str | None = None,
        collection_name: str | None = None,
        qdrant_client: QdrantClient | None = None,
    ) -> None:
        from core.config import get_settings

        cfg = get_settings()
        self._model_dir = Path(model_dir)
        self._tokenizer = tokenizer
        self._qdrant_url = qdrant_url if qdrant_url is not None else cfg.bm25_qdrant_url
        self._qdrant_api_key = (
            qdrant_api_key if qdrant_api_key is not None else cfg.bm25_qdrant_api_key
        )
        self._collection_name = (
            collection_name or cfg.bm25_qdrant_collection or DEFAULT_COLLECTION
        )
        self._client: QdrantClient | None = qdrant_client
        self._manifest: dict[str, Any] | None = None
        self._records_by_id: dict[int, dict[str, Any]] = {}
        self._avgdl: float = 50.0
        self._is_ready: bool = False

    @property
    def is_ready(self) -> bool:
        return self._is_ready and self._client is not None

    @property
    def manifest(self) -> dict[str, Any] | None:
        return self._manifest

    @property
    def collection_name(self) -> str:
        return self._collection_name

    def _get_tokenizer(self) -> BaseTokenizer:
        if self._tokenizer is None:
            from core.tokenizer import UndertheseaTokenizer

            self._tokenizer = UndertheseaTokenizer()
        return self._tokenizer

    def _init_qdrant_client(self) -> QdrantClient:
        if self._client is not None:
            return self._client

        if self._qdrant_url:
            try:
                remote = QdrantClient(
                    url=self._qdrant_url,
                    api_key=self._qdrant_api_key,
                    timeout=5.0,
                )
                remote.get_collections()
                self._client = remote
                logger.info("Ket noi Qdrant BM25 Server tai %s", self._qdrant_url)
                return self._client
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "Khong ket noi duoc Qdrant Server (%s), dung Qdrant in-memory: %s",
                    self._qdrant_url,
                    exc,
                )

        self._client = QdrantClient(":memory:")
        return self._client

    def load(self) -> bool:
        """Nạp index BM25 vào Qdrant. Trả ``False`` (không raise) nếu chưa có dữ liệu."""
        snapshot_path = self._model_dir / QDRANT_SNAPSHOT_FILE
        if not snapshot_path.is_file():
            logger.warning(
                "BM25 Qdrant snapshot chua duoc build tai %s. Chay: python scripts/build_bm25_index.py",
                self._model_dir,
            )
            return False

        try:
            self._get_tokenizer()
            snapshot = joblib.load(snapshot_path)
            records: list[dict[str, Any]] = snapshot.get("records", [])
            self._avgdl = float(snapshot.get("avgdl", 50.0)) or 50.0
            self._records_by_id = {int(r["movie_id"]): r for r in records}

            client = self._init_qdrant_client()
            _ensure_qdrant_bm25_collection(
                client, self._collection_name, recreate=False
            )
            current_count = client.count(
                collection_name=self._collection_name, exact=True
            ).count
            if current_count != len(records):
                _ensure_qdrant_bm25_collection(
                    client, self._collection_name, recreate=True
                )
                _upsert_records_to_qdrant(client, self._collection_name, records)
        except Exception as exc:  # noqa: BLE001 - lỗi không được làm sập server
            logger.error("Khong the nap BM25 Qdrant index: %s", exc)
            self._is_ready = False
            return False

        self._manifest = read_manifest(self._model_dir)
        self._is_ready = True
        logger.info(
            "Da nap BM25 Qdrant index (%s): %s phim.",
            self._collection_name,
            len(self._records_by_id),
        )
        return True

    def _recompute_avgdl(self) -> None:
        if not self._records_by_id:
            return
        total_len = sum(int(r.get("doc_len", 0)) for r in self._records_by_id.values())
        if total_len > 0:
            self._avgdl = total_len / len(self._records_by_id)

    def _persist_snapshot(self) -> None:
        """Lưu trạng thái hiện tại xuống đĩa để đồng bộ khi thêm/sửa/xoá phim."""
        try:
            self._model_dir.mkdir(parents=True, exist_ok=True)
            records = list(self._records_by_id.values())
            ids = [int(r["movie_id"]) for r in records]
            snapshot_payload = {
                "avgdl": float(self._avgdl),
                "k1": BM25_K1,
                "b": BM25_B,
                "collection_name": self._collection_name,
                "records": records,
            }
            joblib.dump(snapshot_payload, self._model_dir / QDRANT_SNAPSHOT_FILE)
            joblib.dump(ids, self._model_dir / IDS_FILE)
            if self._manifest is not None:
                self._manifest["doc_count"] = len(ids)
                self._manifest["avgdl"] = round(float(self._avgdl), 4)
                self._manifest["updated_at"] = datetime.now(timezone.utc).isoformat()
                (self._model_dir / MANIFEST_FILE).write_text(
                    json.dumps(self._manifest, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Khong the luu BM25 snapshot xuong dia: %s", exc)

    def upsert_movie(
        self,
        movie_data_or_id: dict[str, Any] | int,
        search_text: str | None = None,
    ) -> bool:
        """Thêm mới hoặc cập nhật (Update) một bộ phim trong Qdrant BM25 collection.

        Hỗ trợ truyền:
        - ``upsert_movie(movie_data_dict)`` (chứa ``movieId``, ``title``, ``overview``, ``genres``...)
        - ``upsert_movie(movie_id, "chuỗi văn bản phim")``
        """
        if isinstance(movie_data_or_id, dict):
            raw_id = (
                movie_data_or_id.get("movieId")
                or movie_data_or_id.get("movie_id")
                or movie_data_or_id.get("id")
            )
            if raw_id is None:
                raise ValueError("movie_data phải chứa trường 'movieId'")
            movie_id = int(raw_id)
            text = (
                search_text
                if search_text is not None
                else _build_search_text(movie_data_or_id)
            )
        else:
            movie_id = int(movie_data_or_id)
            text = search_text or ""

        if not text.strip():
            logger.warning(
                "BM25 upsert_movie: movieId=%s khong co noi dung van ban, bo qua.",
                movie_id,
            )
            return False

        tokenizer = self._get_tokenizer()
        tokens = tokenizer.tokenize(text)
        indices, values = compute_doc_sparse_vector(tokens, avgdl=self._avgdl)
        if not indices:
            return False

        client = self._init_qdrant_client()
        _ensure_qdrant_bm25_collection(client, self._collection_name, recreate=False)

        record = {
            "movie_id": movie_id,
            "indices": indices,
            "values": values,
            "doc_len": len(tokens),
        }
        _upsert_records_to_qdrant(client, self._collection_name, [record])
        self._records_by_id[movie_id] = record
        self._recompute_avgdl()
        self._is_ready = True
        self._persist_snapshot()
        logger.info(
            "BM25 Qdrant upsert thanh cong movieId=%s (tokens=%d)",
            movie_id,
            len(tokens),
        )
        return True

    async def upsert_movie_async(
        self,
        movie_data_or_id: dict[str, Any] | int,
        search_text: str | None = None,
    ) -> bool:
        """Chạy ``upsert_movie`` ở thread riêng để không chặn event loop."""
        return await asyncio.to_thread(self.upsert_movie, movie_data_or_id, search_text)

    def delete_movie(self, movie_id: int) -> bool:
        """Xoá một bộ phim khỏi Qdrant BM25 collection."""
        mid = int(movie_id)
        if self._client is None:
            return False

        try:
            self._client.delete(
                collection_name=self._collection_name,
                points_selector=models.PointIdsList(points=[mid]),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("BM25 Qdrant delete movieId=%s that bai: %s", mid, exc)
            return False

        removed = self._records_by_id.pop(mid, None)
        if removed is not None:
            self._recompute_avgdl()
            self._persist_snapshot()
        logger.info("BM25 Qdrant delete thanh cong movieId=%s", mid)
        return True

    async def delete_movie_async(self, movie_id: int) -> bool:
        """Chạy ``delete_movie`` ở thread riêng để không chặn event loop."""
        return await asyncio.to_thread(self.delete_movie, movie_id)

    def count(self) -> int:
        """Số lượng phim hiện có trong Qdrant BM25 collection."""
        if not self.is_ready or self._client is None:
            return 0
        return int(
            self._client.count(collection_name=self._collection_name, exact=True).count
        )

    def search(self, query: str, top_k: int = 50) -> list[dict[str, Any]]:
        """Trả ``[{"movie_id": int, "score": float}]`` giảm dần theo điểm BM25 Qdrant (> 0)."""
        if not self.is_ready or self._client is None:
            return []
        keyword = (query or "").strip()
        if not keyword:
            return []

        tokenizer = self._get_tokenizer()
        tokens = tokenizer.tokenize(keyword)
        indices, values = compute_query_sparse_vector(tokens)
        if not indices:
            return []

        response = self._client.query_points(
            collection_name=self._collection_name,
            query=models.SparseVector(indices=indices, values=values),
            using=SPARSE_VECTOR_NAME,
            limit=max(int(top_k), 1),
        )
        return [
            {"movie_id": int(pt.id), "score": float(pt.score)}
            for pt in response.points
            if float(pt.score) > 0
        ]

    async def search_async(self, query: str, top_k: int = 50) -> list[dict[str, Any]]:
        """Chạy ``search`` ở thread riêng để không chặn event loop của FastAPI."""
        return await asyncio.to_thread(self.search, query, top_k)
