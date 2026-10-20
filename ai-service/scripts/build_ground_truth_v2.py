#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""build_ground_truth_v2.py.

=========================
Quy trình xây dựng Ground Truth V2 từ 100 Benchmark Queries bằng Candidate Pooling (Bước 3):
1. Giữ nguyên 5 nhóm (Lexical, Semantic, Abstract, Typo/Slang, Short/Long - 20 query/nhóm = 100 queries).
2. Kiểm chứng source_movie_id, nội dung query và mapping giữa PostgreSQL - ChromaDB - Corpus trước khi gán nhãn.
3. Tái sử dụng cơ chế xác thực fingerprint và tokenizer cache của Bước 1 (verify_vector_db & load_or_create_tokenized_cache).
4. Candidate Pooling từ TF-IDF, BM25 và SBERT (ChromaDB) để lấy các phim ứng viên trong cùng corpus 14.815 phim.
5. Mỗi query có nhiều phim liên quan, thang điểm relevance 0-3. Phân biệt rõ phim chưa đánh giá (relevance_grade = null, status: "unassessed") với grade 0.
6. KHÔNG gán sẵn grade 3 cho phim nguồn; để null cho đến khi người đánh giá thẩm định.
7. Đảm bảo Ground Truth V2 và annotation queue luôn đồng bộ sau khi gán nhãn, bảo toàn các nhãn con người đã xác minh khi chạy lại.
8. Sửa triệt để lỗi genres bị tách thành từng ký tự; định dạng chuỗi các thể loại chuẩn cách nhau bởi dấu phẩy.
9. Xáo trộn ứng viên có thể tái lập (reproducible shuffling) để phục vụ quy trình đánh giá mù (blinded human annotation).
"""

from __future__ import annotations

import argparse
import ast
from collections import Counter, defaultdict
from datetime import datetime
import json
import os
from pathlib import Path
import random
import sys
import time
from typing import Any, Dict, List, Optional, Set, Tuple

import joblib
import numpy as np
import pandas as pd
from rank_bm25 import BM25Okapi
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# ─── Thiết lập encoding UTF-8 ────────────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent
PROJECT_ROOT = AI_SERVICE_DIR.parent
SRC_DIR = AI_SERVICE_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from build_vector_db import (
    format_query_text_for_model,
    get_manifest_path,
    verify_vector_db,
)
from core.tokenizer import UndertheseaTokenizer
from data.data_loader import (
    build_search_text,
    compute_corpus_fingerprint,
    safe_int,
)

# ─── Đường dẫn file ──────────────────────────────────────────────────────────
CSV_PATH = PROJECT_ROOT / "all_movies_fully_translated.csv"
CHROMA_DIR = AI_SERVICE_DIR / "data" / "chroma_db"
TOKEN_CACHE_FILE = (
    AI_SERVICE_DIR
    / "data"
    / "artifacts"
    / "lexical_search"
    / "tokenized_corpus_underthesea.joblib"
)
GT_DIR = AI_SERVICE_DIR / "experiments" / "ground_truth"
GT_DIR.mkdir(parents=True, exist_ok=True)

BENCHMARK_QUERIES_FILE = GT_DIR / "benchmark_queries_v2.json"
SOURCE_MOVIES_FILE = GT_DIR / "benchmark_source_movies_100.json"
GROUND_TRUTH_V2_FILE = GT_DIR / "ground_truth_v2.json"
ANNOTATION_QUEUE_FILE = GT_DIR / "annotation_queue_v2.json"

COLLECTION_NAME = "movies"
SBERT_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"

E5_SMALL_COLLECTION_NAME = "movies_e5_small"
E5_SMALL_MODEL_NAME = "intfloat/multilingual-e5-small"

E5_BASE_COLLECTION_NAME = "movies_e5_base"
E5_BASE_MODEL_NAME = "intfloat/multilingual-e5-base"

DEFAULT_POOL_TOP_K = 10
BINARY_RELEVANCE_THRESHOLD = 2
SHUFFLE_SEED = 42


# ══════════════════════════════════════════════════════════════════════════════
# 1. HÀM CHUẨN HÓA GENRES (SỬA LỖI TÁCH TỪNG KÝ TỰ)
# ══════════════════════════════════════════════════════════════════════════════


def format_genres_clean(raw: Any) -> str:
    """Trích xuất và định dạng danh sách thể loại thành chuỗi cách nhau bởi dấu phẩy.

    Tuyệt đối không tách thành từng ký tự đơn lẻ.
    """
    if not raw or pd.isna(raw):
        return ""
    if isinstance(raw, str):
        raw_str = raw.strip()
        # Trường hợp chuỗi biểu diễn JSON list: "[{'id': 18, 'name': 'Phim Chính Kịch'}, ...]"
        if raw_str.startswith("[") and raw_str.endswith("]"):
            try:
                items = ast.literal_eval(raw_str)
                if isinstance(items, list):
                    names = [
                        str(g.get("name", "")).strip()
                        for g in items
                        if isinstance(g, dict) and g.get("name")
                    ]
                    if names:
                        return ", ".join(names)
            except Exception:
                pass

        # Trường hợp chuỗi đã có dấu phẩy: kiểm tra xem có bị lỗi tách từng ký tự hay không
        if "," in raw_str:
            parts = [p.strip() for p in raw_str.split(",")]
            # Nếu đa phần phần tử có độ dài <= 2 ký tự (lỗi split char), ghép lại
            if len(parts) > 5 and sum(1 for p in parts[:10] if len(p) <= 2) >= 8:
                if ", " in raw_str:
                    return raw_str.replace(", ", "").strip()
                return "".join(parts).strip()
            return ", ".join(p for p in parts if p)

        return raw_str
    return str(raw).strip()


# ══════════════════════════════════════════════════════════════════════════════
# 2. XÁC MINH FINGERPRINT & TOKENIZER CACHE THEO CHUẨN BƯỚC 1
# ══════════════════════════════════════════════════════════════════════════════


def load_corpus() -> pd.DataFrame:
    """Nạp 14.815 bộ phim từ all_movies_fully_translated.csv bằng build_search_text chuẩn hóa."""
    if not CSV_PATH.exists():
        raise FileNotFoundError(
            f"[FATAL] Không tìm thấy tệp corpus tại: {CSV_PATH}. "
            "Vui lòng đảm bảo all_movies_fully_translated.csv tồn tại ở thư mục gốc!"
        )

    df = pd.read_csv(CSV_PATH, low_memory=False)
    df["search_text"] = df.apply(build_search_text, axis=1)
    df = df[df["search_text"].str.len() > 20].copy()

    id_col = "movieId" if "movieId" in df.columns and df["movieId"].notna().any() else "id"
    df[id_col] = df[id_col].apply(safe_int)
    df = df[df[id_col] > 0].drop_duplicates(subset=[id_col]).reset_index(drop=True)
    df["movieId"] = df[id_col]
    return df


def verify_corpus_and_chromadb_guard(
    corpus_df: pd.DataFrame,
    chroma_dir: Path = CHROMA_DIR,
    collection_name: str = COLLECTION_NAME,
    model_name: str = SBERT_MODEL_NAME,
) -> Any:
    """Tái sử dụng cơ chế verify_vector_db của Bước 1: kiểm tra toàn vẹn ChromaDB trước khi pooling."""
    print(f"🔍 [Step 1 Guard] Kiểm tra tính toàn vẹn và fingerprint của ChromaDB ('{collection_name}')...")
    import chromadb

    if not chroma_dir.exists():
        raise RuntimeError(f"[FATAL] Thư mục ChromaDB không tồn tại: {chroma_dir}")

    client = chromadb.PersistentClient(path=str(chroma_dir))
    try:
        col = client.get_collection(collection_name)
    except Exception as e:
        raise RuntimeError(f"[FATAL] Không thể mở collection '{collection_name}': {e}")
    manifest_path = get_manifest_path(chroma_dir, collection_name)

    corpus_texts = corpus_df["search_text"].tolist()
    movie_ids = corpus_df["movieId"].tolist()

    is_valid, msg = verify_vector_db(
        collection=col,
        corpus=corpus_texts,
        movie_ids=movie_ids,
        model_name=model_name,
        manifest_path=manifest_path,
    )

    if not is_valid:
        raise RuntimeError(
            f"[FATAL] ChromaDB collection '{collection_name}' không vượt qua bước kiểm tra toàn vẹn của Bước 1: {msg}. Dừng pooling!"
        )

    print(f"   [Step 1 Guard] ✅ {msg}")
    return col


def load_verified_tokenizer_cache(
    corpus_df: pd.DataFrame,
    tokenizer: UndertheseaTokenizer,
    cache_path: Path = TOKEN_CACHE_FILE,
) -> List[List[str]]:
    """Tái sử dụng cơ chế xác thực tokenized corpus cache với fingerprint và tokenizer config hash."""
    corpus_texts = corpus_df["search_text"].tolist()
    movie_ids = corpus_df["movieId"].tolist()
    current_corpus_fp = compute_corpus_fingerprint(corpus_texts, movie_ids)
    current_tok_hash = tokenizer.get_config_hash()

    cache_valid = False
    invalidation_reason = ""

    if cache_path.exists():
        try:
            cached_obj = joblib.load(cache_path)
            if isinstance(cached_obj, dict) and "tokenized_corpus" in cached_obj:
                cached_fp = cached_obj.get("corpus_fingerprint")
                cached_tok_hash = cached_obj.get("tokenizer_hash")
                cached_count = cached_obj.get("num_records")

                if cached_fp != current_corpus_fp:
                    invalidation_reason = "Corpus fingerprint thay đổi"
                elif cached_tok_hash != current_tok_hash:
                    invalidation_reason = "Tokenizer hash thay đổi"
                elif cached_count != len(corpus_df) or len(cached_obj["tokenized_corpus"]) != len(corpus_df):
                    invalidation_reason = "Số lượng bản ghi không khớp"
                else:
                    cache_valid = True
            else:
                invalidation_reason = "Cache phiên bản cũ"
        except Exception as e:
            invalidation_reason = f"Lỗi đọc file: {e}"

    if cache_valid:
        print(
            f"   [Tokenizer Cache] ✅ Cache hợp lệ ({len(corpus_df):,} văn bản, khớp fingerprint & tokenizer hash). Nạp tức thì!"
        )
        return cached_obj["tokenized_corpus"]

    print(f"   [Tokenizer Cache] ⚠️ Cache không hợp lệ ({invalidation_reason}). Đang tách từ lại với Underthesea...")
    t0 = time.time()
    tokenized_corpus = [tokenizer.tokenize(t) for t in corpus_texts]
    elapsed = time.time() - t0
    print(f"   [Tokenizer Cache] Hoàn tất tách từ trong {elapsed:.1f}s.")

    cache_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "corpus_fingerprint": current_corpus_fp,
        "num_records": len(corpus_df),
        "tokenizer_hash": current_tok_hash,
        "tokenizer_class": tokenizer.__class__.__name__,
        "stop_words_count": len(tokenizer.stop_words),
        "tokenized_corpus": tokenized_corpus,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    joblib.dump(payload, cache_path)
    return tokenized_corpus


def verify_cross_db_mapping(
    queries: List[Dict[str, Any]],
    source_movies: List[Dict[str, Any]],
    corpus_df: pd.DataFrame,
    chroma_dir: Path = CHROMA_DIR,
) -> None:
    """Kiểm chứng 100% source_movie_id và mapping giữa PostgreSQL - ChromaDB - Corpus."""
    print("🔍 [Cross-DB Check] Đang kiểm chứng nguồn 100 queries và phim nguồn...")
    import chromadb

    client = chromadb.PersistentClient(path=str(chroma_dir))
    col = client.get_collection(COLLECTION_NAME)
    chroma_meta_res = col.get(include=["metadatas"])

    chroma_meta_by_id = {}
    for sid, meta in zip(chroma_meta_res["ids"], chroma_meta_res["metadatas"]):
        if sid.isdigit():
            chroma_meta_by_id[int(sid)] = meta or {}

    corpus_ids = set(corpus_df["movieId"].tolist())
    src_movie_map = {m["movie_id"]: m for m in source_movies}

    assert len(queries) == 100, f"Kỳ vọng 100 queries nhưng có {len(queries)}"
    assert len(source_movies) == 100, f"Kỳ vọng 100 source movies nhưng có {len(source_movies)}"

    for q in queries:
        qid = q["query_id"]
        sid = q["source_movie_id"]
        if sid not in src_movie_map:
            raise RuntimeError(f"Query {qid}: source_movie_id {sid} không có trong benchmark_source_movies_100.json")
        if sid not in corpus_ids:
            raise RuntimeError(f"Query {qid}: source_movie_id {sid} không tồn tại trong corpus CSV!")
        if sid not in chroma_meta_by_id:
            raise RuntimeError(f"Query {qid}: source_movie_id {sid} không tồn tại trong ChromaDB!")

    print("   [Cross-DB Check] ✅ 100/100 queries và phim nguồn khớp chính xác 100% giữa PostgreSQL, ChromaDB và Corpus CSV!")


# ══════════════════════════════════════════════════════════════════════════════
# 3. POOLING ENGINE & CANDIDATE RETRIEVAL
# ══════════════════════════════════════════════════════════════════════════════


class PoolingEngine:
    """Động cơ Candidate Pooling từ TF-IDF, BM25, SBERT, multilingual-e5-small và multilingual-e5-base."""

    def __init__(
        self,
        corpus_df: pd.DataFrame,
        chroma_col_sbert: Any,
        chroma_col_e5_small: Optional[Any] = None,
        chroma_col_e5_base: Optional[Any] = None,
    ):
        self.df = corpus_df
        self.chroma_col = chroma_col_sbert
        self.chroma_e5_small = chroma_col_e5_small
        self.chroma_e5_base = chroma_col_e5_base
        self.movie_meta_by_id: Dict[int, Dict[str, Any]] = {}

        # 1. Khởi tạo metadata phim với genres sạch (sửa lỗi tách ký tự)
        for idx, row in self.df.iterrows():
            mid = int(row["movieId"])
            title_vi = str(row.get("title_vi") or row.get("title") or "")
            title_en = str(row.get("title") or row.get("original_title") or "")
            overview = str(row.get("overview_vi") or row.get("overview") or "")
            genres_clean = format_genres_clean(row.get("genres"))

            self.movie_meta_by_id[mid] = {
                "movie_id": mid,
                "tmdb_id": safe_int(row.get("tmdbId") or row.get("id")),
                "title_vi": title_vi,
                "title_en": title_en,
                "genres": genres_clean,
                "release_date": str(row.get("release_date") or ""),
                "vote_average": round(float(row.get("vote_average") or 0.0), 1),
                "overview_snippet": (overview[:180] + "...") if len(overview) > 180 else overview,
                "overview_full": overview,
            }

        # 2. Tokenizer & Cache
        print("📦 [Init] Khởi tạo UndertheseaTokenizer và xác thực cache...")
        self.tokenizer = UndertheseaTokenizer()
        self.tokenized_corpus = load_verified_tokenizer_cache(self.df, self.tokenizer, TOKEN_CACHE_FILE)

        # 3. TF-IDF
        print("📦 [Init] Khởi tạo TF-IDF Vectorizer (25.000 features, sublinear TF)...")
        tok_corpus_strings = [" ".join(doc) for doc in self.tokenized_corpus]
        self.tfidf_vec = TfidfVectorizer(max_features=25_000, sublinear_tf=True)
        self.tfidf_matrix = self.tfidf_vec.fit_transform(tok_corpus_strings)

        # 4. BM25
        print("📦 [Init] Khởi tạo Okapi BM25...")
        self.bm25 = BM25Okapi(self.tokenized_corpus)

        # 5. SBERT Model
        from sentence_transformers import SentenceTransformer

        print(f"📦 [Init] Nạp SentenceTransformer ({SBERT_MODEL_NAME})...")
        self.sbert = SentenceTransformer(SBERT_MODEL_NAME)

        # 6. Multilingual E5 Small
        if self.chroma_e5_small is not None:
            print(f"📦 [Init] Nạp SentenceTransformer ({E5_SMALL_MODEL_NAME})...")
            self.e5_small = SentenceTransformer(E5_SMALL_MODEL_NAME)
        else:
            self.e5_small = None

        # 7. Multilingual E5 Base
        if self.chroma_e5_base is not None:
            print(f"📦 [Init] Nạp SentenceTransformer ({E5_BASE_MODEL_NAME})...")
            self.e5_base = SentenceTransformer(E5_BASE_MODEL_NAME)
        else:
            self.e5_base = None

        active_models = ["TF-IDF", "BM25", "SBERT"]
        if self.e5_small is not None:
            active_models.append("multilingual-e5-small")
        if self.e5_base is not None:
            active_models.append("multilingual-e5-base")
        print(f"   [Init] ✅ Các mô hình sẵn sàng cho Candidate Pooling: {', '.join(active_models)}\n")

    def search_tfidf(self, query: str, top_k: int) -> List[Tuple[int, float]]:
        q_tokens = self.tokenizer.tokenize(query)
        q_str = " ".join(q_tokens)
        q_vec = self.tfidf_vec.transform([q_str])
        scores = cosine_similarity(q_vec, self.tfidf_matrix).flatten()
        top_indices = scores.argsort()[::-1][: top_k * 2]

        results = []
        for idx in top_indices:
            if scores[idx] > 0:
                mid = int(self.df.iloc[idx]["movieId"])
                results.append((mid, float(scores[idx])))
            if len(results) >= top_k:
                break
        return results

    def search_bm25(self, query: str, top_k: int) -> List[Tuple[int, float]]:
        q_tokens = self.tokenizer.tokenize(query)
        scores = np.array(self.bm25.get_scores(q_tokens))
        top_indices = scores.argsort()[::-1][: top_k * 2]

        results = []
        for idx in top_indices:
            if scores[idx] > 0:
                mid = int(self.df.iloc[idx]["movieId"])
                results.append((mid, float(scores[idx])))
            if len(results) >= top_k:
                break
        return results

    def search_sbert(self, query: str, top_k: int) -> List[Tuple[int, float]]:
        emb = self.sbert.encode(query, normalize_embeddings=True).tolist()
        res = self.chroma_col.query(query_embeddings=[emb], n_results=top_k, include=["metadatas", "distances"])
        results = []
        ids = res.get("ids", [[]])[0]
        distances = res.get("distances", [[]])[0] if "distances" in res else [0.0] * len(ids)

        for sid, dist in zip(ids, distances):
            if str(sid).isdigit():
                sim = 1.0 - float(dist)
                results.append((int(sid), sim))
        return results[:top_k]

    def search_e5_small(self, query: str, top_k: int) -> List[Tuple[int, float]]:
        if self.e5_small is None or self.chroma_e5_small is None:
            return []
        formatted_q = format_query_text_for_model(query, E5_SMALL_MODEL_NAME)
        emb = self.e5_small.encode(formatted_q, normalize_embeddings=True).tolist()
        res = self.chroma_e5_small.query(query_embeddings=[emb], n_results=top_k, include=["metadatas", "distances"])
        results = []
        ids = res.get("ids", [[]])[0]
        distances = res.get("distances", [[]])[0] if "distances" in res else [0.0] * len(ids)

        for sid, dist in zip(ids, distances):
            if str(sid).isdigit():
                sim = 1.0 - float(dist)
                results.append((int(sid), sim))
        return results[:top_k]

    def search_e5_base(self, query: str, top_k: int) -> List[Tuple[int, float]]:
        if self.e5_base is None or self.chroma_e5_base is None:
            return []
        formatted_q = format_query_text_for_model(query, E5_BASE_MODEL_NAME)
        emb = self.e5_base.encode(formatted_q, normalize_embeddings=True).tolist()
        res = self.chroma_e5_base.query(query_embeddings=[emb], n_results=top_k, include=["metadatas", "distances"])
        results = []
        ids = res.get("ids", [[]])[0]
        distances = res.get("distances", [[]])[0] if "distances" in res else [0.0] * len(ids)

        for sid, dist in zip(ids, distances):
            if str(sid).isdigit():
                sim = 1.0 - float(dist)
                results.append((int(sid), sim))
        return results[:top_k]

    def pool_candidates_for_query(
        self,
        query_info: Dict[str, Any],
        top_k: int = DEFAULT_POOL_TOP_K,
        existing_candidates: Optional[Dict[int, Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """Thực hiện Candidate Pooling cho một câu truy vấn từ các mô hình:

        - Lấy Top-K từ TF-IDF, BM25, SBERT, multilingual-e5-small, multilingual-e5-base.
        - Hợp nhất và loại trùng theo movieId.
        - Giữ lại toàn bộ ứng viên cũ và các nhãn đã có.
        - Theo dõi nguồn đóng góp (pooled_by) và xếp hạng (model_ranks).
        - Đảm bảo phim nguồn có mặt trong pool nhưng KHÔNG gán sẵn grade 3 (relevance_grade = null).
        """
        qid = query_info["query_id"]
        query_text = query_info["query"]
        source_id = int(query_info["source_movie_id"])
        existing_candidates = existing_candidates or {}

        tfidf_res = self.search_tfidf(query_text, top_k=top_k)
        bm25_res = self.search_bm25(query_text, top_k=top_k)
        sbert_res = self.search_sbert(query_text, top_k=top_k)
        e5_small_res = self.search_e5_small(query_text, top_k=top_k)
        e5_base_res = self.search_e5_base(query_text, top_k=top_k)

        pooled_map: Dict[int, Dict[str, Any]] = {}

        # 1. BẢO TOÀN TOÀN BỘ ỨNG VIÊN CŨ ĐÃ CÓ CHO QUERY NÀY (giữ nhãn người dùng & LLM verdict)
        for mid, old_cand in existing_candidates.items():
            pooled_map[mid] = dict(old_cand)
            if "pooled_by" not in pooled_map[mid]:
                pooled_map[mid]["pooled_by"] = []
            if "model_ranks" not in pooled_map[mid]:
                pooled_map[mid]["model_ranks"] = {}
            if "retrieval_scores" not in pooled_map[mid]:
                pooled_map[mid]["retrieval_scores"] = {}

        def record_candidate(mid: int, model_name: str, rank: int, score: float):
            if mid not in self.movie_meta_by_id:
                return
            if mid not in pooled_map:
                meta = self.movie_meta_by_id[mid]
                pooled_map[mid] = {
                    "movie_id": mid,
                    "tmdb_id": meta["tmdb_id"],
                    "title_vi": meta["title_vi"],
                    "title_en": meta["title_en"],
                    "genres": meta["genres"],
                    "release_date": meta["release_date"],
                    "vote_average": meta["vote_average"],
                    "overview_snippet": meta["overview_snippet"],
                    "overview_full": meta["overview_full"],
                    "pooled_by": [],
                    "model_ranks": {},
                    "retrieval_scores": {},
                    "is_source_movie": (mid == source_id),
                    "relevance_grade": None,
                    "verified_by_human": False,
                    "status": "unassessed",
                    "annotated_by": "",
                    "annotated_at": "",
                    "notes": "",
                }
            if model_name not in pooled_map[mid]["pooled_by"]:
                pooled_map[mid]["pooled_by"].append(model_name)
            pooled_map[mid]["model_ranks"][model_name] = rank
            pooled_map[mid]["retrieval_scores"][model_name] = round(score, 4)

        for rank, (mid, sc) in enumerate(tfidf_res, start=1):
            record_candidate(mid, "TF-IDF", rank, sc)

        for rank, (mid, sc) in enumerate(bm25_res, start=1):
            record_candidate(mid, "BM25", rank, sc)

        for rank, (mid, sc) in enumerate(sbert_res, start=1):
            record_candidate(mid, "SBERT", rank, sc)

        for rank, (mid, sc) in enumerate(e5_small_res, start=1):
            record_candidate(mid, "multilingual-e5-small", rank, sc)

        for rank, (mid, sc) in enumerate(e5_base_res, start=1):
            record_candidate(mid, "multilingual-e5-base", rank, sc)

        # Đảm bảo source_movie_id có mặt trong pool nhưng KHÔNG tự ý gán grade 3
        if source_id in self.movie_meta_by_id:
            if source_id not in pooled_map:
                meta = self.movie_meta_by_id[source_id]
                pooled_map[source_id] = {
                    "movie_id": source_id,
                    "tmdb_id": meta["tmdb_id"],
                    "title_vi": meta["title_vi"],
                    "title_en": meta["title_en"],
                    "genres": meta["genres"],
                    "release_date": meta["release_date"],
                    "vote_average": meta["vote_average"],
                    "overview_snippet": meta["overview_snippet"],
                    "overview_full": meta["overview_full"],
                    "pooled_by": ["SourceReference"],
                    "model_ranks": {},
                    "retrieval_scores": {},
                    "is_source_movie": True,
                    "relevance_grade": None,
                    "verified_by_human": False,
                    "status": "unassessed",
                    "annotated_by": "",
                    "annotated_at": "",
                    "notes": "Phim nguồn tham chiếu ban đầu (chờ người đánh giá thẩm định)",
                }
            else:
                pooled_map[source_id]["is_source_movie"] = True
                if not pooled_map[source_id].get("verified_by_human"):
                    if not pooled_map[source_id].get("notes"):
                        pooled_map[source_id]["notes"] = "Phim nguồn tham chiếu ban đầu (chờ người đánh giá thẩm định)"

        # Xáo trộn ứng viên có thể tái lập (Reproducible Shuffling) theo seed để đánh giá mù không thiên lệch
        rng = random.Random(f"{SHUFFLE_SEED}_{qid}")
        candidates_list = list(pooled_map.values())
        rng.shuffle(candidates_list)
        return candidates_list


# ══════════════════════════════════════════════════════════════════════════════
# 4. QUY TRÌNH TỔNG HỢP VÀ ĐỒNG BỘ DỮ LIỆU
# ══════════════════════════════════════════════════════════════════════════════


def run_ground_truth_v2_pipeline(
    top_k: int = DEFAULT_POOL_TOP_K,
) -> Dict[str, Any]:
    """Chạy toàn bộ pipeline Candidate Pooling và xuất Ground Truth V2 kèm annotation queue."""
    t_start = time.time()
    print("🚀 Bắt đầu Bước 3 — Xây dựng Ground Truth V2 bằng Mở rộng Candidate Pooling...")

    # 1. Đọc 100 queries và phim nguồn Bước 2
    with open(BENCHMARK_QUERIES_FILE, "r", encoding="utf-8") as f:
        benchmark_data = json.load(f)
    queries = benchmark_data.get("queries", [])

    with open(SOURCE_MOVIES_FILE, "r", encoding="utf-8") as f:
        source_data = json.load(f)
    source_movies = source_data.get("movies", [])

    # 2. Nạp corpus
    df_corpus = load_corpus()

    # 3. Tái sử dụng xác thực của Bước 1: verify_vector_db & verify_cross_db_mapping
    chroma_col_sbert = verify_corpus_and_chromadb_guard(df_corpus, CHROMA_DIR, COLLECTION_NAME, SBERT_MODEL_NAME)
    verify_cross_db_mapping(queries, source_movies, df_corpus)

    # Kiểm tra ChromaDB collection cho E5-Small
    chroma_col_e5_small = None
    try:
        chroma_col_e5_small = verify_corpus_and_chromadb_guard(
            df_corpus, CHROMA_DIR, E5_SMALL_COLLECTION_NAME, E5_SMALL_MODEL_NAME
        )
    except Exception as e:
        print(f"   [E5-Small Warning] Chưa thể nạp collection {E5_SMALL_COLLECTION_NAME}: {e}")

    # Kiểm tra ChromaDB collection cho E5-Base
    chroma_col_e5_base = None
    try:
        manifest_e5_base = get_manifest_path(CHROMA_DIR, E5_BASE_COLLECTION_NAME)
        if manifest_e5_base.exists():
            chroma_col_e5_base = verify_corpus_and_chromadb_guard(
                df_corpus, CHROMA_DIR, E5_BASE_COLLECTION_NAME, E5_BASE_MODEL_NAME
            )
        else:
            print(f"   [E5-Base Status] Collection {E5_BASE_COLLECTION_NAME} chưa có manifest (đang hoàn thiện hoặc bỏ qua).")
    except Exception as e:
        print(f"   [E5-Base Status] Bỏ qua E5-Base: {e}")

    # 4. Kiểm tra và bảo toàn toàn bộ ứng viên và nhãn đã có từ trước
    existing_candidates_by_query: Dict[str, Dict[int, Dict[str, Any]]] = defaultdict(dict)
    initial_total_candidates = 0
    if GROUND_TRUTH_V2_FILE.exists():
        try:
            with open(GROUND_TRUTH_V2_FILE, "r", encoding="utf-8") as f:
                old_gt = json.load(f)
            for q in old_gt.get("queries", []):
                qid = q.get("query_id")
                for c in q.get("candidates", []):
                    mid = int(c["movie_id"])
                    existing_candidates_by_query[qid][mid] = dict(c)
                    initial_total_candidates += 1
        except Exception as e:
            print(f"   [Resume Warning] Không thể nạp ứng viên cũ: {e}")

    if initial_total_candidates > 0:
        print(f"   [Preserve Guard] Tìm thấy {initial_total_candidates:,} ứng viên đã có từ các phiên trước. Bảo toàn 100%!")

    # Tích hợp kết quả đánh giá của Pilot LLM Judge và Checkpoint (nếu có)
    for judge_src_file, label in [
        (GT_DIR / "pilot_llm_judge_results.json", "Pilot"),
        (GT_DIR / "llm_judge_checkpoint.json", "Full Checkpoint"),
    ]:
        if judge_src_file.exists():
            try:
                with open(judge_src_file, "r", encoding="utf-8") as f:
                    src_data = json.load(f)
                count_judged = 0
                for j in src_data.get("judgments", []):
                    pqid = j.get("query_id")
                    pmid = int(j.get("movie_id"))
                    if pqid in existing_candidates_by_query and pmid in existing_candidates_by_query[pqid]:
                        cand = existing_candidates_by_query[pqid][pmid]
                        cand["llm_grade"] = j.get("llm_grade")
                        cand["llm_verdict"] = j.get("llm_verdict")
                        cand["llm_reasoning"] = j.get("llm_reasoning")
                        cand["judge_model"] = j.get("judge_model")
                        cand["rubric_version"] = j.get("rubric_version")
                        cand["llm_judged_at"] = j.get("llm_judged_at")
                        if not cand.get("verified_by_human"):
                            cand["status"] = "llm_judged"
                        count_judged += 1
                if count_judged > 0:
                    print(f"   [LLM Judge {label}] Đã tích hợp {count_judged} kết quả vào candidates!")
            except Exception as e:
                print(f"   [LLM Judge Warning] Lỗi đọc {judge_src_file.name}: {e}")

    # 5. Khởi tạo engine pooling
    engine = PoolingEngine(
        corpus_df=df_corpus,
        chroma_col_sbert=chroma_col_sbert,
        chroma_col_e5_small=chroma_col_e5_small,
        chroma_col_e5_base=chroma_col_e5_base,
    )

    # 6. Candidate Pooling cho 100 queries
    active_models_list = ["TF-IDF", "BM25", "SBERT"]
    if chroma_col_e5_small is not None:
        active_models_list.append("multilingual-e5-small")
    if chroma_col_e5_base is not None:
        active_models_list.append("multilingual-e5-base")

    print(
        f"\n🔄 Đang thực hiện Candidate Pooling cho 100 benchmark queries "
        f"với {len(active_models_list)} mô hình ({', '.join(active_models_list)}), Top-{top_k} per model..."
    )
    gt_queries = []
    annotation_queue_items = []

    model_source_recall_hits = {m: 0 for m in active_models_list}
    model_source_recall_hits["Ensemble"] = 0
    total_candidates_pooled = 0
    unique_movies_pooled: Set[int] = set()
    verified_human_total = 0
    new_candidates_added_count = 0

    for idx, q in enumerate(queries, start=1):
        qid = q["query_id"]
        sid = int(q["source_movie_id"])
        q_type = q["query_type"]

        existing_cands_for_q = existing_candidates_by_query.get(qid, {})
        candidates = engine.pool_candidates_for_query(
            q, top_k=top_k, existing_candidates=existing_cands_for_q
        )
        total_candidates_pooled += len(candidates)
        new_candidates_added_count += max(0, len(candidates) - len(existing_cands_for_q))

        # Kiểm tra sự xuất hiện của source_movie_id
        src_cand = next((c for c in candidates if c["movie_id"] == sid), None)
        if src_cand:
            models_retrieved = src_cand.get("pooled_by", [])
            hit_any = False
            for m in active_models_list:
                if m in models_retrieved:
                    model_source_recall_hits[m] += 1
                    hit_any = True
            if hit_any:
                model_source_recall_hits["Ensemble"] += 1

        for c in candidates:
            unique_movies_pooled.add(c["movie_id"])
            if c.get("verified_by_human"):
                verified_human_total += 1

            # Hàng đợi thẩm định: cung cấp view khách quan (blinded presentation)
            annotation_queue_items.append(
                {
                    "queue_id": f"{qid}_{c['movie_id']}",
                    "query_id": qid,
                    "query_type": q_type,
                    "query": q["query"],
                    "movie_id": c["movie_id"],
                    "tmdb_id": c["tmdb_id"],
                    "title_vi": c["title_vi"],
                    "title_en": c["title_en"],
                    "genres": c["genres"],
                    "release_date": c["release_date"],
                    "vote_average": c["vote_average"],
                    "overview_snippet": c["overview_snippet"],
                    "overview_full": c["overview_full"],
                    # Lưu trữ nội bộ để phân tích
                    "pooled_by": c["pooled_by"],
                    "model_ranks": c["model_ranks"],
                    "is_source_movie": c["is_source_movie"],
                    # Trường phục vụ thẩm định khách quan (relevance_grade ban đầu là null)
                    "relevance_grade": c["relevance_grade"],
                    "verified_by_human": c["verified_by_human"],
                    "status": c["status"],
                    "annotated_by": c.get("annotated_by", ""),
                    "annotated_at": c.get("annotated_at", ""),
                    "notes": c.get("notes", ""),
                    # Thông tin LLM-as-a-Judge (nếu đã được pilot)
                    "llm_grade": c.get("llm_grade"),
                    "llm_verdict": c.get("llm_verdict"),
                    "llm_reasoning": c.get("llm_reasoning"),
                    "judge_model": c.get("judge_model"),
                    "rubric_version": c.get("rubric_version"),
                    "llm_judged_at": c.get("llm_judged_at"),
                }
            )

        gt_queries.append(
            {
                "query_id": qid,
                "query_type": q_type,
                "query": q["query"],
                "source_movie_id": sid,
                "source_evidence": q.get("source_evidence", {}),
                "total_candidates": len(candidates),
                "candidates": candidates,
            }
        )

        if idx % 20 == 0 or idx == 100:
            print(f"   [Progress] Đã hoàn thành {idx}/100 queries ({total_candidates_pooled:,} ứng viên đã pool)...")

    # 7. Thống kê kết quả
    avg_candidates_per_query = round(total_candidates_pooled / len(queries), 2)
    ensemble_recall_pct = round((model_source_recall_hits["Ensemble"] / len(queries)) * 100, 1)

    print("\n📊 ─── THỐNG KÊ CANDIDATE POOLING MỞ RỘNG (BƯỚC 3) ───")
    print(f"  • Tổng số truy vấn: {len(queries)} queries (5 nhóm x 20)")
    print(f"  • Số ứng viên ban đầu (trước mở rộng): {initial_total_candidates:,} ứng viên")
    print(f"  • Tổng số ứng viên sau khi mở rộng: {total_candidates_pooled:,} ứng viên (+{new_candidates_added_count:,} mới)")
    print(f"  • Số lượng phim duy nhất trong pool: {len(unique_movies_pooled):,} bộ phim")
    print(f"  • Trung bình ứng viên/truy vấn: {avg_candidates_per_query} phim")
    print(f"  • Recall@10 thu hồi phim nguồn Ensemble: {ensemble_recall_pct}%")
    for m in active_models_list:
        m_rec = round((model_source_recall_hits[m] / len(queries)) * 100, 1)
        print(f"      - {m}: {m_rec}%")

    # 8. Metadata đầy đủ
    gt_v2_payload = {
        "metadata": {
            "version": "2.0-ground-truth",
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "description": "Tập Ground Truth V2 mở rộng Candidate Pooling từ 100 benchmark queries Bước 2.",
            "corpus": {
                "total_movies": len(df_corpus),
                "fingerprint": compute_corpus_fingerprint(
                    df_corpus["search_text"].tolist(), df_corpus["movieId"].tolist()
                ),
                "chroma_collections": {
                    "movies": {"model": SBERT_MODEL_NAME, "vector_dim": 384},
                    "movies_e5_small": {"model": E5_SMALL_MODEL_NAME, "vector_dim": 384},
                    "movies_e5_base": {
                        "model": E5_BASE_MODEL_NAME,
                        "vector_dim": 768,
                        "status": "active" if chroma_col_e5_base is not None else "building_or_omitted",
                    },
                },
            },
            "total_queries": len(queries),
            "query_distribution": {
                "Lexical": sum(1 for q in queries if q["query_type"] == "Lexical"),
                "Semantic": sum(1 for q in queries if q["query_type"] == "Semantic"),
                "Abstract": sum(1 for q in queries if q["query_type"] == "Abstract"),
                "Typo_Slang": sum(1 for q in queries if q["query_type"] == "Typo_Slang"),
                "Short_Long": sum(1 for q in queries if q["query_type"] == "Short_Long"),
            },
            "candidate_pooling": {
                "models": active_models_list,
                "pool_depth_per_model": top_k,
                "candidates_before_expansion": initial_total_candidates,
                "total_pooled_candidates": total_candidates_pooled,
                "new_candidates_added": new_candidates_added_count,
                "unique_movies_pooled": len(unique_movies_pooled),
                "avg_candidates_per_query": avg_candidates_per_query,
                "source_movie_recall_at_10_ensemble": ensemble_recall_pct,
                "source_movie_recall_by_model": {
                    m: round((model_source_recall_hits[m] / len(queries)) * 100, 1)
                    for m in active_models_list
                },
                "bge_m3_evaluation": {
                    "status": "excluded",
                    "reason": (
                        "BAAI/bge-m3 có 567 triệu tham số (~2.24 GB trọng số FP16, yêu cầu >3.5 GB RAM khi suy luận CPU). "
                        "Hệ thống hiện tại chạy CPU với ~3.2 GB RAM khả dụng; tốc độ suy luận đo được ~6-7 văn bản/giây "
                        "(mất >40 phút cho toàn bộ corpus và có nguy cơ Out-Of-Memory cao). "
                        "Theo yêu cầu dự án, BGE-M3 được loại khỏi danh sách benchmark chính thức; "
                        "khả năng biểu diễn ngữ nghĩa đa ngôn ngữ được đảm bảo toàn diện bởi paraphrase-multilingual-MiniLM-L12-v2, "
                        "multilingual-e5-small và multilingual-e5-base."
                    ),
                },
                "shuffled_reproducible": True,
                "shuffle_seed": SHUFFLE_SEED,
            },
            "relevance_scale": {
                "3": "Rất liên quan (Exact / Primary match — khớp hoàn toàn chủ đề, thực thể hoặc ý định)",
                "2": "Liên quan (Strong partial match — cùng thể loại chính, liên quan cao đến cốt truyện/chủ đề)",
                "1": "Liên quan một phần (Weak / Peripheral match — chỉ chia sẻ một yếu tố phụ/thể loại)",
                "0": "Không liên quan (Irrelevant — hoàn toàn không đúng ý định)",
            },
            "evaluation_standards": {
                "binary_relevance_threshold": BINARY_RELEVANCE_THRESHOLD,
                "binary_metrics_note": "Các độ đo nhị phân (Precision@K, Recall@K, MRR) sử dụng ngưỡng Grade >= 2.",
                "graded_metrics_note": "Độ đo đa mức độ (NDCG@K) sử dụng trực tiếp thang điểm 0, 1, 2, 3.",
                "unassessed_vs_zero_note": "Phân biệt tuyệt đối: Phim chưa đánh giá có relevance_grade = null (status: 'unassessed'); Phim được xác nhận không liên quan có relevance_grade = 0 (status: 'verified').",
            },
            "annotation_status": {
                "total_candidates": total_candidates_pooled,
                "verified_by_human_count": verified_human_total,
                "unassessed_count": total_candidates_pooled - verified_human_total,
                "source_movies_count": 100,
                "source_movies_human_verified": sum(
                    1
                    for q in gt_queries
                    for c in q["candidates"]
                    if c.get("is_source_movie") and c.get("verified_by_human")
                ),
            },
            "ground_truth_policy": (
                "1. source_movie_id chỉ là tài liệu tham chiếu ban đầu, KHÔNG PHẢI là đáp án duy nhất. "
                "2. Không tự động đánh dấu nhãn LLM hay phim nguồn là đã được con người xác minh (verified_by_human: false). "
                "3. relevance_grade của toàn bộ ứng viên chưa đánh giá đều là null cho đến khi chuyên gia xác nhận. "
                "4. Khi human annotation, ẩn toàn bộ thông tin model, rank và phim nguồn để tránh thiên lệch."
            ),
        },
        "queries": gt_queries,
    }

    # 9. Ghi file
    print(f"\n💾 Đang ghi tệp Ground Truth V2 tại: {GROUND_TRUTH_V2_FILE}...")
    with open(GROUND_TRUTH_V2_FILE, "w", encoding="utf-8") as f:
        json.dump(gt_v2_payload, f, ensure_ascii=False, indent=2)

    print(f"💾 Đang ghi hàng đợi đánh giá tại: {ANNOTATION_QUEUE_FILE}...")
    queue_payload = {
        "metadata": {
            "version": "2.0-annotation-queue",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_items": len(annotation_queue_items),
            "pending_annotation_items": total_candidates_pooled - verified_human_total,
            "verified_items": verified_human_total,
            "blinded_evaluation": True,
        },
        "queue": annotation_queue_items,
    }
    with open(ANNOTATION_QUEUE_FILE, "w", encoding="utf-8") as f:
        json.dump(queue_payload, f, ensure_ascii=False, indent=2)

    elapsed = round(time.time() - t_start, 1)
    print(f"✅ Hoàn thành xuất Ground Truth V2 mở rộng trong {elapsed}s!\n")
    return gt_v2_payload


# ══════════════════════════════════════════════════════════════════════════════
# 5. ENTRYPOINT CLI
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Xây dựng Ground Truth V2 bằng Candidate Pooling (Bước 3)")
    parser.add_argument(
        "--top_k",
        type=int,
        default=DEFAULT_POOL_TOP_K,
        help=f"Độ sâu pooling per model (mặc định: {DEFAULT_POOL_TOP_K})",
    )
    args = parser.parse_args()

    run_ground_truth_v2_pipeline(top_k=args.top_k)
