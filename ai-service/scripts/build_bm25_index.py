#!/usr/bin/env python
"""
build_bm25_index.py
===================
Build index BM25 (Lexical) cho Hybrid Search từ PostgreSQL và lưu vào ``data/bm25/``.

Chroma không lưu overview nên corpus BM25 được lấy trực tiếp từ PostgreSQL, tạo text
bằng ``build_search_text`` (cùng hàm với vector DB). Điều kiện lọc giống lexical search
cũ của backend (``searchFromDb``) để hành vi không đổi.

Usage (từ ai-service/):
    python scripts/build_bm25_index.py            # bỏ qua nếu corpus không đổi
    python scripts/build_bm25_index.py --force    # build lại bất kể fingerprint

Kết nối DB đọc từ ``.env`` (DATABASE_URL hoặc DB_HOST/DB_PORT/DB_USERNAME/DB_PASSWORD/DB_NAME).
"""

from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

_THIS_DIR = Path(__file__).resolve().parent
_AI_ROOT = _THIS_DIR.parent
_AI_SRC = _AI_ROOT / "src"
if str(_AI_SRC) not in sys.path:
    sys.path.insert(0, str(_AI_SRC))

import psycopg2  # noqa: E402
from dotenv import dotenv_values  # noqa: E402

from core.config import get_settings  # noqa: E402
from core.tokenizer import UndertheseaTokenizer  # noqa: E402
from data.data_loader import build_search_text, compute_corpus_fingerprint  # noqa: E402
from services.bm25_index_service import build_bm25_index, is_index_stale  # noqa: E402

# Cùng điều kiện "phim hợp lệ" với backend MoviesService.searchFromDb.
MOVIES_QUERY = """
SELECT m.id, m.title, m.title_vi, m.overview, m.overview_vi,
       COALESCE(string_agg(g.name, ' ' ORDER BY g.name), '') AS genres
FROM movies m
LEFT JOIN movie_genres mg ON mg.movie_id = m.id
LEFT JOIN genres g ON g.id = mg.genre_id
WHERE m.title IS NOT NULL
  AND m.title_vi IS NOT NULL
  AND m.release_date IS NOT NULL
  AND m.overview IS NOT NULL
  AND m.overview_vi IS NOT NULL
  AND m.poster_path IS NOT NULL
  AND m.backdrop_path IS NOT NULL
GROUP BY m.id
ORDER BY m.id
"""


def connect():
    env = dotenv_values(_AI_ROOT / ".env")
    url = env.get("DATABASE_URL")
    if url:
        return psycopg2.connect(url)
    return psycopg2.connect(
        host=env["DB_HOST"],
        port=env["DB_PORT"],
        user=env["DB_USERNAME"],
        password=env["DB_PASSWORD"],
        dbname=env["DB_NAME"],
    )


def load_corpus() -> tuple[list[str], list[int]]:
    with connect() as conn, conn.cursor() as cur:
        cur.execute(MOVIES_QUERY)
        rows = cur.fetchall()

    corpus: list[str] = []
    ids: list[int] = []
    for movie_id, title, title_vi, overview, overview_vi, genres in rows:
        text = build_search_text(
            {
                "title": title,
                "title_vi": title_vi,
                "overview": overview,
                "overview_vi": overview_vi,
                "genres": genres,
            }
        )
        if len(text) > 20:  # giống MovieDataLoader.load_catalog
            corpus.append(text)
            ids.append(int(movie_id))
    return corpus, ids


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build Qdrant BM25 Sparse Vector index từ PostgreSQL"
    )
    parser.add_argument(
        "--force", action="store_true", help="Build lại dù corpus không đổi"
    )
    parser.add_argument(
        "--output-dir", default=None, help="Mặc định: settings.bm25_model_path"
    )
    args = parser.parse_args()

    settings = get_settings()
    output_dir = (
        Path(args.output_dir) if args.output_dir else settings.bm25_model_path
    )

    t0 = time.time()
    corpus, ids = load_corpus()
    print(f"Da doc {len(ids):,} phim hop le tu PostgreSQL ({time.time() - t0:.1f}s)")

    fingerprint = compute_corpus_fingerprint(corpus, ids)
    if not args.force and not is_index_stale(output_dir, fingerprint):
        print(
            f"Index BM25 Qdrant con moi (fingerprint {fingerprint[:12]}...). Bo qua; dung --force de build lai."
        )
        return 0

    t1 = time.time()
    manifest = build_bm25_index(
        corpus,
        ids,
        output_dir,
        tokenizer=UndertheseaTokenizer(),
        source="postgresql:movies+movie_genres+genres",
        qdrant_url=settings.bm25_qdrant_url,
        qdrant_api_key=settings.bm25_qdrant_api_key,
        collection_name=settings.bm25_qdrant_collection,
    )
    print(
        f"Da build Qdrant BM25 {manifest['doc_count']:,} phim -> {output_dir} "
        f"({time.time() - t1:.1f}s, fingerprint {manifest['corpus_fingerprint'][:12]}...)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

