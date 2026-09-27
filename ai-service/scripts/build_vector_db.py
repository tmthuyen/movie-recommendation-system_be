#!/usr/bin/env python
"""
build_vector_db.py
==================
Encode every movie in ``all_movies_fully_translated.csv`` with a multilingual
SBERT model and bulk-insert the resulting 384-dim vectors into a persistent
ChromaDB collection.

Usage (from the project root — one level above ai-service/):
    python ai-service/scripts/build_vector_db.py

Or from inside ai-service/:
    python scripts/build_vector_db.py

Optional env vars (override defaults):
    CSV_PATH          Path to all_movies_fully_translated.csv
    CHROMA_DIR        Directory for ChromaDB storage
    COLLECTION_NAME   ChromaDB collection name  (default: movies)
    EMBEDDING_MODEL   HuggingFace model name     (default: paraphrase-multilingual-MiniLM-L12-v2)
    BATCH_SIZE        Rows per encoding batch    (default: 256)
    FORCE_REBUILD     Set to "1" to drop and recreate the collection
"""

from __future__ import annotations

import ast
import os
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

# ── allow imports from ai-service/src when run from project root ───────────
_THIS_DIR = Path(__file__).resolve().parent          # ai-service/scripts/
_AI_SRC   = _THIS_DIR.parent / "src"                 # ai-service/src/
if str(_AI_SRC) not in sys.path:
    sys.path.insert(0, str(_AI_SRC))

# ── configuration (env-overridable) ───────────────────────────────────────
_PROJECT_ROOT = _THIS_DIR.parent.parent               # repo root

CSV_PATH        = Path(os.getenv("CSV_PATH",         str(_PROJECT_ROOT / "all_movies_fully_translated.csv")))
CHROMA_DIR      = Path(os.getenv("CHROMA_DIR",       str(_THIS_DIR.parent / "data" / "chroma_db")))
COLLECTION_NAME = os.getenv("COLLECTION_NAME",       "movies")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL",       "paraphrase-multilingual-MiniLM-L12-v2")
BATCH_SIZE      = int(os.getenv("BATCH_SIZE",        "256"))
FORCE_REBUILD   = os.getenv("FORCE_REBUILD",         "0") == "1"


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _extract_genre_names(raw: str) -> str:
    """Convert genres JSON-list string to a space-separated genre name string."""
    if not isinstance(raw, str) or not raw.strip():
        return ""
    try:
        items = ast.literal_eval(raw)
        return " ".join(str(g.get("name", "")) for g in items if isinstance(g, dict))
    except Exception:
        return raw


def build_search_text(row: pd.Series) -> str:
    title    = str(row.get("title_vi") or row.get("title") or "").strip()
    overview = str(row.get("overview_vi") or row.get("overview") or "").strip()
    genres   = _extract_genre_names(str(row.get("genres", "")))
    text = f"{title} {overview} {genres}"
    # collapse whitespace
    return " ".join(text.split())


def _safe_float(val) -> float:
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _safe_int(val) -> int:
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return 0


def build_metadata(row: pd.Series) -> dict:
    """Extract scalar fields that are safe to store as ChromaDB metadata."""
    return {
        "movie_id":         _safe_int(row.get("movieId")),
        "tmdb_id":          _safe_int(row.get("tmdbId") or row.get("id")),
        "title":            str(row.get("title") or ""),
        "title_vi":         str(row.get("title_vi") or ""),
        "original_language":str(row.get("original_language") or ""),
        "release_date":     str(row.get("release_date") or ""),
        "vote_average":     _safe_float(row.get("vote_average")),
        "vote_count":       _safe_int(row.get("vote_count")),
        "popularity":       _safe_float(row.get("popularity")),
        "poster_path":      str(row.get("poster_path") or ""),
        "genres":           _extract_genre_names(str(row.get("genres", ""))),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    from sentence_transformers import SentenceTransformer
    import chromadb
    from tqdm import tqdm

    print("=" * 65)
    print("  ChromaDB Vector DB Builder")
    print("=" * 65)
    print(f"  CSV          : {CSV_PATH}")
    print(f"  ChromaDB dir : {CHROMA_DIR}")
    print(f"  Collection   : {COLLECTION_NAME}")
    print(f"  Model        : {EMBEDDING_MODEL}")
    print(f"  Batch size   : {BATCH_SIZE}")
    print(f"  Force rebuild: {FORCE_REBUILD}")
    print("=" * 65)

    # ── 1. Load CSV ───────────────────────────────────────────────────────
    if not CSV_PATH.exists():
        sys.exit(f"[ERROR] CSV not found: {CSV_PATH}")

    print(f"\n[1/5] Loading CSV …")
    df = pd.read_csv(CSV_PATH)
    print(f"      Rows loaded : {len(df):,}")

    # ── 2. Build search_text & filter ─────────────────────────────────────
    print("[2/5] Building search_text …")
    df["search_text"] = df.apply(build_search_text, axis=1)
    before = len(df)
    df = df[df["search_text"].str.len() > 20].copy()
    print(f"      Kept {len(df):,} / {before:,} movies (search_text > 20 chars)")

    # Use movieId as primary key; fall back to tmdbId / id
    if "movieId" in df.columns and df["movieId"].notna().any():
        id_col = "movieId"
    elif "tmdbId" in df.columns:
        id_col = "tmdbId"
    else:
        id_col = "id"

    df[id_col] = df[id_col].apply(_safe_int)
    df = df[df[id_col] > 0].drop_duplicates(subset=[id_col]).reset_index(drop=True)
    print(f"      Unique IDs  : {len(df):,}  (column: '{id_col}')")

    corpus   = df["search_text"].tolist()
    movie_ids = df[id_col].tolist()

    # ── 3. Load SBERT model ───────────────────────────────────────────────
    print(f"\n[3/5] Loading model '{EMBEDDING_MODEL}' …")
    t0 = time.time()
    model = SentenceTransformer(EMBEDDING_MODEL)
    print(f"      Model loaded in {time.time() - t0:.1f}s")

    # ── 4. Open / recreate ChromaDB collection ────────────────────────────
    print(f"\n[4/5] Opening ChromaDB at '{CHROMA_DIR}' …")
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))

    if FORCE_REBUILD:
        try:
            client.delete_collection(name=COLLECTION_NAME)
            print(f"      Deleted existing collection '{COLLECTION_NAME}'")
        except Exception:
            pass

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )
    existing_count = collection.count()
    print(f"      Collection '{COLLECTION_NAME}' — existing vectors: {existing_count:,}")

    if existing_count >= len(df) and not FORCE_REBUILD:
        print("\n  Collection already fully populated. Nothing to do.")
        print("  (Set FORCE_REBUILD=1 to rebuild from scratch.)")
        return

    # ── 5. Encode & insert in batches ─────────────────────────────────────
    print(f"\n[5/5] Encoding {len(corpus):,} movies in batches of {BATCH_SIZE} …")
    total_batches = (len(corpus) + BATCH_SIZE - 1) // BATCH_SIZE
    inserted = 0
    t_start = time.time()

    for batch_idx in tqdm(range(total_batches), desc="Batches", unit="batch"):
        start = batch_idx * BATCH_SIZE
        end   = min(start + BATCH_SIZE, len(corpus))

        batch_texts    = corpus[start:end]
        batch_ids      = movie_ids[start:end]
        batch_rows     = df.iloc[start:end]

        # Encode — returns numpy (N, 384)
        embeddings: np.ndarray = model.encode(
            batch_texts,
            batch_size=64,
            show_progress_bar=False,
            normalize_embeddings=True,   # unit-norm ⇒ cosine = dot product
        )

        str_ids   = [str(mid) for mid in batch_ids]
        emb_lists = embeddings.tolist()
        metas     = [build_metadata(batch_rows.iloc[i]) for i in range(len(batch_texts))]

        collection.upsert(
            ids=str_ids,
            embeddings=emb_lists,
            metadatas=metas,
        )
        inserted += len(batch_texts)

    elapsed = time.time() - t_start
    final_count = collection.count()
    print(f"\n{'=' * 65}")
    print(f"  Done!  Inserted/updated : {inserted:,}")
    print(f"  Total vectors in DB     : {final_count:,}")
    print(f"  Elapsed time            : {elapsed:.1f}s  ({elapsed/60:.1f} min)")
    print(f"  ChromaDB path           : {CHROMA_DIR.resolve()}")
    print(f"{'=' * 65}")


if __name__ == "__main__":
    main()
