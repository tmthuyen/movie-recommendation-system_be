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
import json
import os
import sys
import time
from pathlib import Path

# Thiết lập encoding UTF-8 cho Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import numpy as np
import pandas as pd

# ── allow imports from ai-service/src when run from project root ───────────
_THIS_DIR = Path(__file__).resolve().parent  # ai-service/scripts/
_AI_SRC = _THIS_DIR.parent / "src"  # ai-service/src/
if str(_AI_SRC) not in sys.path:
    sys.path.insert(0, str(_AI_SRC))

# ── configuration (env-overridable) ───────────────────────────────────────
_PROJECT_ROOT = _THIS_DIR.parent.parent  # repo root

CSV_PATH = Path(
    os.getenv("CSV_PATH", str(_PROJECT_ROOT / "all_movies_fully_translated.csv"))
)
CHROMA_DIR = Path(os.getenv("CHROMA_DIR", str(_THIS_DIR.parent / "data" / "chroma_db")))
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "movies")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "paraphrase-multilingual-MiniLM-L12-v2")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "256"))
FORCE_REBUILD = os.getenv("FORCE_REBUILD", "0") == "1"


# ──────────────────────────────────────────────────────────────────────────────
# Shared Helpers (imported from data.data_loader)
# ──────────────────────────────────────────────────────────────────────────────
from data.data_loader import (
    build_search_text,
    compute_corpus_fingerprint,
    extract_genre_names,
    safe_float,
    safe_int,
)


def get_manifest_path(chroma_dir: Path, collection_name: str) -> Path:
    """Trả về đường dẫn tới file manifest JSON của collection."""
    return chroma_dir / f"{collection_name}_manifest.json"


def format_document_text_for_model(text: str, model_name: str) -> str:
    """Định dạng chuỗi văn bản tài liệu theo chuẩn của từng mô hình (e.g. e5 yêu cầu 'passage: ')."""
    if "e5" in model_name.lower():
        if not text.startswith("passage: "):
            return f"passage: {text}"
    return text


def format_query_text_for_model(query: str, model_name: str) -> str:
    """Định dạng chuỗi truy vấn theo chuẩn của từng mô hình (e.g. e5 yêu cầu 'query: ')."""
    if "e5" in model_name.lower():
        if not query.startswith("query: "):
            return f"query: {query}"
    return query


def save_collection_manifest(
    manifest_path: Path,
    collection_name: str,
    model_name: str,
    embedding_dim: int,
    num_records: int,
    corpus_fingerprint: str,
    csv_filename: str = "",
) -> dict:
    """Lưu metadata manifest chứa mã băm corpus, model và số lượng vector."""
    manifest_data = {
        "collection_name": collection_name,
        "model_name": model_name,
        "embedding_dim": embedding_dim,
        "num_records": num_records,
        "corpus_fingerprint": corpus_fingerprint,
        "csv_filename": csv_filename,
        "updated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "verified": True,
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest_data, f, indent=2, ensure_ascii=False)
    return manifest_data


def verify_vector_db(
    collection,
    corpus: list[str],
    movie_ids: list[int],
    model_name: str,
    manifest_path: Path,
    embedding_model=None,
    sample_indices: list[int] | None = None,
) -> tuple[bool, str]:
    """
    Xác minh ChromaDB có toàn vẹn và đồng bộ với corpus, search_text và model hay không:
    1. Kiểm tra số lượng vector trong collection so với số movie_ids.
    2. Kiểm tra manifest file: model_name, corpus_fingerprint, num_records.
    3. Nếu manifest chưa có, hoặc để kiểm chứng sâu:
       - Lấy mẫu các movie_id (đầu, giữa, cuối) kiểm tra sự hiện diện trong DB.
       - Kiểm tra chiều vector embedding.
       - Nếu có embedding_model: kiểm tra cosine similarity giữa vector trong DB và vector sinh mới từ search_text.
       - Nếu vector mẫu khớp hoàn toàn (cosine similarity >= 0.999), tự động lập manifest để các lần sau nạp tức thì.
    Trả về: (True, message) nếu hợp lệ, hoặc (False, reason) nếu phát hiện sai lệch cần rebuild.
    """
    if collection is None:
        return False, "Collection không tồn tại"

    current_count = collection.count()
    expected_count = len(movie_ids)
    if current_count != expected_count:
        return (
            False,
            f"Số lượng vector không khớp (DB có {current_count:,} vs corpus có {expected_count:,})",
        )

    expected_fp = compute_corpus_fingerprint(corpus, movie_ids)

    # 1. Kiểm tra qua file Manifest nếu đã có
    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                m_data = json.load(f)
            if m_data.get("model_name") != model_name:
                return (
                    False,
                    f"Embedding model không khớp (DB tạo bởi '{m_data.get('model_name')}' vs cấu hình '{model_name}')",
                )
            if m_data.get("corpus_fingerprint") != expected_fp:
                return (
                    False,
                    "Corpus fingerprint không khớp (Nội dung search_text hoặc danh sách movieId đã bị sửa đổi)",
                )
            if m_data.get("num_records") != expected_count:
                return (
                    False,
                    f"Số lượng bản ghi trong manifest ({m_data.get('num_records')}) không khớp với corpus ({expected_count})",
                )
        except Exception as e:
            return False, f"Không thể đọc manifest: {e}"

    # 2. Kiểm tra thực tế nội dung trong DB qua mẫu đại diện
    if sample_indices is None:
        sample_indices = (
            [0, len(corpus) // 2, len(corpus) - 1]
            if len(corpus) >= 3
            else list(range(len(corpus)))
        )

    sample_mids = [movie_ids[i] for i in sample_indices]
    sample_str_ids = [str(mid) for mid in sample_mids]

    try:
        sample_res = collection.get(
            ids=sample_str_ids, include=["metadatas", "embeddings", "documents"]
        )
    except Exception as e:
        return False, f"Lỗi truy vấn sample từ ChromaDB: {e}"

    retrieved_ids = set(sample_res.get("ids", []))
    for sid in sample_str_ids:
        if sid not in retrieved_ids:
            return False, f"Sample movieId '{sid}' không tồn tại trong ChromaDB"

    # Kiểm tra metadata movie_id
    metas = sample_res.get("metadatas", [])
    for meta, expected_mid in zip(metas, sample_mids):
        stored_mid = meta.get("movie_id") or meta.get("movieId")
        if safe_int(stored_mid) != expected_mid:
            return (
                False,
                f"Metadata movie_id ({stored_mid}) không khớp với ID kỳ vọng ({expected_mid})",
            )

    # Kiểm tra nội dung document thực tế lưu trong ChromaDB với search_text của corpus
    docs = sample_res.get("documents", [])
    if docs and any(d is not None for d in docs) and len(docs) == len(sample_indices):
        for idx_in_sample, original_idx in enumerate(sample_indices):
            doc_in_db = docs[idx_in_sample]
            expected_doc = corpus[original_idx]
            if doc_in_db is not None and doc_in_db != expected_doc:
                return False, (
                    f"Nội dung document lưu trong ChromaDB không khớp với search_text của corpus hiện tại "
                    f"tại movieId {sample_mids[idx_in_sample]}"
                )

    # Kiểm tra vector embedding và cosine similarity với model trên tập mẫu đại diện
    num_samples = len(sample_indices)
    db_embeddings = sample_res.get("embeddings")
    sample_vectors_checked = False

    if embedding_model is not None:
        dim_fn = getattr(
            embedding_model,
            "get_embedding_dimension",
            getattr(embedding_model, "get_sentence_embedding_dimension", None),
        )
        expected_dim = int(dim_fn()) if dim_fn else 384

        if db_embeddings is not None and len(db_embeddings) > 0:
            for idx_in_sample, original_idx in enumerate(sample_indices):
                vec_db = np.array(db_embeddings[idx_in_sample])
                if vec_db.shape[0] != expected_dim:
                    return (
                        False,
                        f"Chiều vector không khớp (DB có {vec_db.shape[0]} vs model kỳ vọng {expected_dim})",
                    )

                # Tính vector mới từ search_text hiện tại và kiểm tra cosine similarity
                sample_text = format_document_text_for_model(corpus[original_idx], model_name)
                vec_model = embedding_model.encode(
                    sample_text, normalize_embeddings=True
                )
                cosine_sim = float(np.dot(vec_db, vec_model))
                if cosine_sim < 0.999:
                    return False, (
                        f"Vector trong DB không khớp với model '{model_name}' và search_text "
                        f"(cosine similarity = {cosine_sim:.4f} < 0.999 tại movieId {sample_mids[idx_in_sample]})"
                    )
            sample_vectors_checked = True

        # Nếu manifest chưa tồn tại nhưng DB đã kiểm tra khớp mẫu hoàn toàn -> Lưu manifest tự động
        if not manifest_path.exists():
            save_collection_manifest(
                manifest_path=manifest_path,
                collection_name=collection.name,
                model_name=model_name,
                embedding_dim=expected_dim,
                num_records=expected_count,
                corpus_fingerprint=expected_fp,
            )

    if sample_vectors_checked:
        return True, (
            f"ChromaDB hợp lệ: manifest khớp corpus fingerprint ({expected_fp[:8]}...), "
            f"tổng {expected_count:,} bản ghi và đã kiểm chứng {num_samples} mẫu đại diện "
            f"(document khớp, cosine similarity >= 0.999 với model '{model_name}')"
        )
    return True, (
        f"ChromaDB hợp lệ: manifest khớp corpus fingerprint ({expected_fp[:8]}...), "
        f"tổng {expected_count:,} bản ghi và đã kiểm tra tính hiện diện của {num_samples} mẫu đại diện trong DB"
    )


def build_metadata(row: pd.Series) -> dict:
    """Extract scalar fields that are safe to store as ChromaDB metadata."""
    return {
        "movie_id": safe_int(row.get("movieId")),
        "tmdb_id": safe_int(row.get("tmdbId") or row.get("id")),
        "title": str(row.get("title") or ""),
        "title_vi": str(row.get("title_vi") or ""),
        "original_language": str(row.get("original_language") or ""),
        "release_date": str(row.get("release_date") or ""),
        "vote_average": safe_float(row.get("vote_average")),
        "vote_count": safe_int(row.get("vote_count")),
        "popularity": safe_float(row.get("popularity")),
        "poster_path": str(row.get("poster_path") or ""),
        "genres": extract_genre_names(str(row.get("genres", ""))),
    }


# ──────────────────────────────────────────────────────────────────────────────
# Main
# ──────────────────────────────────────────────────────────────────────────────


def parse_args():
    import argparse

    parser = argparse.ArgumentParser(description="Encode movies and insert into ChromaDB")
    parser.add_argument("--csv", type=Path, default=CSV_PATH, help="Path to all_movies_fully_translated.csv")
    parser.add_argument("--chroma-dir", type=Path, default=CHROMA_DIR, help="Directory for ChromaDB")
    parser.add_argument("--collection", type=str, default=COLLECTION_NAME, help="Collection name in ChromaDB")
    parser.add_argument("--model", type=str, default=EMBEDDING_MODEL, help="SentenceTransformer model name")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE, help="Rows per batch")
    parser.add_argument("--force", action="store_true", default=FORCE_REBUILD, help="Force drop and rebuild")
    parser.add_argument("--verify-only", action="store_true", help="Verify existing collection and exit")
    return parser.parse_args()


def main() -> None:
    import chromadb
    from sentence_transformers import SentenceTransformer
    from tqdm import tqdm

    args = parse_args()
    csv_path = args.csv
    chroma_dir = args.chroma_dir
    collection_name = args.collection
    model_name = args.model
    batch_size = args.batch_size
    force_rebuild = args.force

    print("=" * 65)
    print("  ChromaDB Vector DB Builder")
    print("=" * 65)
    print(f"  CSV          : {csv_path}")
    print(f"  ChromaDB dir : {chroma_dir}")
    print(f"  Collection   : {collection_name}")
    print(f"  Model        : {model_name}")
    print(f"  Batch size   : {batch_size}")
    print(f"  Force rebuild: {force_rebuild}")
    print("=" * 65)

    # ── 1. Load CSV ───────────────────────────────────────────────────────
    if not csv_path.exists():
        sys.exit(f"[ERROR] CSV not found: {csv_path}")

    print(f"\n[1/5] Loading CSV …")
    df = pd.read_csv(csv_path, low_memory=False)
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

    df[id_col] = df[id_col].apply(safe_int)
    df = df[df[id_col] > 0].drop_duplicates(subset=[id_col]).reset_index(drop=True)
    print(f"      Unique IDs  : {len(df):,}  (column: '{id_col}')")

    corpus = df["search_text"].tolist()
    movie_ids = df[id_col].tolist()
    corpus_fingerprint = compute_corpus_fingerprint(corpus, movie_ids)

    # ── 3. Load SBERT / E5 model ──────────────────────────────────────────
    print(f"\n[3/5] Loading model '{model_name}' …")
    t0 = time.time()
    model = SentenceTransformer(model_name)
    print(f"      Model loaded in {time.time() - t0:.1f}s")

    # ── 4. Open ChromaDB collection & verify integrity ────────────────────
    print(f"\n[4/5] Opening ChromaDB at '{chroma_dir}' …")
    chroma_dir.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(chroma_dir))
    manifest_path = get_manifest_path(chroma_dir, collection_name)

    collection = None
    try:
        collection = client.get_collection(name=collection_name)
    except Exception:
        pass

    if force_rebuild:
        rebuild_needed = True
        rebuild_reason = "--force / FORCE_REBUILD=1 được yêu cầu bởi người dùng."
    elif collection is None:
        rebuild_needed = True
        rebuild_reason = f"Collection '{collection_name}' chưa tồn tại."
    else:
        is_valid, reason = verify_vector_db(
            collection=collection,
            corpus=corpus,
            movie_ids=movie_ids,
            model_name=model_name,
            manifest_path=manifest_path,
            embedding_model=model,
        )
        if is_valid:
            print(f"\n  ✅ {reason}")
            print(
                "  ChromaDB hợp lệ và khớp 100% corpus/model. Không cần xây dựng lại."
            )
            return
        else:
            rebuild_needed = True
            rebuild_reason = reason

    if args.verify_only:
        print(f"\n  ❌ Kiểm tra thất bại: {rebuild_reason}")
        sys.exit(1)

    print(f"\n  ⚠️ Cần xây dựng lại ChromaDB: {rebuild_reason}")
    if collection is not None:
        try:
            client.delete_collection(name=collection_name)
            print(f"      Đã xóa collection cũ '{collection_name}'")
        except Exception as e:
            print(f"      Lỗi khi xóa collection cũ: {e}")

    collection = client.create_collection(
        name=collection_name,
        metadata={"hnsw:space": "cosine"},
    )

    # ── 5. Encode & insert in batches ─────────────────────────────────────
    print(f"\n[5/5] Encoding {len(corpus):,} movies in batches of {batch_size} …")
    total_batches = (len(corpus) + batch_size - 1) // batch_size
    inserted = 0
    t_start = time.time()

    for batch_idx in tqdm(range(total_batches), desc="Batches", unit="batch"):
        start = batch_idx * batch_size
        end = min(start + batch_size, len(corpus))

        batch_texts = corpus[start:end]
        batch_ids = movie_ids[start:end]
        batch_rows = df.iloc[start:end]

        formatted_batch_texts = [
            format_document_text_for_model(t, model_name) for t in batch_texts
        ]

        # Encode with unit-norm
        embeddings: np.ndarray = model.encode(
            formatted_batch_texts,
            batch_size=64,
            show_progress_bar=False,
            normalize_embeddings=True,  # unit-norm ⇒ cosine = dot product
        )

        str_ids = [str(mid) for mid in batch_ids]
        emb_lists = embeddings.tolist()
        metas = [build_metadata(batch_rows.iloc[i]) for i in range(len(batch_texts))]

        collection.upsert(
            ids=str_ids,
            embeddings=emb_lists,
            metadatas=metas,
            documents=batch_texts,
        )
        inserted += len(batch_texts)

    elapsed = time.time() - t_start
    final_count = collection.count()

    # Lưu manifest JSON ghi nhận toàn vẹn dữ liệu
    dim_fn = getattr(
        model,
        "get_embedding_dimension",
        getattr(model, "get_sentence_embedding_dimension", None),
    )
    expected_dim = int(dim_fn()) if dim_fn else embeddings.shape[1]
    save_collection_manifest(
        manifest_path=manifest_path,
        collection_name=collection_name,
        model_name=model_name,
        embedding_dim=expected_dim,
        num_records=len(movie_ids),
        corpus_fingerprint=corpus_fingerprint,
        csv_filename=str(csv_path.name),
    )

    print(f"\n{'=' * 65}")
    print(f"  Done!  Inserted/updated : {inserted:,}")
    print(f"  Total vectors in DB     : {final_count:,}")
    print(f"  Elapsed time            : {elapsed:.1f}s  ({elapsed/60:.1f} min)")
    print(f"  ChromaDB path           : {chroma_dir.resolve()}")
    print(f"  Manifest path           : {manifest_path.resolve()}")
    print(f"{'=' * 65}")


if __name__ == "__main__":
    main()
