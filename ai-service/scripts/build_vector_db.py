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


def format_query_text_for_model(query: str, model_name: str) -> str:
    """Định dạng chuỗi truy vấn theo chuẩn của từng mô hình (e.g. e5 yêu cầu 'query: ')."""
    if "e5" in model_name.lower():
        if not query.startswith("query: "):
            return f"query: {query}"
    return query


def format_document_text_for_model(document: str, model_name: str) -> str:
    """Định dạng chuỗi văn bản tài liệu theo chuẩn của từng mô hình (e.g. e5 yêu cầu 'passage: ')."""
    if "e5" in model_name.lower():
        if not document.startswith("passage: "):
            return f"passage: {document}"
    return document


def get_manifest_path(chroma_dir: Path, collection_name: str) -> Path:
    """Trả về đường dẫn tới file manifest JSON của collection."""
    return chroma_dir / f"{collection_name}_manifest.json"


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
    1. Kiểm tra collection name và hnsw:space (cosine).
    2. Kiểm tra số lượng vector trong collection so với số movie_ids.
    3. Kiểm tra manifest file: collection_name, model_name, corpus_fingerprint, num_records, embedding_dim.
    4. Kiểm tra mẫu đại diện:
       - Ánh xạ theo movieId (không phụ thuộc thứ tự trả về).
       - Kiểm tra metadata và search_text document.
       - Kiểm tra vector embedding tồn tại, đúng chiều (dimension) và đã chuẩn hóa L2.
       - Kiểm tra khoảng cách cosine (cosine similarity >= 0.999) với embedding_model khi được cung cấp.
    Trả về: (True, message) nếu hợp lệ, hoặc (False, reason) nếu phát hiện sai lệch cần rebuild.
    """
    if collection is None:
        return False, "Collection không tồn tại"

    col_name = getattr(collection, "name", "")
    col_meta = getattr(collection, "metadata", None)
    if not isinstance(col_meta, dict):
        return False, "ChromaDB collection metadata không tồn tại hoặc không hợp lệ"

    space = col_meta.get("hnsw:space")
    if space is None or str(space).strip().lower() != "cosine":
        return (
            False,
            f"ChromaDB distance metric không hợp lệ hoặc thiếu (kỳ vọng 'hnsw:space'='cosine', hiện tại: '{space}')",
        )

    try:
        current_count = int(collection.count())
    except Exception as e:
        return False, f"Lỗi truy vấn số lượng vector từ collection: {e}"

    expected_count = len(movie_ids)
    if current_count != expected_count:
        return (
            False,
            f"Số lượng vector không khớp (DB có {current_count:,} vs corpus có {expected_count:,})",
        )

    expected_fp = compute_corpus_fingerprint(corpus, movie_ids)

    # Nếu manifest chưa có VÀ không có embedding_model: thiếu bằng chứng quan trọng để xác minh
    if not manifest_path.exists():
        if embedding_model is None:
            return False, "Thiếu manifest file và không có embedding_model để kiểm chứng ChromaDB"
        m_data = {}
    else:
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                m_data = json.load(f)

            if m_data.get("collection_name") and col_name and m_data.get("collection_name") != col_name:
                return (
                    False,
                    f"Tên collection không khớp (DB là '{col_name}' vs manifest '{m_data.get('collection_name')}')",
                )
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

    # Xác định chiều vector kỳ vọng
    expected_dim: int | None = None
    if embedding_model is not None:
        dim_fn = getattr(
            embedding_model,
            "get_sentence_embedding_dimension",
            getattr(embedding_model, "get_embedding_dimension", None),
        )
        if callable(dim_fn):
            expected_dim = int(dim_fn())
        elif hasattr(embedding_model, "dimension"):
            expected_dim = int(embedding_model.dimension)

    if expected_dim is None and m_data.get("embedding_dim"):
        expected_dim = int(m_data["embedding_dim"])

    if expected_dim is None:
        if "e5-base" in model_name.lower():
            expected_dim = 768
        elif "e5-small" in model_name.lower() or "minilm" in model_name.lower():
            expected_dim = 384
        else:
            return False, "Không xác định được chiều vector kỳ vọng (thiếu embedding_model và embedding_dim trong manifest)"

    if m_data.get("embedding_dim") and int(m_data["embedding_dim"]) != expected_dim:
        return (
            False,
            f"Chiều embedding trong manifest ({m_data.get('embedding_dim')}) không khớp với model ({expected_dim})",
        )

    # Kiểm tra thực tế nội dung trong DB qua mẫu đại diện
    if sample_indices is None:
        sample_indices = (
            [0, len(corpus) // 2, len(corpus) - 1]
            if len(corpus) >= 3
            else list(range(len(corpus)))
        )

    sample_mids = [movie_ids[i] for i in sample_indices]
    sample_str_ids = [str(mid) for mid in sample_mids]
    sample_idx_map = {str(movie_ids[i]): i for i in sample_indices}

    try:
        sample_res = collection.get(
            ids=sample_str_ids, include=["metadatas", "embeddings", "documents"]
        )
    except Exception as e:
        return False, f"Lỗi truy vấn sample từ ChromaDB: {e}"

    raw_ids = sample_res.get("ids")
    ret_ids = [str(sid) for sid in raw_ids] if raw_ids is not None else []

    raw_metas = sample_res.get("metadatas")
    ret_metas = list(raw_metas) if raw_metas is not None else []

    raw_docs = sample_res.get("documents")
    ret_docs = list(raw_docs) if raw_docs is not None else []

    raw_embeddings = sample_res.get("embeddings")
    if raw_embeddings is None:
        ret_embeddings = []
    elif isinstance(raw_embeddings, np.ndarray):
        ret_embeddings = raw_embeddings
    else:
        ret_embeddings = list(raw_embeddings)

    # Ánh xạ theo movieId thay vì phụ thuộc thứ tự trả về của ChromaDB
    db_map = {}
    for i, sid in enumerate(ret_ids):
        meta_val = ret_metas[i] if i < len(ret_metas) else {}
        doc_val = ret_docs[i] if i < len(ret_docs) else None
        emb_val = ret_embeddings[i] if i < len(ret_embeddings) else None
        db_map[sid] = {
            "metadata": meta_val,
            "document": doc_val,
            "embedding": emb_val,
        }

    for sid in sample_str_ids:
        if sid not in db_map:
            return False, f"Sample movieId '{sid}' không tồn tại trong ChromaDB"

        expected_mid = safe_int(sid)
        orig_idx = sample_idx_map[sid]
        rec = db_map[sid]

        # 1. Kiểm tra metadata movie_id
        meta = rec.get("metadata") or {}
        stored_mid = meta.get("movie_id") or meta.get("movieId")
        if safe_int(stored_mid) != expected_mid:
            return (
                False,
                f"Metadata movie_id ({stored_mid}) không khớp với ID kỳ vọng ({expected_mid})",
            )

        # 2. Kiểm tra nội dung document nếu có
        doc_in_db = rec.get("document")
        expected_doc = corpus[orig_idx]
        if doc_in_db is not None and doc_in_db != expected_doc:
            return (
                False,
                f"Nội dung document lưu trong ChromaDB không khớp với search_text của corpus hiện tại tại movieId {expected_mid}",
            )

        # 3. Kiểm tra embedding và chiều vector thực tế từ DB (hỗ trợ cả np.ndarray, list)
        emb_in_db = rec.get("embedding")
        if emb_in_db is None:
            return False, f"Embedding cho movieId {expected_mid} rỗng trong ChromaDB"

        if isinstance(emb_in_db, np.ndarray):
            if emb_in_db.size == 0:
                return False, f"Embedding cho movieId {expected_mid} rỗng trong ChromaDB"
            vec_db = emb_in_db.astype(np.float32).flatten()
        else:
            if len(emb_in_db) == 0:
                return False, f"Embedding cho movieId {expected_mid} rỗng trong ChromaDB"
            vec_db = np.array(emb_in_db, dtype=np.float32).flatten()

        if vec_db.shape[0] != expected_dim:
            return (
                False,
                f"Chiều vector không khớp (DB có {vec_db.shape[0]} vs kỳ vọng {expected_dim} tại movieId {expected_mid})",
            )

        # Từ chối NaN/Inf trước các phép so sánh (NaN làm điều kiện >/< luôn False).
        if not np.isfinite(vec_db).all():
            return False, f"Embedding trong DB chứa NaN/Inf tại movieId {expected_mid}"

        # 4. Kiểm tra chuẩn hóa L2 của vector trong DB.
        norm = float(np.linalg.norm(vec_db))
        if not np.isfinite(norm):
            return False, f"Norm embedding trong DB không hữu hạn tại movieId {expected_mid}"
        if abs(norm - 1.0) > 1e-3:
            return (
                False,
                f"Vector trong DB chưa được chuẩn hóa L2 (norm = {norm:.4f} != 1.0 tại movieId {expected_mid})",
            )

        # 5. Nếu có embedding_model, kiểm tra cosine similarity thực tế với text hiện tại
        if embedding_model is not None:
            sample_text = format_document_text_for_model(expected_doc, model_name)
            vec_model = embedding_model.encode(
                sample_text, normalize_embeddings=True
            )
            vec_model = np.asarray(vec_model, dtype=np.float32).flatten()
            if vec_model.shape != vec_db.shape:
                return False, (
                    f"Vector model sai chiều (model có {vec_model.size} vs DB có "
                    f"{vec_db.size} tại movieId {expected_mid})"
                )
            if not np.isfinite(vec_model).all():
                return False, f"Embedding từ model chứa NaN/Inf tại movieId {expected_mid}"
            model_norm = float(np.linalg.norm(vec_model))
            if not np.isfinite(model_norm):
                return False, f"Norm embedding từ model không hữu hạn tại movieId {expected_mid}"
            if abs(model_norm - 1.0) > 1e-3:
                return False, f"Embedding từ model chưa được chuẩn hóa L2 tại movieId {expected_mid}"
            cosine_sim = float(np.dot(vec_db, vec_model))
            if not np.isfinite(cosine_sim):
                return False, f"Cosine similarity không hữu hạn tại movieId {expected_mid}"
            if cosine_sim < 0.999:
                return False, (
                    f"Vector trong DB không khớp với model '{model_name}' và search_text "
                    f"(cosine similarity = {cosine_sim:.4f} < 0.999 tại movieId {expected_mid})"
                )

    # Nếu manifest chưa tồn tại nhưng DB đã kiểm tra khớp mẫu hoàn toàn -> Lưu manifest tự động
    if not manifest_path.exists() and embedding_model is not None:
        save_collection_manifest(
            manifest_path=manifest_path,
            collection_name=col_name or getattr(collection, 'name', ''),
            model_name=model_name,
            embedding_dim=expected_dim,
            num_records=expected_count,
            corpus_fingerprint=expected_fp,
        )

    num_samples = len(sample_indices)
    if embedding_model is not None:
        return True, (
            f"ChromaDB hợp lệ: collection '{col_name}', dimension {expected_dim}, "
            f"manifest khớp corpus fingerprint ({expected_fp[:8]}...), "
            f"tổng {expected_count:,} bản ghi và đã kiểm chứng {num_samples} mẫu đại diện "
            f"(ánh xạ movieId chính xác, document khớp, cosine similarity >= 0.999 với model '{model_name}')"
        )
    return True, (
        f"ChromaDB hợp lệ: collection '{col_name}', dimension {expected_dim}, "
        f"manifest khớp corpus fingerprint ({expected_fp[:8]}...), "
        f"tổng {expected_count:,} bản ghi và đã kiểm tra tính hiện diện, metadata, chiều vector {expected_dim}d "
        f"của {num_samples} mẫu đại diện trong DB"
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


def main() -> None:
    import chromadb
    from sentence_transformers import SentenceTransformer
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
    df = pd.read_csv(CSV_PATH, low_memory=False)
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

    # ── 3. Load SBERT model ───────────────────────────────────────────────
    print(f"\n[3/5] Loading model '{EMBEDDING_MODEL}' …")
    t0 = time.time()
    model = SentenceTransformer(EMBEDDING_MODEL)
    print(f"      Model loaded in {time.time() - t0:.1f}s")

    # ── 4. Open ChromaDB collection & verify integrity ────────────────────
    print(f"\n[4/5] Opening ChromaDB at '{CHROMA_DIR}' …")
    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    manifest_path = get_manifest_path(CHROMA_DIR, COLLECTION_NAME)

    collection = None
    try:
        collection = client.get_collection(name=COLLECTION_NAME)
    except Exception:
        pass

    if FORCE_REBUILD:
        rebuild_needed = True
        rebuild_reason = "FORCE_REBUILD=1 được yêu cầu bởi người dùng."
    elif collection is None:
        rebuild_needed = True
        rebuild_reason = f"Collection '{COLLECTION_NAME}' chưa tồn tại."
    else:
        is_valid, reason = verify_vector_db(
            collection=collection,
            corpus=corpus,
            movie_ids=movie_ids,
            model_name=EMBEDDING_MODEL,
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

    print(f"\n  ⚠️ Cần xây dựng lại ChromaDB: {rebuild_reason}")
    if collection is not None:
        try:
            client.delete_collection(name=COLLECTION_NAME)
            print(f"      Đã xóa collection cũ '{COLLECTION_NAME}'")
        except Exception as e:
            print(f"      Lỗi khi xóa collection cũ: {e}")

    collection = client.create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )

    # ── 5. Encode & insert in batches ─────────────────────────────────────
    print(f"\n[5/5] Encoding {len(corpus):,} movies in batches of {BATCH_SIZE} …")
    total_batches = (len(corpus) + BATCH_SIZE - 1) // BATCH_SIZE
    inserted = 0
    t_start = time.time()

    for batch_idx in tqdm(range(total_batches), desc="Batches", unit="batch"):
        start = batch_idx * BATCH_SIZE
        end = min(start + BATCH_SIZE, len(corpus))

        batch_texts = corpus[start:end]
        batch_ids = movie_ids[start:end]
        batch_rows = df.iloc[start:end]

        # Encode — returns numpy (N, 384)
        embeddings: np.ndarray = model.encode(
            batch_texts,
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
    expected_dim = int(dim_fn()) if dim_fn else 384
    save_collection_manifest(
        manifest_path=manifest_path,
        collection_name=COLLECTION_NAME,
        model_name=EMBEDDING_MODEL,
        embedding_dim=expected_dim,
        num_records=len(movie_ids),
        corpus_fingerprint=corpus_fingerprint,
        csv_filename=str(CSV_PATH.name),
    )

    print(f"\n{'=' * 65}")
    print(f"  Done!  Inserted/updated : {inserted:,}")
    print(f"  Total vectors in DB     : {final_count:,}")
    print(f"  Elapsed time            : {elapsed:.1f}s  ({elapsed/60:.1f} min)")
    print(f"  ChromaDB path           : {CHROMA_DIR.resolve()}")
    print(f"  Manifest path           : {manifest_path.resolve()}")
    print(f"{'=' * 65}")


if __name__ == "__main__":
    main()
