"""
services/bm25_index_service.py
Index BM25 (Lexical) dùng cho nhánh Lexical của Hybrid Search (BM25 + Semantic, RRF).

- Build offline từ corpus PostgreSQL (``scripts/build_bm25_index.py``), lưu model +
  ánh xạ movie_id + manifest (corpus fingerprint) vào ``data/bm25/``.
- Runtime: ``Bm25IndexService.load()`` nạp một lần trong FastAPI lifespan,
  ``SearchRerankService`` gọi ``search_async`` để lấy danh sách ứng viên Lexical.
"""

from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from core.tokenizer import BaseTokenizer
from data.data_loader import compute_corpus_fingerprint
from models.bm25_search import BM25Recommender
from utils import setup_logger

logger = setup_logger(name=__name__, filename=__name__)

MANIFEST_FILE = "bm25_manifest.json"
MODEL_FILE = "bm25_model.joblib"
IDS_FILE = "movie_ids.joblib"


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
    """True nếu index chưa tồn tại / thiếu file / fingerprint corpus đã đổi → cần train lại."""
    model_dir = Path(model_dir)
    manifest = read_manifest(model_dir)
    if manifest is None:
        return True
    if not (model_dir / MODEL_FILE).is_file() or not (model_dir / IDS_FILE).is_file():
        return True
    return manifest.get("corpus_fingerprint") != corpus_fingerprint


def build_bm25_index(
    corpus: list[str],
    movie_ids: list[int],
    output_dir: str | Path,
    tokenizer: BaseTokenizer,
    source: str = "unknown",
) -> dict[str, Any]:
    """Train BM25 trên ``corpus`` rồi lưu model + movie_ids + manifest vào ``output_dir``."""
    if len(corpus) != len(movie_ids):
        raise ValueError("corpus và movie_ids phải cùng độ dài")
    if not corpus:
        raise ValueError("corpus rỗng, không thể build BM25")

    ids = [int(mid) for mid in movie_ids]
    model = BM25Recommender(tokenizer=tokenizer)
    model.fit(corpus, ids)
    model.save(str(output_dir))

    manifest = {
        "corpus_fingerprint": compute_corpus_fingerprint(corpus, ids),
        "doc_count": len(ids),
        "tokenizer": tokenizer.name(),
        "tokenizer_config_hash": tokenizer.get_config_hash(),
        "algorithm": "BM25Okapi",
        "source": source,
        "built_at": datetime.now(timezone.utc).isoformat(),
    }
    (Path(output_dir) / MANIFEST_FILE).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return manifest


class Bm25IndexService:
    """Nạp index BM25 đã build sẵn và truy vấn Lexical theo ``keyword``."""

    def __init__(
        self, model_dir: str | Path, tokenizer: BaseTokenizer | None = None
    ) -> None:
        self._model_dir = Path(model_dir)
        self._tokenizer = tokenizer
        self._model: BM25Recommender | None = None
        self._manifest: dict[str, Any] | None = None

    @property
    def is_ready(self) -> bool:
        return self._model is not None and self._model.is_fitted

    @property
    def manifest(self) -> dict[str, Any] | None:
        return self._manifest

    def load(self) -> bool:
        """Nạp model BM25. Trả ``False`` (không raise) nếu chưa build hoặc file hỏng."""
        if (
            not (self._model_dir / MODEL_FILE).is_file()
            or not (self._model_dir / IDS_FILE).is_file()
        ):
            logger.warning(
                "BM25 index chua duoc build tai %s. Chay: python scripts/build_bm25_index.py",
                self._model_dir,
            )
            return False

        try:
            if self._tokenizer is None:
                # Chỉ khởi tạo tokenizer mặc định (cấu hình đã nghiệm thu ở P1) khi thật sự cần.
                from core.tokenizer import UndertheseaTokenizer

                self._tokenizer = UndertheseaTokenizer()
            model = BM25Recommender(tokenizer=self._tokenizer)
            model.load(str(self._model_dir))
        except Exception as exc:  # noqa: BLE001 - file hỏng không được làm sập server
            logger.error("Khong the nap BM25 index: %s", exc)
            return False

        self._model = model
        self._manifest = read_manifest(self._model_dir)
        logger.info(
            "Da nap BM25 index: %s phim.",
            (self._manifest or {}).get("doc_count", len(model.movie_ids)),
        )
        return True

    def search(self, query: str, top_k: int = 50) -> list[dict[str, Any]]:
        """Trả ``[{"movie_id": int, "score": float}]`` giảm dần theo điểm BM25 (> 0)."""
        if not self.is_ready or self._model is None:
            return []
        keyword = (query or "").strip()
        if not keyword:
            return []
        return [
            {"movie_id": int(hit["movie_id"]), "score": float(hit["score"])}
            for hit in self._model.search(keyword, top_k=top_k)
        ]

    async def search_async(self, query: str, top_k: int = 50) -> list[dict[str, Any]]:
        """Chạy ``search`` ở thread riêng để không chặn event loop của FastAPI."""
        return await asyncio.to_thread(self.search, query, top_k)
