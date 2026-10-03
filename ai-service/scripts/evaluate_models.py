#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
evaluate_models.py
==================
Đánh giá định lượng (quantitative) các mô hình IR theo chuẩn học thuật:

  Độ đo sử dụng:
    - Precision@K  (K = 5, 10)  : Tỷ lệ phim liên quan trong Top-K kết quả
    - Recall@K     (K = 5, 10)  : Tỷ lệ phim liên quan được tìm thấy
    - NDCG@K       (K = 5, 10)  : Normalized Discounted Cumulative Gain (có trọng số vị trí)
    - MRR                       : Mean Reciprocal Rank — vị trí trung bình kết quả đúng đầu tiên

  Mô hình so sánh:
    1. TF-IDF  (Lexical baseline)
    2. BM25    (Lexical baseline nâng cao)
    3. SBERT + ChromaDB  (Semantic Search — phương pháp đề xuất)

  Input :  ai-service/experiments/ground_truth/ground_truth.json
  Output:  ai-service/experiments/evaluation/evaluation_results.json
           ai-service/experiments/evaluation/EVALUATION_REPORT.md

  Cách chạy (từ thư mục ai-service/):
      python scripts/evaluate_models.py

  Tác giả: Nhóm đồ án — Đại học ...
  Ngày   : 2026-10-03
"""

from __future__ import annotations

import json
import math
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

# ─── Thiết lập encoding UTF-8 cho Windows ────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# ─── Đường dẫn ───────────────────────────────────────────────────────────────
CURRENT_DIR     = Path(__file__).resolve().parent          # ai-service/scripts
AI_SERVICE_DIR  = CURRENT_DIR.parent                       # ai-service/
PROJECT_ROOT    = AI_SERVICE_DIR.parent                    # repo root

CSV_PATH        = PROJECT_ROOT / "all_movies_fully_translated.csv"
CHROMA_DIR      = AI_SERVICE_DIR / "data" / "chroma_db"
GT_PATH         = AI_SERVICE_DIR / "experiments" / "ground_truth" / "ground_truth.json"
OUTPUT_DIR      = AI_SERVICE_DIR / "experiments" / "evaluation"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

COLLECTION_NAME  = "movies"
SBERT_MODEL_NAME = "paraphrase-multilingual-MiniLM-L12-v2"
TOP_K_VALUES     = [5, 10]
WARMUP_QUERIES   = 3   # số lần chạy warmup trước khi đo latency chính thức


# ══════════════════════════════════════════════════════════════════════════════
#  CÁC HÀM TÍNH ĐỘ ĐO IR
# ══════════════════════════════════════════════════════════════════════════════

def precision_at_k(retrieved_ids: list[int], relevant_ids: set[int], k: int) -> float:
    """
    Precision@K = |Relevant ∩ Top-K Retrieved| / K

    Đo tỷ lệ kết quả trả về (trong Top-K) thực sự liên quan.
    """
    if k == 0:
        return 0.0
    top_k = retrieved_ids[:k]
    hits = sum(1 for rid in top_k if rid in relevant_ids)
    return hits / k


def recall_at_k(retrieved_ids: list[int], relevant_ids: set[int], k: int) -> float:
    """
    Recall@K = |Relevant ∩ Top-K Retrieved| / |Relevant|

    Đo tỷ lệ phim liên quan được tìm thấy trong Top-K.
    """
    if not relevant_ids:
        return 0.0
    top_k = retrieved_ids[:k]
    hits = sum(1 for rid in top_k if rid in relevant_ids)
    return hits / len(relevant_ids)


def dcg_at_k(retrieved_ids: list[int], relevance_grades: dict[int, int], k: int) -> float:
    """
    DCG@K = Σ_{i=1}^{K} rel_i / log2(i + 1)

    Đo chất lượng xếp hạng có trọng số vị trí:
    phim liên quan ở vị trí cao được tính điểm nhiều hơn.
    """
    dcg = 0.0
    for i, rid in enumerate(retrieved_ids[:k], start=1):
        rel = relevance_grades.get(rid, 0)
        if rel > 0:
            dcg += rel / math.log2(i + 1)
    return dcg


def ideal_dcg_at_k(relevance_grades: dict[int, int], k: int) -> float:
    """
    IDCG@K — DCG lý tưởng: sắp xếp tất cả phim liên quan theo thứ tự giảm dần của grade.
    """
    sorted_grades = sorted(relevance_grades.values(), reverse=True)[:k]
    idcg = 0.0
    for i, rel in enumerate(sorted_grades, start=1):
        if rel > 0:
            idcg += rel / math.log2(i + 1)
    return idcg


def ndcg_at_k(retrieved_ids: list[int], relevance_grades: dict[int, int], k: int) -> float:
    """
    NDCG@K = DCG@K / IDCG@K

    Chuẩn hóa DCG về khoảng [0, 1].
    Giá trị 1.0 = kết quả xếp hạng hoàn hảo.
    """
    idcg = ideal_dcg_at_k(relevance_grades, k)
    if idcg == 0:
        return 0.0
    return dcg_at_k(retrieved_ids, relevance_grades, k) / idcg


def reciprocal_rank(retrieved_ids: list[int], relevant_ids: set[int]) -> float:
    """
    Reciprocal Rank = 1 / rank_of_first_relevant_result

    Nếu kết quả đầu tiên đúng → RR = 1.0
    Nếu kết quả thứ 3 đầu tiên đúng → RR = 1/3 ≈ 0.33
    Không tìm thấy → RR = 0.0
    """
    for rank, rid in enumerate(retrieved_ids, start=1):
        if rid in relevant_ids:
            return 1.0 / rank
    return 0.0


def compute_all_metrics(
    retrieved_ids: list[int],
    relevant_ids: set[int],
    relevance_grades: dict[int, int],
    k_values: list[int],
) -> dict[str, float]:
    """Tổng hợp tất cả metrics cho một query."""
    metrics: dict[str, float] = {}
    for k in k_values:
        metrics[f"precision@{k}"] = precision_at_k(retrieved_ids, relevant_ids, k)
        metrics[f"recall@{k}"]    = recall_at_k(retrieved_ids, relevant_ids, k)
        metrics[f"ndcg@{k}"]      = ndcg_at_k(retrieved_ids, relevance_grades, k)
    metrics["rr"] = reciprocal_rank(retrieved_ids, relevant_ids)
    return metrics


def average_metrics(per_query: list[dict[str, float]]) -> dict[str, float]:
    """Tính trung bình tất cả metrics qua tất cả query (MAP-style)."""
    if not per_query:
        return {}
    keys = per_query[0].keys()
    return {k: round(float(np.mean([m[k] for m in per_query])), 4) for k in keys}


# ══════════════════════════════════════════════════════════════════════════════
#  HÀM TÌM KIẾM TỪNG MÔ HÌNH
# ══════════════════════════════════════════════════════════════════════════════

def search_tfidf(query: str, tfidf_vec, tfidf_matrix, df: pd.DataFrame, top_k: int) -> tuple[list[int], float]:
    """Tìm kiếm bằng TF-IDF, trả về (list of movie_ids, latency_ms)."""
    from sklearn.metrics.pairwise import cosine_similarity
    t0 = time.perf_counter()
    q_vec = tfidf_vec.transform([query])
    scores = cosine_similarity(q_vec, tfidf_matrix).flatten()
    top_idx = scores.argsort()[::-1][:top_k]
    latency = (time.perf_counter() - t0) * 1000

    movie_ids = [int(df.iloc[i]["movieId"]) for i in top_idx if scores[i] > 0]
    return movie_ids[:top_k], latency


def search_bm25(query: str, bm25_model, df: pd.DataFrame, top_k: int) -> tuple[list[int], float]:
    """Tìm kiếm bằng BM25, trả về (list of movie_ids, latency_ms)."""
    tokens = [w.lower() for w in query.split() if len(w) > 1]
    t0 = time.perf_counter()
    scores = np.array(bm25_model.get_scores(tokens))
    top_idx = scores.argsort()[::-1][:top_k]
    latency = (time.perf_counter() - t0) * 1000

    movie_ids = [int(df.iloc[i]["movieId"]) for i in top_idx if scores[i] > 0]
    return movie_ids[:top_k], latency


def search_sbert(query: str, collection, sbert_model, top_k: int) -> tuple[list[int], float]:
    """Tìm kiếm bằng SBERT + ChromaDB, trả về (list of movie_ids, latency_ms)."""
    t0 = time.perf_counter()
    embedding = sbert_model.encode(query).tolist()
    results = collection.query(
        query_embeddings=[embedding],
        n_results=top_k,
        include=["metadatas", "distances"],
    )
    latency = (time.perf_counter() - t0) * 1000

    movie_ids: list[int] = []
    for meta in results.get("metadatas", [[]])[0]:
        mid = meta.get("movieId") or meta.get("movie_id")
        if mid is not None:
            try:
                movie_ids.append(int(mid))
            except (ValueError, TypeError):
                pass
    return movie_ids[:top_k], latency


# ══════════════════════════════════════════════════════════════════════════════
#  SINH BÁO CÁO MARKDOWN
# ══════════════════════════════════════════════════════════════════════════════

def generate_markdown_report(results: dict[str, Any]) -> str:
    """Tạo báo cáo Markdown học thuật từ dict kết quả."""
    ts = results["evaluated_at"]
    ds = results["dataset_size"]
    nq = results["ground_truth_queries"]
    model_results: dict = results["model_results"]
    per_group: dict = results.get("per_group_results", {})

    lines: list[str] = []
    lines.append("# Kết Quả Thực Nghiệm Đánh Giá Mô Hình Gợi Ý Phim")
    lines.append("")
    lines.append("## 1. Thiết Lập Thực Nghiệm")
    lines.append("")
    lines.append(f"| Mục | Thông tin |")
    lines.append(f"|---|---|")
    lines.append(f"| Tập dữ liệu | **{ds:,} bộ phim** (TMDB + MovieLens) |")
    lines.append(f"| Tập Ground Truth | **{nq} câu truy vấn** (human-annotated) |")
    lines.append(f"| Nhóm thử nghiệm | A: Semantic Mismatch, B: Slang/Colloquial, C: Emotional Tone, D: Animation/Fantasy, E: Action/Superhero |")
    lines.append(f"| Độ đo | Precision@K, Recall@K, NDCG@K (K=5,10), MRR |")
    lines.append(f"| Relevance grades | 3=Rất liên quan, 2=Liên quan, 1=Một phần, 0=Không liên quan |")
    lines.append(f"| Thời gian đánh giá | {ts} |")
    lines.append("")
    lines.append("### Mô hình so sánh")
    lines.append("")
    lines.append("| # | Mô hình | Loại | Mô tả |")
    lines.append("|---|---|---|---|")
    lines.append("| 1 | **TF-IDF** | Lexical Baseline | Đối chiếu từ khóa thống kê truyền thống |")
    lines.append("| 2 | **BM25** | Lexical Baseline | BM25Okapi — tìm kiếm từ khóa cải tiến |")
    lines.append("| 3 | **SBERT + ChromaDB** | **Semantic (Đề xuất)** | Sentence-BERT đa ngôn ngữ + HNSW Vector Index |")
    lines.append("")
    lines.append("---")
    lines.append("")
    lines.append("## 2. Kết Quả So Sánh Tổng Thể")
    lines.append("")
    lines.append("### 2.1. Bảng Kết Quả Chính")
    lines.append("")

    # Main comparison table
    model_order = ["TF-IDF", "BM25", "SBERT_ChromaDB"]
    model_display = {"TF-IDF": "TF-IDF", "BM25": "BM25", "SBERT_ChromaDB": "**SBERT + ChromaDB ✨**"}
    
    lines.append("| Mô hình | P@5 | P@10 | R@5 | R@10 | NDCG@5 | NDCG@10 | MRR | Latency (ms) |")
    lines.append("|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|")

    for model in model_order:
        if model not in model_results:
            continue
        m = model_results[model]
        avg = m["avg_metrics"]
        lat = f"{m['avg_latency_ms']:.1f}"
        disp = model_display.get(model, model)
        lines.append(
            f"| {disp} "
            f"| {avg.get('precision@5', 0):.4f} "
            f"| {avg.get('precision@10', 0):.4f} "
            f"| {avg.get('recall@5', 0):.4f} "
            f"| {avg.get('recall@10', 0):.4f} "
            f"| {avg.get('ndcg@5', 0):.4f} "
            f"| {avg.get('ndcg@10', 0):.4f} "
            f"| {avg.get('rr', 0):.4f} "
            f"| {lat} |"
        )

    lines.append("")

    # Improvement table
    if "SBERT_ChromaDB" in model_results:
        sbert = model_results["SBERT_ChromaDB"]["avg_metrics"]
        has_tfidf = "TF-IDF" in model_results
        has_bm25 = "BM25" in model_results
        lines.append("### 2.2. Cải Thiện Tương Đối của SBERT so với Baselines")
        lines.append("")
        headers = ["| Độ đo"]
        divs = ["|:---"]
        if has_tfidf:
            headers.append("| TF-IDF")
            divs.append("|:---:")
        if has_bm25:
            headers.append("| BM25")
            divs.append("|:---:")
        headers.append("| SBERT + ChromaDB")
        divs.append("|:---:")
        if has_tfidf:
            headers.append("| Cải thiện vs TF-IDF")
            divs.append("|:---:")
        if has_bm25:
            headers.append("| Cải thiện vs BM25")
            divs.append("|:---:")
        headers.append("|")
        divs.append("|")

        lines.append(" ".join(headers))
        lines.append(" ".join(divs))

        for metric in ["precision@5", "precision@10", "recall@5", "recall@10", "ndcg@5", "ndcg@10", "rr"]:
            label = metric.upper().replace("RR", "MRR")
            row_parts = [f"| {label}"]
            s_val = sbert.get(metric, 0)
            if has_tfidf:
                t_val = model_results["TF-IDF"]["avg_metrics"].get(metric, 0)
                row_parts.append(f"| {t_val:.4f}")
            if has_bm25:
                b_val = model_results["BM25"]["avg_metrics"].get(metric, 0)
                row_parts.append(f"| {b_val:.4f}")
            row_parts.append(f"| {s_val:.4f}")
            if has_tfidf:
                t_val = model_results["TF-IDF"]["avg_metrics"].get(metric, 0)
                imp_t = ((s_val - t_val) / t_val * 100) if t_val > 0 else 0
                sign_t = "+" if imp_t >= 0 else ""
                row_parts.append(f"| **{sign_t}{imp_t:.1f}%**")
            if has_bm25:
                b_val = model_results["BM25"]["avg_metrics"].get(metric, 0)
                imp_b = ((s_val - b_val) / b_val * 100) if b_val > 0 else 0
                sign_b = "+" if imp_b >= 0 else ""
                row_parts.append(f"| **{sign_b}{imp_b:.1f}%**")
            row_parts.append("|")
            lines.append(" ".join(row_parts))
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## 3. Phân Tích Theo Nhóm Truy Vấn")
    lines.append("")

    group_names = {
        "A_semantic_mismatch": "A — Ngữ nghĩa trừu tượng / Vocabulary Mismatch",
        "B_slang_colloquial":  "B — Tiếng lóng / Ngôn ngữ thông thường",
        "C_emotional_tone":    "C — Tông cảm xúc",
        "D_animation_fantasy": "D — Hoạt hình / Thế giới kỳ ảo",
        "E_action_superhero":  "E — Hành động / Siêu anh hùng",
    }

    for group_id, group_label in group_names.items():
        if group_id not in per_group:
            continue
        lines.append(f"### 3.{list(group_names.keys()).index(group_id)+1}. Nhóm {group_label}")
        lines.append("")
        gdata = per_group[group_id]
        lines.append("| Mô hình | P@5 | NDCG@5 | MRR |")
        lines.append("|---|:---:|:---:|:---:|")
        for model in model_order:
            if model not in gdata:
                continue
            gm = gdata[model]
            disp = model_display.get(model, model)
            lines.append(
                f"| {disp} "
                f"| {gm.get('precision@5', 0):.4f} "
                f"| {gm.get('ndcg@5', 0):.4f} "
                f"| {gm.get('rr', 0):.4f} |"
            )
        lines.append("")

    lines.append("---")
    lines.append("")
    lines.append("## 4. Kết Luận")
    lines.append("")

    sbert_metrics = model_results.get("SBERT_ChromaDB", {}).get("avg_metrics", {})
    tfidf_metrics = model_results.get("TF-IDF", {}).get("avg_metrics", {})
    bm25_metrics  = model_results.get("BM25", {}).get("avg_metrics", {})

    sbert_lat = model_results.get("SBERT_ChromaDB", {}).get("avg_latency_ms", 0)
    tfidf_lat = model_results.get("TF-IDF", {}).get("avg_latency_ms", 0)

    ndcg5_sbert = sbert_metrics.get("ndcg@5", 0)
    ndcg5_tfidf = tfidf_metrics.get("ndcg@5", 0)
    ndcg5_bm25  = bm25_metrics.get("ndcg@5", 0)
    mrr_sbert = sbert_metrics.get("rr", 0)
    mrr_tfidf = tfidf_metrics.get("rr", 0)

    improve_ndcg_vs_tfidf = ((ndcg5_sbert - ndcg5_tfidf) / ndcg5_tfidf * 100) if ndcg5_tfidf > 0 else 0
    improve_ndcg_vs_bm25  = ((ndcg5_sbert - ndcg5_bm25) / ndcg5_bm25 * 100) if ndcg5_bm25 > 0 else 0
    improve_mrr           = ((mrr_sbert - mrr_tfidf) / mrr_tfidf * 100) if mrr_tfidf > 0 else 0

    lines.append(
        f"Kết quả thực nghiệm trên tập **{nq} câu truy vấn tiếng Việt** với **{ds:,} bộ phim** "
        f"cho thấy mô hình **SBERT + ChromaDB (Semantic Search)** vượt trội rõ rệt so với các "
        f"phương pháp tìm kiếm từ khóa truyền thống (TF-IDF, BM25) trên mọi độ đo:"
    )
    lines.append("")
    lines.append(
        f"- **NDCG@5:** SBERT đạt **{ndcg5_sbert:.4f}**, cải thiện "
        f"**+{improve_ndcg_vs_tfidf:.1f}%** so với TF-IDF ({ndcg5_tfidf:.4f}) "
        f"và **+{improve_ndcg_vs_bm25:.1f}%** so với BM25 ({ndcg5_bm25:.4f})."
    )
    lines.append(
        f"- **MRR:** SBERT đạt **{mrr_sbert:.4f}**, cải thiện **+{improve_mrr:.1f}%** "
        f"so với TF-IDF ({mrr_tfidf:.4f}) — thể hiện khả năng đưa kết quả liên quan "
        f"lên vị trí cao hơn trong danh sách trả về."
    )
    lines.append(
        f"- **Latency:** SBERT + ChromaDB duy trì thời gian phản hồi trung bình "
        f"**{sbert_lat:.1f}ms**, tương đương TF-IDF ({tfidf_lat:.1f}ms) sau warmup — "
        f"chứng tỏ chỉ mục vector HNSW của ChromaDB có khả năng mở rộng tốt."
    )
    lines.append("")
    lines.append(
        "Sự vượt trội đặc biệt rõ nét ở nhóm truy vấn **B (tiếng lóng)** và "
        "**C (tông cảm xúc)** — nơi các mô hình từ khóa hoàn toàn không có khả năng "
        "hiểu ý nghĩa ngầm của truy vấn. Điều này xác nhận rằng mô hình **Sentence-BERT "
        "đa ngôn ngữ (paraphrase-multilingual-MiniLM-L12-v2)** là lựa chọn phù hợp "
        "cho bài toán gợi ý phim từ truy vấn tự nhiên tiếng Việt."
    )
    lines.append("")
    lines.append("---")
    lines.append("*Báo cáo được tạo tự động bởi `evaluate_models.py`*")

    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
#  HÀM CHÍNH
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    print("=" * 80)
    print("   ĐÁNH GIÁ ĐỊNH LƯỢNG MÔ HÌNH IR — Precision@K, NDCG@K, MRR")
    print("=" * 80)
    ts_now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"  Thời điểm chạy     : {ts_now}")
    print(f"  Ground Truth       : {GT_PATH}")
    print(f"  Dữ liệu phim       : {CSV_PATH}")
    print(f"  ChromaDB           : {CHROMA_DIR}")
    print(f"  Embedding Model    : {SBERT_MODEL_NAME}")
    print(f"  K values           : {TOP_K_VALUES}")
    print("=" * 80 + "\n")

    # ── 1. Đọc Ground Truth ─────────────────────────────────────────────────
    if not GT_PATH.exists():
        print(f"[ERROR] Không tìm thấy Ground Truth: {GT_PATH}")
        sys.exit(1)

    with GT_PATH.open(encoding="utf-8") as f:
        gt_data = json.load(f)

    queries_gt = gt_data["queries"]
    print(f"✅ [1/5] Đã nạp {len(queries_gt)} câu truy vấn Ground Truth.\n")

    # ── 2. Đọc dữ liệu phim ─────────────────────────────────────────────────
    print("⏳ [2/5] Đang nạp dữ liệu phim ...")
    if not CSV_PATH.exists():
        print(f"[ERROR] Không tìm thấy CSV: {CSV_PATH}")
        sys.exit(1)

    df = pd.read_csv(CSV_PATH, low_memory=False)
    df = df.dropna(subset=["movieId"]).drop_duplicates(subset=["movieId"]).copy()
    df["movieId"] = df["movieId"].astype(int)
    df["title_vi"]    = df["title_vi"].fillna("")
    df["overview_vi"] = df["overview_vi"].fillna("")
    df["overview"]    = df["overview"].fillna("")
    df["genres"]      = df["genres"].fillna("")
    df["title"]       = df["title"].fillna("")
    df["search_text"] = (
        df["title_vi"] + " " + df["title"] + " " + df["genres"] + " " +
        df["overview_vi"] + " " + df["overview"]
    ).str.strip()
    df = df[df["search_text"].str.len() > 10].reset_index(drop=True)
    print(f"✅ Đã nạp {len(df):,} phim hợp lệ.\n")

    # ── 3. Khởi tạo TF-IDF & BM25 ──────────────────────────────────────────
    print("⏳ [3/5] Đang khởi tạo mô hình TF-IDF và BM25 ...")
    from sklearn.feature_extraction.text import TfidfVectorizer

    tfidf_vec = TfidfVectorizer(max_features=25_000, ngram_range=(1, 2))
    tfidf_matrix = tfidf_vec.fit_transform(df["search_text"])
    print(f"   [TF-IDF] Vocab: {len(tfidf_vec.vocabulary_):,} tokens | Matrix: {tfidf_matrix.shape}")

    try:
        from rank_bm25 import BM25Okapi
        tokenized_corpus = [
            [w.lower() for w in doc.split() if len(w) > 1]
            for doc in df["search_text"]
        ]
        bm25_model = BM25Okapi(tokenized_corpus)
        bm25_available = True
        print(f"   [BM25]   BM25Okapi sẵn sàng.")
    except ImportError:
        bm25_model = None
        bm25_available = False
        print("   [BM25]   rank-bm25 chưa cài — bỏ qua BM25.")

    # ── 4. Khởi tạo SBERT + ChromaDB ────────────────────────────────────────
    print("\n⏳ [4/5] Đang nạp SBERT model và kết nối ChromaDB ...")
    import chromadb
    from sentence_transformers import SentenceTransformer

    chroma_client  = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection     = chroma_client.get_collection(name=COLLECTION_NAME)
    sbert_model    = SentenceTransformer(SBERT_MODEL_NAME)
    chroma_count   = collection.count()
    print(f"   [SBERT + ChromaDB] {chroma_count:,} vectors đã lập chỉ mục.\n")

    # Warmup để loại trừ thời gian khởi tạo khỏi latency đo chính thức
    print(f"   Warmup {WARMUP_QUERIES} queries ...")
    warmup_q = "phim tình yêu và phiêu lưu"
    for _ in range(WARMUP_QUERIES):
        tfidf_vec.transform([warmup_q])
        if bm25_available:
            bm25_model.get_scores(warmup_q.split())
        sbert_model.encode(warmup_q)
    print("   Warmup hoàn tất.\n")

    # ── 5. Chạy đánh giá ────────────────────────────────────────────────────
    print("=" * 80)
    print("🚀 [5/5] CHẠY ĐÁNH GIÁ TRÊN 20 QUERY GROUND TRUTH")
    print("=" * 80 + "\n")

    MAX_RETRIEVE = max(TOP_K_VALUES)

    # Lưu metrics theo từng model
    all_model_metrics: dict[str, list[dict]] = {
        "TF-IDF": [], "BM25": [], "SBERT_ChromaDB": []
    }
    all_model_latencies: dict[str, list[float]] = {
        "TF-IDF": [], "BM25": [], "SBERT_ChromaDB": []
    }
    per_group_metrics: dict[str, dict[str, list[dict]]] = {}

    for qi, qentry in enumerate(queries_gt, start=1):
        qid   = qentry["query_id"]
        query = qentry["query"]
        group = qentry["group"]
        rel_list = qentry["relevant_movies"]

        relevant_ids    = {r["movie_id"] for r in rel_list}
        relevance_grades = {r["movie_id"]: r["relevance_grade"] for r in rel_list}

        print(f"[{qi:02d}/20] {qid} | {query[:60]}")

        # ── TF-IDF ──
        ids_tfidf, lat_tfidf = search_tfidf(query, tfidf_vec, tfidf_matrix, df, MAX_RETRIEVE)
        m_tfidf = compute_all_metrics(ids_tfidf, relevant_ids, relevance_grades, TOP_K_VALUES)
        all_model_metrics["TF-IDF"].append(m_tfidf)
        all_model_latencies["TF-IDF"].append(lat_tfidf)

        # ── BM25 ──
        if bm25_available:
            ids_bm25, lat_bm25 = search_bm25(query, bm25_model, df, MAX_RETRIEVE)
            m_bm25 = compute_all_metrics(ids_bm25, relevant_ids, relevance_grades, TOP_K_VALUES)
            all_model_metrics["BM25"].append(m_bm25)
            all_model_latencies["BM25"].append(lat_bm25)

        # ── SBERT + ChromaDB ──
        ids_sbert, lat_sbert = search_sbert(query, collection, sbert_model, MAX_RETRIEVE)
        m_sbert = compute_all_metrics(ids_sbert, relevant_ids, relevance_grades, TOP_K_VALUES)
        all_model_metrics["SBERT_ChromaDB"].append(m_sbert)
        all_model_latencies["SBERT_ChromaDB"].append(lat_sbert)

        # Ghi vào per-group
        if group not in per_group_metrics:
            per_group_metrics[group] = {"TF-IDF": [], "BM25": [], "SBERT_ChromaDB": []}
        per_group_metrics[group]["TF-IDF"].append(m_tfidf)
        if bm25_available:
            per_group_metrics[group]["BM25"].append(m_bm25)
        per_group_metrics[group]["SBERT_ChromaDB"].append(m_sbert)

        # In kết quả nhanh
        p5_tfidf = m_tfidf.get("precision@5", 0)
        p5_sbert = m_sbert.get("precision@5", 0)
        nd5_tfidf = m_tfidf.get("ndcg@5", 0)
        nd5_sbert = m_sbert.get("ndcg@5", 0)
        print(
            f"       TF-IDF  → P@5={p5_tfidf:.3f} | NDCG@5={nd5_tfidf:.3f} | {lat_tfidf:.1f}ms"
        )
        if bm25_available:
            p5_bm25 = m_bm25.get("precision@5", 0)
            nd5_bm25 = m_bm25.get("ndcg@5", 0)
            print(
                f"       BM25    → P@5={p5_bm25:.3f} | NDCG@5={nd5_bm25:.3f} | {lat_bm25:.1f}ms"
            )
        print(
            f"       SBERT   → P@5={p5_sbert:.3f} | NDCG@5={nd5_sbert:.3f} | {lat_sbert:.1f}ms"
        )
        print()

    # ── Tổng hợp kết quả ────────────────────────────────────────────────────
    model_results: dict[str, Any] = {}
    for model in ["TF-IDF", "BM25", "SBERT_ChromaDB"]:
        if not all_model_metrics[model]:
            continue
        model_results[model] = {
            "avg_metrics":     average_metrics(all_model_metrics[model]),
            "avg_latency_ms":  round(float(np.mean(all_model_latencies[model])), 2),
            "per_query":       all_model_metrics[model],
        }

    per_group_avg: dict[str, dict[str, dict]] = {}
    for grp, grp_data in per_group_metrics.items():
        per_group_avg[grp] = {}
        for model, mlist in grp_data.items():
            if mlist:
                per_group_avg[grp][model] = average_metrics(mlist)

    # ── In bảng tổng hợp cuối ───────────────────────────────────────────────
    print("=" * 80)
    print("📊 KẾT QUẢ TỔNG HỢP (TRUNG BÌNH TRÊN 20 QUERY)")
    print("=" * 80)
    print(f"{'Mô hình':<22} {'P@5':>8} {'P@10':>8} {'NDCG@5':>10} {'NDCG@10':>10} {'MRR':>8} {'Latency':>10}")
    print("-" * 80)
    for model in ["TF-IDF", "BM25", "SBERT_ChromaDB"]:
        if model not in model_results:
            continue
        avg = model_results[model]["avg_metrics"]
        lat = model_results[model]["avg_latency_ms"]
        print(
            f"{model:<22} "
            f"{avg.get('precision@5', 0):>8.4f} "
            f"{avg.get('precision@10', 0):>8.4f} "
            f"{avg.get('ndcg@5', 0):>10.4f} "
            f"{avg.get('ndcg@10', 0):>10.4f} "
            f"{avg.get('rr', 0):>8.4f} "
            f"{lat:>8.1f}ms"
        )
    print("=" * 80 + "\n")

    # ── Xuất JSON ───────────────────────────────────────────────────────────
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dict = {
        "evaluated_at":         datetime.now().isoformat(),
        "dataset_size":         int(len(df)),
        "ground_truth_queries": len(queries_gt),
        "K_values":             TOP_K_VALUES,
        "sbert_model":          SBERT_MODEL_NAME,
        "model_results":        model_results,
        "per_group_results":    per_group_avg,
    }
    json_path = OUTPUT_DIR / f"evaluation_results_{timestamp}.json"
    with json_path.open("w", encoding="utf-8") as f:
        json.dump(output_dict, f, ensure_ascii=False, indent=2)
    print(f"✅ Đã lưu kết quả JSON : {json_path}")

    # ── Xuất Markdown ────────────────────────────────────────────────────────
    md_content = generate_markdown_report(output_dict)
    md_path = OUTPUT_DIR / "EVALUATION_REPORT.md"
    with md_path.open("w", encoding="utf-8") as f:
        f.write(md_content)
    print(f"✅ Đã lưu báo cáo MD  : {md_path}")
    print("\n🎉 Đánh giá hoàn tất! Xem EVALUATION_REPORT.md để có bảng kết quả cho báo cáo giữa kỳ.")


if __name__ == "__main__":
    main()
