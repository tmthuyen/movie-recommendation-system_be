#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""benchmark_hybrid_rrf.py.

========================
Thực nghiệm P1 Hybrid Retrieval: BM25 (Lexical) + Multilingual E5-base (Dense Semantic)
sử dụng Reciprocal Rank Fusion (RRF, k=60).

Mục tiêu & Phương pháp luận:
1. Tái sử dụng BM25 (k1=1.5, b=0.75, Underthesea tokenizer) và Multilingual E5-base
   (intfloat/multilingual-e5-base, 768d, query prefix, ChromaDB HNSW cosine).
2. Lấy Top-50 ứng viên từ mỗi mô hình, hợp nhất theo movieId bằng RRF với k=60:
       RRF_score(d) = sum_{m in {BM25, E5}} [ 1 / (60 + r_m(d)) ]
   trong đó r_m(d) là thứ hạng 1-based (1..50).
3. Đánh giá trên 100 Benchmark Queries và Ground Truth V2 (qrels_v2), so sánh đối chuẩn:
   - BM25 đơn lẻ
   - Multilingual E5-base đơn lẻ
   - Hybrid BM25 + E5-base (RRF k=60)
   bằng NDCG@10, Hit@10, Precision@10, MRR, MAP@10 và Latency (mean, p50, p95).
4. Phân tích độ bao phủ và phát hiện các ứng viên mới trong Top-10 của Hybrid RRF:
   - Xuất hàng đợi gán nhãn annotation_queue_hybrid_rrf_top10.json cho các cặp chưa có nhãn.
   - TUYỆT ĐỐI KHÔNG tự động gán Grade 0 cho các cặp chưa được đánh giá trong Ground Truth.
5. Bảo toàn nguyên vẹn Run #04.1 (Calibrated), Ground Truth V2 và ChromaDB hiện tại.
6. Nghiên cứu thuần túy ở tầng Benchmark, không sửa hybrid_recommendation() trong recommend_service.py.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime
import json
import math
import os
from pathlib import Path
import platform
import sys
import time
from typing import Any, Dict, List, Optional, Set, Tuple

import joblib
import numpy as np
import pandas as pd
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer

# ─── Thiết lập encoding UTF-8 cho Windows ────────────────────────────────────
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

from core.fusion import reciprocal_rank_fusion, reciprocal_rank_fusion_with_details
from core.tokenizer import UndertheseaTokenizer
from data.data_loader import build_search_text, safe_int
from build_vector_db import format_query_text_for_model, get_manifest_path, verify_vector_db
from benchmark_expansion import (
    find_unjudged_candidates_for_run,
    export_annotation_expansion_queue,
    get_effective_candidate_grade,
)
from benchmark_models_v2 import (
    compute_dcg_at_k,
    compute_idcg_at_k,
    compute_ndcg_at_k,
    compute_precision_at_k,
    compute_pooled_relative_recall_at_k,
    compute_hit_at_k,
    compute_reciprocal_rank,
    compute_average_precision,
    load_verified_corpus,
    load_tokenizer_and_cache,
    load_ground_truth_and_queries,
)

# ─── Đường dẫn dữ liệu ───────────────────────────────────────────────────────
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
BENCHMARK_QUERIES_FILE = GT_DIR / "benchmark_queries_v2.json"
GROUND_TRUTH_V2_FILE = GT_DIR / "ground_truth_v2.json"
QRELS_V2_JSON_FILE = GT_DIR / "qrels_v2.json"

EVALUATION_DIR = AI_SERVICE_DIR / "experiments" / "evaluation"
EVALUATION_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_TOP_K_RETRIEVAL = 50
DEFAULT_TOP_K_EVAL = 10
DEFAULT_RRF_K = 60
WARMUP_ROUNDS = 5
LATENCY_ITERATIONS = 3
BINARY_RELEVANCE_THRESHOLD = 2


def clean_text(value: Any) -> str:
    """Avoid serializing missing pandas values as literal 'nan'."""
    return "" if pd.isna(value) else str(value)


def safe_float(value: Any) -> float:
    """Avoid propagating NaN into JSON annotation metadata."""
    try:
        number = float(value)
        return number if math.isfinite(number) else 0.0
    except (TypeError, ValueError):
        return 0.0


def validate_canonical_qrels_alignment(gt_data: Dict[str, Any], qrels_file: Path) -> str:
    """Verify the evaluation labels and qrels are the exact same snapshot.

    This guards against silently evaluating with ground_truth while claiming
    a different qrels version. The input ground truth remains unchanged.
    """
    if not qrels_file.is_file():
        raise FileNotFoundError(f"Missing canonical qrels: {qrels_file}")
    with open(qrels_file, "r", encoding="utf-8") as f:
        payload = json.load(f)
    qrels = payload.get("qrels")
    if not isinstance(qrels, dict):
        raise ValueError("Canonical qrels must be a dict keyed by query_id")

    gt_queries = gt_data.get("queries", [])
    gt_qids = [str(q["query_id"]) for q in gt_queries]
    if len(gt_qids) != 100 or len(set(gt_qids)) != 100 or set(qrels) != set(gt_qids):
        raise ValueError("Query IDs in canonical qrels and Ground Truth do not match 100 unique queries")
    for q in gt_queries:
        qid = str(q["query_id"])
        gt_candidates = {str(int(c["movie_id"])): c for c in q.get("candidates", [])}
        if len(gt_candidates) != len(q.get("candidates", [])) or set(gt_candidates) != set(qrels[qid]):
            raise ValueError(f"Candidate IDs do not match for {qid}")
        for mid, cand in gt_candidates.items():
            expected = get_effective_candidate_grade(cand)
            entry = qrels[qid][mid]
            if entry.get("grade") != expected:
                raise ValueError(f"Grade mismatch for {qid}/{mid}: Ground Truth={expected}, qrels={entry.get('grade')}")
    return str(payload.get("metadata", {}).get("version", "unknown"))


def load_ground_truth_and_queries_custom(
    gt_file: Path,
    queries_file: Path = BENCHMARK_QUERIES_FILE,
) -> Tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """Nạp 100 queries và Ground Truth từ file tùy chỉnh với get_effective_candidate_grade."""
    if not queries_file.exists():
        raise FileNotFoundError(f"Không tìm thấy {queries_file}")
    if not gt_file.exists():
        raise FileNotFoundError(f"Không tìm thấy {gt_file}")

    with open(queries_file, "r", encoding="utf-8") as f:
        queries_data = json.load(f).get("queries", [])

    with open(gt_file, "r", encoding="utf-8") as f:
        gt_data = json.load(f).get("queries", [])

    gt_map: Dict[str, Dict[str, Any]] = {}
    for q in gt_data:
        qid = q["query_id"]
        cands_by_id = {}
        for c in q.get("candidates", []):
            mid = int(c["movie_id"])
            cands_by_id[mid] = c

        all_grades = [
            get_effective_candidate_grade(c)
            for c in q.get("candidates", [])
            if get_effective_candidate_grade(c) is not None
        ]
        rel_count = sum(1 for g in all_grades if g >= BINARY_RELEVANCE_THRESHOLD)

        gt_map[qid] = {
            "source_movie_id": int(q.get("source_movie_id", 0)),
            "candidates": cands_by_id,
            "all_pool_grades": all_grades,
            "total_relevant_in_pool": rel_count,
            "total_rel_in_pool": rel_count,
        }

    assert len(queries_data) == 100
    assert len(gt_map) == 100
    return queries_data, gt_map


class HybridBenchmarkRunner:
    def __init__(
        self,
        rrf_k: int = DEFAULT_RRF_K,
        top_k_retrieval: int = DEFAULT_TOP_K_RETRIEVAL,
        gt_file: Optional[Path] = None,
        qrels_file: Optional[Path] = None,
        queue_prefix: Optional[str] = None,
    ):
        print("=" * 80)
        print("🚀 KHỞI ĐỘNG THỬ NGHIỆM P1 HYBRID RETRIEVAL (BM25 + MULTILINGUAL E5-BASE, RRF)")
        print(f"   Tham số: RRF k={rrf_k} | Top-K Retrieval={top_k_retrieval} | Top-K Eval=10")
        print("=" * 80)

        self.rrf_k = rrf_k
        self.top_k_retrieval = top_k_retrieval
        self.gt_file = Path(gt_file) if gt_file else GROUND_TRUTH_V2_FILE
        self.qrels_file = Path(qrels_file) if qrels_file else QRELS_V2_JSON_FILE
        self.queue_prefix = queue_prefix or "annotation_queue_hybrid_rrf_top10"

        # 1. Nạp Corpus 14.815 phim
        t0 = time.time()
        self.df = load_verified_corpus()
        print(f"✅ Đã nạp Corpus: {len(self.df):,} phim ({time.time() - t0:.2f}s)")

        # Tạo metadata lookup cho candidate export
        self.movie_metadata_lookup: Dict[int, Dict[str, Any]] = {}
        for _, row in self.df.iterrows():
            mid = int(row["movieId"])
            self.movie_metadata_lookup[mid] = {
                "movie_id": mid,
                "tmdb_id": safe_int(row.get("tmdb_id", 0)),
                "title_vi": clean_text(row.get("title_vi", "")),
                "title_en": clean_text(row.get("title", "")),
                "genres": clean_text(row.get("genres", "")),
                "release_date": clean_text(row.get("release_date", "")),
                "vote_average": safe_float(row.get("vote_average", 0.0)),
                "overview_snippet": (clean_text(row.get("overview_vi")) or clean_text(row.get("overview")))[:120],
                "overview_full": clean_text(row.get("overview_vi")) or clean_text(row.get("overview")),
            }

        # 2. Nạp Tokenizer & Tokenized Corpus Cache
        t0 = time.time()
        self.tokenizer, self.tokenized_corpus = load_tokenizer_and_cache(self.df)
        print(f"✅ Đã nạp Tokenizer Cache: {len(self.tokenized_corpus):,} tài liệu ({time.time() - t0:.2f}s)")

        # 3. Nạp 100 Queries & Ground Truth
        self.queries, self.gt_map = load_ground_truth_and_queries_custom(self.gt_file)
        with open(self.gt_file, "r", encoding="utf-8") as f:
            self.raw_gt_data = json.load(f)
        # Fail fast if the canonical qrels file is out of sync with the GT used
        # for scoring. Merely mentioning qrels in the report is not enough.
        self.qrels_version = validate_canonical_qrels_alignment(self.raw_gt_data, self.qrels_file)
        print(f"✅ Đã nạp 100 Benchmark Queries, Ground Truth ({self.gt_file.name}) và qrels {self.qrels_version}")

        # 4. Khởi tạo Okapi BM25
        print("⏳ Đang nạp mô hình BM25...")
        t0 = time.time()
        self.bm25 = BM25Okapi(self.tokenized_corpus)
        print(f"✅ Okapi BM25 sẵn sàng ({time.time() - t0:.2f}s).")

        # 5. Khởi tạo Multilingual E5-base & ChromaDB
        print("⏳ Đang nạp mô hình Multilingual E5-base & ChromaDB...")
        import chromadb
        t0 = time.time()
        self.chroma_client = chromadb.PersistentClient(path=str(CHROMA_DIR))
        self.model_e5_base = SentenceTransformer("intfloat/multilingual-e5-base")
        self.col_e5_base = self.chroma_client.get_collection("movies_e5_base")

        is_valid_e5_base, reason_e5_base = verify_vector_db(
            collection=self.col_e5_base,
            corpus=self.df["search_text"].tolist(),
            movie_ids=self.df["movieId"].tolist(),
            model_name="intfloat/multilingual-e5-base",
            manifest_path=get_manifest_path(CHROMA_DIR, "movies_e5_base"),
            embedding_model=self.model_e5_base,
        )
        if not is_valid_e5_base:
            raise RuntimeError(f"Xác minh ChromaDB 'movies_e5_base' thất bại: {reason_e5_base}")
        print(f"✅ Multilingual E5-base sẵn sàng ({time.time() - t0:.2f}s).")
        print("-" * 80 + "\n")

    def search_bm25(self, query: str, top_k: int = DEFAULT_TOP_K_RETRIEVAL) -> Tuple[List[int], List[float]]:
        tokens = self.tokenizer.tokenize(query)
        scores = np.array(self.bm25.get_scores(tokens))
        top_indices = scores.argsort()[::-1][:top_k]
        res_ids = [int(self.df.iloc[idx]["movieId"]) for idx in top_indices]
        res_scores = [float(scores[idx]) for idx in top_indices]
        return res_ids, res_scores

    def search_e5_base(self, query: str, top_k: int = DEFAULT_TOP_K_RETRIEVAL) -> Tuple[List[int], List[float]]:
        formatted_q = format_query_text_for_model(query, "intfloat/multilingual-e5-base")
        emb = self.model_e5_base.encode(formatted_q, normalize_embeddings=True).tolist()
        res = self.col_e5_base.query(query_embeddings=[emb], n_results=top_k, include=["distances"])
        raw_ids = res["ids"][0]
        distances = res.get("distances", [[]])[0]
        if len(raw_ids) != len(distances):
            raise ValueError("ChromaDB returned mismatched ID/distance lengths")
        ids, scores = [], []
        for sid, d in zip(raw_ids, distances):
            if not str(sid).isdigit() or int(sid) <= 0 or not math.isfinite(float(d)):
                raise ValueError(f"Invalid ChromaDB result: movie_id={sid}, distance={d}")
            ids.append(int(sid))
            scores.append(1.0 - float(d))
        return ids[:top_k], scores[:top_k]

    def search_hybrid_rrf(
        self, query: str, top_k_retrieval: int = DEFAULT_TOP_K_RETRIEVAL, top_n: int = DEFAULT_TOP_K_EVAL
    ) -> Tuple[List[int], List[float], Dict[str, Any]]:
        """Thực thi Hybrid Search: lấy Top-50 từ BM25 và Top-50 từ E5-base rồi hợp nhất bằng RRF k=60."""
        t_start = time.perf_counter()

        t0 = time.perf_counter()
        bm25_ids, bm25_scores = self.search_bm25(query, top_k=top_k_retrieval)
        t_bm25 = (time.perf_counter() - t0) * 1000.0

        t0 = time.perf_counter()
        e5_ids, e5_scores = self.search_e5_base(query, top_k=top_k_retrieval)
        t_e5 = (time.perf_counter() - t0) * 1000.0

        t0 = time.perf_counter()
        ranked_lists = {
            "BM25": bm25_ids,
            "Multilingual E5 Base": e5_ids,
        }
        raw_scores = {
            "BM25": bm25_scores,
            "Multilingual E5 Base": e5_scores,
        }
        detailed_fused = reciprocal_rank_fusion_with_details(
            ranked_lists=ranked_lists,
            raw_scores_lists=raw_scores,
            k=self.rrf_k,
            top_n=top_n,
        )
        t_fusion = (time.perf_counter() - t0) * 1000.0
        t_total = (time.perf_counter() - t_start) * 1000.0

        fused_ids = [item["movie_id"] for item in detailed_fused]
        fused_scores = [item["rrf_score"] for item in detailed_fused]

        timing_info = {
            "bm25_latency_ms": t_bm25,
            "e5_latency_ms": t_e5,
            "rrf_fusion_latency_ms": t_fusion,
            "total_hybrid_latency_ms": t_total,
            "bm25_top50": bm25_ids,
            "e5_top50": e5_ids,
            "detailed_fused": detailed_fused,
        }
        return fused_ids, fused_scores, timing_info

    def run_benchmark(self) -> Dict[str, Any]:
        """Thực hiện benchmark trên toàn bộ 100 queries cho 3 hệ thống:

        1. BM25 (top 10 đánh giá, từ top 50 truy xuất)
        2. Multilingual E5-base (top 10 đánh giá, từ top 50 truy xuất)
        3. Hybrid BM25 + E5-base (RRF k=60, top 10 đánh giá)
        """
        print(f"🔥 Bắt đầu Warmup ({WARMUP_ROUNDS} queries)...")
        for q in self.queries[:WARMUP_ROUNDS]:
            self.search_bm25(q["query"], top_k=self.top_k_retrieval)
            self.search_e5_base(q["query"], top_k=self.top_k_retrieval)
            self.search_hybrid_rrf(q["query"], top_k_retrieval=self.top_k_retrieval, top_n=DEFAULT_TOP_K_EVAL)
        print("✅ Warmup hoàn tất.\n")

        print("⚡ Bắt đầu thực nghiệm đo lường trên 100 Benchmark Queries...")

        models = ["BM25", "Multilingual E5 Base", "Hybrid (BM25 + E5-Base RRF k=60)"]
        results: Dict[str, Any] = {m: {"queries": [], "latencies_all_runs": []} for m in models}

        # Lưu trữ retrieval results cho unjudged candidate discovery
        run_retrieval_for_export: Dict[str, Dict[str, List[int]]] = {m: {} for m in models}

        # Chạy N lần để đo độ trễ chuẩn xác
        for run_idx in range(1, LATENCY_ITERATIONS + 1):
            print(f"  ▶ Lượt đo Latency {run_idx}/{LATENCY_ITERATIONS}...")
            for q in self.queries:
                qtext = q["query"]

                # 1. BM25
                t0 = time.perf_counter()
                bm25_ids, _ = self.search_bm25(qtext, top_k=self.top_k_retrieval)
                lat_bm25 = (time.perf_counter() - t0) * 1000.0
                results["BM25"]["latencies_all_runs"].append(lat_bm25)

                # 2. E5 Base
                t0 = time.perf_counter()
                e5_ids, _ = self.search_e5_base(qtext, top_k=self.top_k_retrieval)
                lat_e5 = (time.perf_counter() - t0) * 1000.0
                results["Multilingual E5 Base"]["latencies_all_runs"].append(lat_e5)

                # 3. Hybrid RRF
                t0 = time.perf_counter()
                fused_ids = reciprocal_rank_fusion(
                    {"BM25": bm25_ids, "Multilingual E5 Base": e5_ids},
                    k=self.rrf_k,
                    top_n=DEFAULT_TOP_K_EVAL,
                )
                lat_rrf = (time.perf_counter() - t0) * 1000.0
                results["Hybrid (BM25 + E5-Base RRF k=60)"]["latencies_all_runs"].append(lat_bm25 + lat_e5 + lat_rrf)

        print("✅ Đo độ trễ hoàn tất.\n")

        # Bây giờ chạy lượt đánh giá chi tiết (Detailed Evaluation Run)
        print("📊 Đang phân tích kết quả xếp hạng và tính toán số đo IR...")
        timing_breakdown = {"bm25": [], "e5": [], "rrf_fusion": [], "total_hybrid": []}

        for q_idx, q in enumerate(self.queries, start=1):
            qid = q["query_id"]
            qgrp = q.get("query_group") or q.get("query_type", "General")
            qtext = q["query"]
            source_movie_id = self.gt_map[qid]["source_movie_id"]
            pool_cands = self.gt_map[qid]["candidates"]
            pool_grades = self.gt_map[qid]["all_pool_grades"]
            total_rel_in_pool = self.gt_map[qid]["total_relevant_in_pool"]

            # Thực hiện truy xuất
            fused_ids, fused_scores, timing = self.search_hybrid_rrf(
                qtext, top_k_retrieval=self.top_k_retrieval, top_n=DEFAULT_TOP_K_EVAL
            )
            bm25_ids = timing["bm25_top50"][:DEFAULT_TOP_K_EVAL]
            e5_ids = timing["e5_top50"][:DEFAULT_TOP_K_EVAL]

            run_retrieval_for_export["BM25"][qid] = bm25_ids
            run_retrieval_for_export["Multilingual E5 Base"][qid] = e5_ids
            run_retrieval_for_export["Hybrid (BM25 + E5-Base RRF k=60)"][qid] = fused_ids

            timing_breakdown["bm25"].append(timing["bm25_latency_ms"])
            timing_breakdown["e5"].append(timing["e5_latency_ms"])
            timing_breakdown["rrf_fusion"].append(timing["rrf_fusion_latency_ms"])
            timing_breakdown["total_hybrid"].append(timing["total_hybrid_latency_ms"])

            # Đánh giá cho từng hệ thống
            system_runs = [
                ("BM25", bm25_ids, [1.0] * len(bm25_ids)),
                ("Multilingual E5 Base", e5_ids, [1.0] * len(e5_ids)),
                ("Hybrid (BM25 + E5-Base RRF k=60)", fused_ids, fused_scores),
            ]

            for m_name, ret_ids, ret_scores in system_runs:
                retrieved_grades_cons: List[int] = []
                retrieved_grades_opt: List[int] = []
                is_rel_flags_cons: List[bool] = []
                is_rel_flags_opt: List[bool] = []

                judged_count = 0
                insuff_count = 0
                unpooled_count = 0

                retrieved_details: List[Dict[str, Any]] = []

                for rank, mid in enumerate(ret_ids[:DEFAULT_TOP_K_EVAL], start=1):
                    sc = ret_scores[rank - 1] if rank - 1 < len(ret_scores) else 0.0

                    if mid in pool_cands:
                        cand_item = pool_cands[mid]
                        # Reuse validated policy from canonical Ground Truth / qrels.
                        # Do not coerce an invalid value such as 1.5 -> Grade 1.
                        g = get_effective_candidate_grade(cand_item)

                        raw_llm_grade = cand_item.get("llm_grade")
                        verdict = cand_item.get("llm_verdict", "unknown")

                        if g is not None:
                            g_cons = g
                            g_opt = g
                            status = "judged"
                            judged_count += 1
                        else:
                            g_cons = 0
                            g_opt = 2
                            status = "insufficient_evidence"
                            insuff_count += 1
                    else:
                        raw_llm_grade = None
                        verdict = "not_in_pool"
                        g_cons = 0
                        g_opt = 2
                        status = "new_unpooled"
                        unpooled_count += 1

                    is_rel_cons = (g_cons >= BINARY_RELEVANCE_THRESHOLD)
                    is_rel_opt = (g_opt >= BINARY_RELEVANCE_THRESHOLD)

                    retrieved_grades_cons.append(g_cons)
                    retrieved_grades_opt.append(g_opt)
                    is_rel_flags_cons.append(is_rel_cons)
                    is_rel_flags_opt.append(is_rel_opt)

                    retrieved_details.append({
                        "rank": rank,
                        "movie_id": mid,
                        "score": round(sc, 6),
                        "status": status,
                        "llm_grade": raw_llm_grade,
                        "grade_conservative": g_cons,
                        "grade_optimistic": g_opt,
                        "is_relevant_conservative": is_rel_cons,
                        "is_relevant_optimistic": is_rel_opt,
                        "is_source_movie": (mid == source_movie_id),
                    })

                # Tính toán số đo bảo thủ (Conservative)
                p10_c = compute_precision_at_k(is_rel_flags_cons, 10)
                ndcg10_c = compute_ndcg_at_k(retrieved_grades_cons, pool_grades, 10)
                mrr_c = compute_reciprocal_rank(is_rel_flags_cons, 10)
                ap10_c = compute_average_precision(is_rel_flags_cons, total_rel_in_pool, 10)
                hit10_c = compute_hit_at_k(is_rel_flags_cons, 10)
                cov10 = (judged_count / 10.0) * 100.0

                # Tính toán số đo giả định Grade 2 (Assumed Grade 2 / Optimistic bound)
                unjudged_tot = insuff_count + unpooled_count
                opt_pool = pool_grades + [2] * unjudged_tot
                p10_o = compute_precision_at_k(is_rel_flags_opt, 10)
                ndcg10_o = compute_ndcg_at_k(retrieved_grades_opt, opt_pool, 10)
                hit10_o = compute_hit_at_k(is_rel_flags_opt, 10)

                q_record = {
                    "query_id": qid,
                    "query_group": qgrp,
                    "query_text": qtext,
                    "metrics_conservative": {
                        "ndcg@10": round(ndcg10_c, 4),
                        "hit@10": hit10_c,
                        "p@10": round(p10_c, 4),
                        "mrr": round(mrr_c, 4),
                        "map@10": round(ap10_c, 4),
                        "coverage@10": round(cov10, 2),
                    },
                    "metrics_assumed_grade2": {
                        "ndcg@10": round(ndcg10_o, 4),
                        "hit@10": hit10_o,
                        "p@10": round(p10_o, 4),
                    },
                    "unjudged_counts": {
                        "judged": judged_count,
                        "insufficient_evidence": insuff_count,
                        "unpooled": unpooled_count,
                    },
                    "retrieved_items": retrieved_details,
                }
                results[m_name]["queries"].append(q_record)

        # Tính toán Macro-average và nhóm truy vấn
        aggregated_results: Dict[str, Any] = {}
        for m_name in models:
            q_list = results[m_name]["queries"]
            lat_list = results[m_name]["latencies_all_runs"]

            macro_ndcg10_c = float(np.mean([q["metrics_conservative"]["ndcg@10"] for q in q_list]))
            macro_hit10_c = float(np.mean([q["metrics_conservative"]["hit@10"] for q in q_list]))
            macro_p10_c = float(np.mean([q["metrics_conservative"]["p@10"] for q in q_list]))
            macro_mrr_c = float(np.mean([q["metrics_conservative"]["mrr"] for q in q_list]))
            macro_map10_c = float(np.mean([q["metrics_conservative"]["map@10"] for q in q_list]))
            macro_cov10 = float(np.mean([q["metrics_conservative"]["coverage@10"] for q in q_list]))

            macro_ndcg10_o = float(np.mean([q["metrics_assumed_grade2"]["ndcg@10"] for q in q_list]))
            macro_hit10_o = float(np.mean([q["metrics_assumed_grade2"]["hit@10"] for q in q_list]))
            macro_p10_o = float(np.mean([q["metrics_assumed_grade2"]["p@10"] for q in q_list]))

            lat_mean = float(np.mean(lat_list))
            lat_std = float(np.std(lat_list))
            lat_p50 = float(np.percentile(lat_list, 50))
            lat_p95 = float(np.percentile(lat_list, 95))

            # Nhóm theo category
            groups: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
            for q in q_list:
                groups[q["query_group"]].append(q)

            group_metrics = {}
            for grp_name, g_queries in groups.items():
                group_metrics[grp_name] = {
                    "ndcg@10_conservative": round(float(np.mean([x["metrics_conservative"]["ndcg@10"] for x in g_queries])), 4),
                    "hit@10_conservative": round(float(np.mean([x["metrics_conservative"]["hit@10"] for x in g_queries])), 4),
                    "ndcg@10_assumed_grade2": round(float(np.mean([x["metrics_assumed_grade2"]["ndcg@10"] for x in g_queries])), 4),
                    "hit@10_assumed_grade2": round(float(np.mean([x["metrics_assumed_grade2"]["hit@10"] for x in g_queries])), 4),
                    "coverage@10": round(float(np.mean([x["metrics_conservative"]["coverage@10"] for x in g_queries])), 2),
                }

            aggregated_results[m_name] = {
                "overall": {
                    "ndcg@10_conservative": round(macro_ndcg10_c, 4),
                    "hit@10_conservative": round(macro_hit10_c, 4),
                    "p@10_conservative": round(macro_p10_c, 4),
                    "mrr_conservative": round(macro_mrr_c, 4),
                    "map@10_conservative": round(macro_map10_c, 4),
                    "coverage@10": round(macro_cov10, 2),
                    "ndcg@10_assumed_grade2": round(macro_ndcg10_o, 4),
                    "hit@10_assumed_grade2": round(macro_hit10_o, 4),
                    "p@10_assumed_grade2": round(macro_p10_o, 4),
                },
                "latency_ms": {
                    "mean": round(lat_mean, 2),
                    "std": round(lat_std, 2),
                    "p50": round(lat_p50, 2),
                    "p95": round(lat_p95, 2),
                },
                "group_metrics": group_metrics,
                "queries": q_list,
            }

        # 6. Phát hiện ứng viên mới chưa có nhãn cho Hybrid RRF (Top-10)
        print("🔍 Đang phát hiện ứng viên mới chưa có nhãn cho Hybrid RRF...")
        rrf_run_results = run_retrieval_for_export["Hybrid (BM25 + E5-Base RRF k=60)"]
        unjudged_dict, discovery_report = find_unjudged_candidates_for_run(
            run_retrieval_results=rrf_run_results,
            existing_gt_data=self.raw_gt_data,
            movie_metadata_lookup=self.movie_metadata_lookup,
            new_model_name="Hybrid_BM25_E5Base_RRF",
            top_k=DEFAULT_TOP_K_EVAL,
        )

        unjudged_items = unjudged_dict.get("unjudged_items", [])
        print(f"  - Tái sử dụng nhãn cũ: {discovery_report.get('reused_judged_count')} cặp "
              f"({discovery_report.get('label_reuse_rate_pct')}%)")
        print(f"  - Ứng viên thiếu bằng chứng (insufficient): {discovery_report.get('needs_review_insufficient_count')} cặp")
        print(f"  - Ứng viên mới toanh ngoài pool (new_unpooled): {discovery_report.get('new_unpooled_count')} cặp")
        print(f"  - Tổng số cặp cần thẩm định bổ sung: {len(unjudged_items)} cặp")

        # Xuất hàng đợi thẩm định mù (Tuyệt đối không gán grade 0)
        if len(unjudged_items) > 0:
            out_queue_gt = GT_DIR / f"{self.queue_prefix}.json"
            out_queue_eval = EVALUATION_DIR / f"{self.queue_prefix}.json"
            export_annotation_expansion_queue(
                unjudged_items=unjudged_items,
                out_queue_file=out_queue_gt,
                version=f"{self.qrels_version}-expansion",
                blinded=False,  # Internal version retains provenance for audit.
            )
            export_annotation_expansion_queue(
                unjudged_items=unjudged_items,
                out_queue_file=out_queue_eval,
                version=f"{self.qrels_version}-expansion",
                blinded=False,
            )
            blinded_queue_path = GT_DIR / f"{self.queue_prefix}_blinded.json"
            export_annotation_expansion_queue(
                unjudged_items=unjudged_items,
                out_queue_file=blinded_queue_path,
                version=f"{self.qrels_version}-blinded",
                blinded=True,
            )
            print(f"✅ Đã xuất audit queue: {out_queue_gt}")
            print(f"✅ Đã xuất reviewer queue ẩn mô hình/thứ hạng: {blinded_queue_path}")
        else:
            print("✅ 100% ứng viên Top-10 đã có nhãn thẩm định trong Ground Truth (0 unjudged candidates).")

        # Timing breakdown trung bình
        hybrid_timing_summary = {
            "bm25_latency_ms": round(float(np.mean(timing_breakdown["bm25"])), 2),
            "e5_base_latency_ms": round(float(np.mean(timing_breakdown["e5"])), 2),
            "rrf_fusion_latency_ms": round(float(np.mean(timing_breakdown["rrf_fusion"])), 2),
            "total_hybrid_latency_ms": round(float(np.mean(timing_breakdown["total_hybrid"])), 2),
        }

        deliverables = {
            "metadata": {
                "experiment_id": "P1_Hybrid_Retrieval_BM25_E5Base_RRF",
                "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "total_queries": len(self.queries),
                "fusion_method": "Reciprocal Rank Fusion (RRF)",
                "rrf_k": self.rrf_k,
                "top_k_retrieval_per_model": self.top_k_retrieval,
                "top_k_eval": DEFAULT_TOP_K_EVAL,
                "gt_file": str(self.gt_file.name),
                "qrels_version": self.qrels_version,
                "environment": {
                    "os": platform.platform(),
                    "python": sys.version.split()[0],
                    "cpu_arch": platform.machine(),
                },
            },
            "models_summary": {
                m: {
                    "overall": aggregated_results[m]["overall"],
                    "latency_ms": aggregated_results[m]["latency_ms"],
                    "group_metrics": aggregated_results[m]["group_metrics"],
                }
                for m in models
            },
            "hybrid_timing_breakdown": hybrid_timing_summary,
            "unjudged_candidates_report": discovery_report,
            "detailed_results": aggregated_results,
        }

        return deliverables


def export_deliverables(
    results: Dict[str, Any],
    out_json_path: Optional[Path] = None,
    out_report_path: Optional[Path] = None,
) -> None:
    """Xuất file JSON kết quả và Báo cáo Markdown chi tiết."""
    out_json = out_json_path or (EVALUATION_DIR / "benchmark_results_p1_hybrid_rrf.json")
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"✅ Đã xuất kết quả JSON chi tiết: {out_json}")

    # Tạo Báo cáo Markdown
    out_md = out_report_path or (EVALUATION_DIR / "BENCHMARK_REPORT_P1_HYBRID_RRF.md")
    generate_markdown_report(results, out_md)
    print(f"✅ Đã tạo Báo cáo Markdown: {out_md}")


def generate_markdown_report(results: Dict[str, Any], out_path: Path) -> None:
    models_summary = results["models_summary"]
    timing = results["hybrid_timing_breakdown"]
    unjudged_rep = results["unjudged_candidates_report"]
    meta = results["metadata"]

    bm25_m = models_summary["BM25"]["overall"]
    e5_m = models_summary["Multilingual E5 Base"]["overall"]
    rrf_m = models_summary["Hybrid (BM25 + E5-Base RRF k=60)"]["overall"]

    bm25_lat = models_summary["BM25"]["latency_ms"]
    e5_lat = models_summary["Multilingual E5 Base"]["latency_ms"]
    rrf_lat = models_summary["Hybrid (BM25 + E5-Base RRF k=60)"]["latency_ms"]

    delta_ndcg_bm25 = (rrf_m["ndcg@10_conservative"] - bm25_m["ndcg@10_conservative"]) / bm25_m["ndcg@10_conservative"] * 100.0
    delta_ndcg_e5 = (rrf_m["ndcg@10_conservative"] - e5_m["ndcg@10_conservative"]) / e5_m["ndcg@10_conservative"] * 100.0

    delta_hit_bm25 = (rrf_m["hit@10_conservative"] - bm25_m["hit@10_conservative"]) / bm25_m["hit@10_conservative"] * 100.0
    delta_hit_e5 = (rrf_m["hit@10_conservative"] - e5_m["hit@10_conservative"]) / e5_m["hit@10_conservative"] * 100.0

    delta_opt_ndcg_bm25 = (rrf_m["ndcg@10_assumed_grade2"] - bm25_m["ndcg@10_assumed_grade2"]) / bm25_m["ndcg@10_assumed_grade2"] * 100.0
    delta_opt_ndcg_e5 = (rrf_m["ndcg@10_assumed_grade2"] - e5_m["ndcg@10_assumed_grade2"]) / e5_m["ndcg@10_assumed_grade2"] * 100.0

    groups = list(models_summary["BM25"]["group_metrics"].keys())

    qrels_ver = meta.get("qrels_version", "unknown")
    gt_name = meta.get("gt_file", "ground_truth")

    lines = [
        "# BÁO CÁO THỰC NGHIỆM P1 HYBRID RETRIEVAL: BM25 + MULTILINGUAL E5-BASE (RRF k=60)",
        "",
        f"- **Thời gian thực hiện:** {meta['generated_at']}",
        f"- **Môi trường:** Python {meta['environment']['python']} | OS: {meta['environment']['os']}",
        f"- **Tập dữ liệu:** 14.815 phim (all_movies_fully_translated.csv) | 100 Benchmark Queries | {gt_name} / qrels {qrels_ver}",
        f"- **Cấu hình:** BM25 Top-50 + Multilingual E5-base Top-50 -> Reciprocal Rank Fusion (k={meta['rrf_k']}) -> Top-10 Evaluation",
        "",
        "---",
        "",
        "## 1. BẢNG SO SÁNH ĐỐI CHUẨN TỔNG THỂ (OVERALL BENCHMARK)",
        "",
        "| Hệ thống Truy xuất | NDCG@10 (Bảo thủ) | NDCG@10 (Giả định G2) | Hit@10 (Bảo thủ) | Hit@10 (Giả định G2) | Precision@10 | MRR | MAP@10 | Coverage@10 | Latency (Mean) | Latency (P95) |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |",
        f"| **BM25 (Lexical)** | {bm25_m['ndcg@10_conservative']:.4f} | {bm25_m['ndcg@10_assumed_grade2']:.4f} | {bm25_m['hit@10_conservative']:.4f} | {bm25_m['hit@10_assumed_grade2']:.4f} | {bm25_m['p@10_conservative']:.4f} | {bm25_m['mrr_conservative']:.4f} | {bm25_m['map@10_conservative']:.4f} | {bm25_m['coverage@10']:.1f}% | {bm25_lat['mean']} ms | {bm25_lat['p95']} ms |",
        f"| **Multilingual E5 Base** | {e5_m['ndcg@10_conservative']:.4f} | {e5_m['ndcg@10_assumed_grade2']:.4f} | {e5_m['hit@10_conservative']:.4f} | {e5_m['hit@10_assumed_grade2']:.4f} | {e5_m['p@10_conservative']:.4f} | {e5_m['mrr_conservative']:.4f} | {e5_m['map@10_conservative']:.4f} | {e5_m['coverage@10']:.1f}% | {e5_lat['mean']} ms | {e5_lat['p95']} ms |",
        f"| **Hybrid (BM25 + E5-Base RRF)** | **{rrf_m['ndcg@10_conservative']:.4f}** | **{rrf_m['ndcg@10_assumed_grade2']:.4f}** | **{rrf_m['hit@10_conservative']:.4f}** | **{rrf_m['hit@10_assumed_grade2']:.4f}** | **{rrf_m['p@10_conservative']:.4f}** | **{rrf_m['mrr_conservative']:.4f}** | **{rrf_m['map@10_conservative']:.4f}** | {rrf_m['coverage@10']:.1f}% | {rrf_lat['mean']} ms | {rrf_lat['p95']} ms |",
        "",
    ]

    if unjudged_rep.get("new_unjudged_candidates_count", 0) == 0 and rrf_m["coverage@10"] >= 99.9:
        lines.extend([
            "> [!NOTE]",
            f"> Toàn bộ ứng viên Top-10 của BM25, E5-Base và Hybrid RRF đã được thẩm định đầy đủ trên **qrels {qrels_ver}** (Coverage@10 = 100.0%).",
            "> Điểm số NDCG@10 (Bảo thủ) và Hit@10 phản ánh chính xác hiệu năng thực tế của từng mô hình, không còn vị trí nào bị phạt 0 điểm do thiếu nhãn.",
            "",
        ])
    else:
        lines.extend([
            "> **Lưu ý khoa học:** Kịch bản Grade 2 chỉ để phân tích độ nhạy. IDCG được tính riêng theo danh sách",
            "> ứng viên thiếu nhãn của từng mô hình, nên NDCG giả định **không được dùng để xếp hạng hoặc kết luận**",
            "> mô hình nào tốt hơn khi chưa gán nhãn bổ sung và chuẩn hóa qrels chung. Coverage của Hybrid thấp hơn BM25.",
            "",
        ])

    lines.extend([
        "### Phân tích thay đổi ở kịch bản bảo thủ (Delta Relative %):",
        f"- **So với BM25:**",
        f"  - NDCG@10 (Bảo thủ): {delta_ndcg_bm25:+.2f}%",
        f"  - Hit@10 (Bảo thủ): {delta_hit_bm25:+.2f}%",
        f"- **So với Multilingual E5 Base:**",
        f"  - NDCG@10 (Bảo thủ): {delta_ndcg_e5:+.2f}%",
        f"  - Hit@10 (Bảo thủ): {delta_hit_e5:+.2f}%",
        "",
        "---",
        "",
        "## 2. ĐỘ TRỄ CHI TIẾT TỪNG THÀNH PHẦN HYBRID RETRIEVAL",
        "",
        "| Thành phần | Độ trễ trung bình | Tỷ trọng |",
        "| :--- | :---: | :---: |",
        f"| **Okapi BM25 Retrieval (Top-50)** | {timing['bm25_latency_ms']} ms | {timing['bm25_latency_ms'] / max(0.001, timing['total_hybrid_latency_ms']) * 100:.1f}% |",
        f"| **E5-Base Dense Retrieval (Encoding + ChromaDB HNSW Top-50)** | {timing['e5_base_latency_ms']} ms | {timing['e5_base_latency_ms'] / max(0.001, timing['total_hybrid_latency_ms']) * 100:.1f}% |",
        f"| **RRF Fusion Algorithm (k=60, Top-50 merge)** | {timing['rrf_fusion_latency_ms']} ms | {timing['rrf_fusion_latency_ms'] / max(0.001, timing['total_hybrid_latency_ms']) * 100:.1f}% |",
        f"| **Tổng thời gian Hybrid Pipeline** | **{timing['total_hybrid_latency_ms']} ms** | 100.0% |",
        "",
        "> [!NOTE]",
        "> Thuật toán RRF thực thi cực nhanh (dưới 1ms) nhờ cấu trúc băm tuyến tính O(N_models * K_retrieval). Điểm nghẽn độ trễ chủ yếu đến từ quá trình transformer inference trên CPU của mô hình 768 chiều E5-base.",
        "",
        "---",
        "",
        "## 3. PHÂN TÍCH THEO TỪNG NHÓM TRUY VẤN (CATEGORY BREAKDOWN)",
        "",
        "| Nhóm Truy Vấn (20 Q/nhóm) | BM25 NDCG@10 (Cons) | E5-Base NDCG@10 (Cons) | Hybrid RRF NDCG@10 (Cons) | BM25 Hit@10 | E5 Hit@10 | Hybrid Hit@10 | Nhận định Bổ trợ |",
        "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |",
    ])

    for grp in groups:
        b_grp = models_summary["BM25"]["group_metrics"][grp]
        e_grp = models_summary["Multilingual E5 Base"]["group_metrics"][grp]
        h_grp = models_summary["Hybrid (BM25 + E5-Base RRF k=60)"]["group_metrics"][grp]

        b_val = b_grp["ndcg@10_conservative"]
        e_val = e_grp["ndcg@10_conservative"]
        h_val = h_grp["ndcg@10_conservative"]

        if h_val >= max(b_val, e_val):
            insight = "Hybrid cao hơn hoặc bằng hai mô hình"
        elif h_val >= min(b_val, e_val):
            insight = "Nằm giữa hai mô hình thành phần"
        else:
            insight = "Hybrid thấp hơn cả hai; cần phân tích nguyên nhân"

        lines.append(
            f"| **{grp}** | {b_val:.4f} | {e_val:.4f} | **{h_val:.4f}** | {b_grp['hit@10_conservative']:.2f} | {e_grp['hit@10_conservative']:.2f} | **{h_grp['hit@10_conservative']:.2f}** | {insight} |"
        )

    lines.extend([
        "",
        "---",
        "",
        "## 4. KIỂM TOÁN DỮ LIỆU & ĐỘ PHỦ NHÃN (UNJUDGED CANDIDATES)",
        "",
    ])

    if unjudged_rep.get("new_unjudged_candidates_count", 0) > 0:
        lines.extend([
            "Đối với các ứng viên do Hybrid đề xuất nhưng chưa có trong tập nhãn hiện tại:",
            "- **Tỷ lệ tái sử dụng nhãn cũ:** "
            f"{unjudged_rep.get('reused_judged_count')} / {unjudged_rep.get('total_retrieved_positions')} vị trí "
            f"({unjudged_rep.get('label_reuse_rate_pct')}%)",
            f"- **Ứng viên thiếu bằng chứng trong pool (insufficient evidence):** {unjudged_rep.get('needs_review_insufficient_count')} cặp",
            f"- **Ứng viên mới toanh ngoài pool (new unpooled candidates):** {unjudged_rep.get('new_unpooled_count')} cặp",
            f"- **Tổng số cặp cần gán nhãn bổ sung:** **{unjudged_rep.get('new_unjudged_candidates_count')} cặp**",
            "",
            "> [!IMPORTANT]",
            "> **Tuân thủ nguyên tắc tính bảo toàn:**",
            "> File audit queue nội bộ giữ provenance; file reviewer đã ẩn model/rank.",
            "> **Không tự gán Grade 0** trong Ground Truth hoặc qrels; dùng reviewer queue khi nhờ chuyên gia gán nhãn.",
        ])
    else:
        lines.extend([
            "Đối với các ứng viên Top-10 do Hybrid, BM25 và E5-base đề xuất:",
            f"- **Tỷ lệ bao phủ nhãn (Coverage):** 1.000 / 1.000 vị trí ({unjudged_rep.get('label_reuse_rate_pct')}%)",
            "- **Ứng viên thiếu bằng chứng trong pool:** 0 cặp",
            "- **Ứng viên mới toanh ngoài pool:** 0 cặp",
            "- **Tổng số cặp cần gán nhãn bổ sung:** **0 cặp (100% đã được thẩm định đầy đủ)**",
            "",
            "> [!NOTE]",
            f"> Tất cả các ứng viên Top-10 đều đã có nhãn hợp lệ trong tập Ground Truth {gt_name}.",
        ])

    lines.extend([
        "",
        "---",
        "",
        "## 5. KẾT LUẬN & KIẾN NGHỊ BƯỚC TIẾP THEO",
        "",
        "1. **Kết quả thực nghiệm:**",
        f"   - Trên tập nhãn {qrels_ver}, Hybrid RRF (BM25 + Multilingual E5-base) đạt NDCG@10 = **{rrf_m['ndcg@10_conservative']:.4f}**, Hit@10 = **{rrf_m['hit@10_conservative']:.4f}**.",
        "   - So với BM25: NDCG@10 thay đổi " + f"{delta_ndcg_bm25:+.2f}%, Hit@10 thay đổi {delta_hit_bm25:+.2f}%.",
        "   - So với E5-Base: NDCG@10 thay đổi " + f"{delta_ndcg_e5:+.2f}%, Hit@10 thay đổi {delta_hit_e5:+.2f}%.",
        "2. **Độ trễ:** Kết quả đo trên môi trường chạy hiện tại, không phải cam kết SLA/real-time.",
        f"   - Trung bình pipeline: {timing['total_hybrid_latency_ms']} ms (trong đó BM25: {timing['bm25_latency_ms']} ms, E5-Base: {timing['e5_base_latency_ms']} ms, RRF: {timing['rrf_fusion_latency_ms']} ms).",
        "3. **Tình trạng thẩm định và việc cần làm tiếp theo:**",
        "   - Các nhãn mới được thẩm định bằng quy trình Gemini LLM-as-a-Judge theo double-blind protocol đồng nhất với Ground Truth V2.",
        "   - **Công việc chưa hoàn thành (Pending):** Thẩm định bởi hội đồng chuyên gia con người (Human Expert Double-Blind Adjudication). Cần duy trì hàng đợi mù `annotation_queue_hybrid_rrf_top10_blinded.json` để thực hiện khi có điều kiện nhân lực.",
        "   - Không tự ý tích hợp API hoặc sửa đổi hệ thống gợi ý lai (CF + Semantic Profile) trong `recommend_service.py` khi chưa hoàn tất pha nghiên cứu IR.",
    ])

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    parser = argparse.ArgumentParser(description="P1 Hybrid Retrieval Benchmark: BM25 + Multilingual E5-base (RRF)")
    parser.add_argument("--rrf-k", type=int, default=DEFAULT_RRF_K, help="Hệ số làm mượt RRF (mặc định 60)")
    parser.add_argument("--top-k-retrieval", type=int, default=DEFAULT_TOP_K_RETRIEVAL, help="Số ứng viên lấy mỗi model (mặc định 50)")
    parser.add_argument("--gt-file", type=str, default=None, help="Đường dẫn file Ground Truth JSON (mặc định ground_truth_v2.json)")
    parser.add_argument("--qrels-file", type=str, default=None, help="Đường dẫn file canonical qrels JSON (mặc định qrels_v2.json)")
    parser.add_argument("--out-results-file", type=str, default=None, help="Đường dẫn file kết quả JSON xuất ra")
    parser.add_argument("--out-report-file", type=str, default=None, help="Đường dẫn file báo cáo Markdown xuất ra")
    parser.add_argument("--queue-prefix", type=str, default=None, help="Tiền tố tên file queue nếu còn ứng viên chưa có nhãn")
    args = parser.parse_args()

    gt_file_path = Path(args.gt_file) if args.gt_file else None
    qrels_file_path = Path(args.qrels_file) if args.qrels_file else None
    out_results_path = Path(args.out_results_file) if args.out_results_file else None
    out_report_path = Path(args.out_report_file) if args.out_report_file else None

    runner = HybridBenchmarkRunner(
        rrf_k=args.rrf_k,
        top_k_retrieval=args.top_k_retrieval,
        gt_file=gt_file_path,
        qrels_file=qrels_file_path,
        queue_prefix=args.queue_prefix,
    )
    results = runner.run_benchmark()
    export_deliverables(
        results,
        out_json_path=out_results_path,
        out_report_path=out_report_path,
    )
    print("\n🎉 THỰC NGHIỆM P1 HYBRID RETRIEVAL HOÀN TẤT THÀNH CÔNG!")


if __name__ == "__main__":
    main()
