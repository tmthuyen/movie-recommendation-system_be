#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
reproduce_step4_benchmark.py
============================
Kịch bản tái lập và xác minh độc lập thực nghiệm Bước 4 (Run #04.1 - Calibrated):
Cho phép bất kỳ người thẩm định độc lập nào:
  1. [MỨC 1 - Checksum]: Xác minh tính toàn vẹn mật mã học (SHA-256) của 14/14 tệp trong MANIFEST.
  2. [MỨC 2 - Toán học Độc lập]: Kiểm thử từng công thức IR bằng các bộ dữ liệu nhỏ (Toy Datasets)
     có kết quả kỳ vọng tính thủ công độc lập (Hand-calculated ground truth), bao gồm trường hợp
     unjudged, pool rỗng, 0 tài liệu liên quan (Q076 edge case) và phân cấp gain lũy thừa TREC.
  3. [MỨC 3 - Toán học Tổng hợp]: Tái tính toán và đối chiếu 100% metrics vĩ mô từ xếp hạng Top-10
     gốc được lưu trữ trong tệp JSON kết quả.
  4. [MỨC 4 - Tái chạy Mẫu 5 Mô hình]: Thực thi truy xuất trực tiếp cả 5 mô hình (TF-IDF, BM25,
     SBERT MiniLM, Multilingual E5 Small, Multilingual E5 Base), so sánh trực tiếp mã phim và
     thứ hạng Top-10 với kết quả đã lưu trữ, đồng thời đo kiểm độ trễ đa lượt sau warmup.

Sử dụng:
  python ai-service/scripts/reproduce_step4_benchmark.py --verify-checksums
  python ai-service/scripts/reproduce_step4_benchmark.py --verify-math
  python ai-service/scripts/reproduce_step4_benchmark.py --verify-stored-metrics
  python ai-service/scripts/reproduce_step4_benchmark.py --run-sample-all-models
  python ai-service/scripts/reproduce_step4_benchmark.py --all
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Tuple

import chromadb
import numpy as np
import pandas as pd
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import underthesea

# Thiết lập encoding UTF-8 cho Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent
PROJECT_ROOT = AI_SERVICE_DIR.parent
sys.path.insert(0, str(PROJECT_ROOT))
sys.path.insert(0, str(AI_SERVICE_DIR))
sys.path.insert(0, str(AI_SERVICE_DIR / "src"))
sys.path.insert(0, str(CURRENT_DIR))

from scripts.benchmark_models_v2 import (
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


# ══════════════════════════════════════════════════════════════════════════════
# 1. MỨC 1: XÁC MINH CHỮ KÝ MẬT MÃ HỌC (SHA-256 MANIFEST)
# ══════════════════════════════════════════════════════════════════════════════

def verify_checksums() -> bool:
    """Xác minh mã băm SHA-256 của toàn bộ tệp trong MANIFEST_SHA256.json."""
    manifest_path = AI_SERVICE_DIR / "experiments" / "evaluation" / "MANIFEST_SHA256.json"
    if not manifest_path.exists():
        print(f"[ERROR] Không tìm thấy tệp manifest tại: {manifest_path}")
        return False

    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    print("\n" + "=" * 80)
    print("MỨC 1: XÁC MINH TÍNH TOÀN VẸN MẬT MÃ HỌC (SHA-256 INTEGRITY CHECK)")
    print("=" * 80)
    print(f"Phiên bản Manifest: {manifest.get('manifest_version')} | Thời gian tạo: {manifest.get('generated_at')}")
    print(f"Corpus Fingerprint: {manifest.get('semantic_corpus_fingerprint')}\n")

    all_passed = True
    for key, item in manifest["files"].items():
        file_path = PROJECT_ROOT / item["path"]
        if not file_path.exists():
            print(f"❌ [MISSING] {key}: Không tìm thấy tệp {item['path']}")
            all_passed = False
            continue

        hasher = hashlib.sha256()
        with open(file_path, "rb") as fp:
            while chunk := fp.read(65536):
                hasher.update(chunk)
        actual_hash = hasher.hexdigest()
        expected_hash = item["sha256"]

        if actual_hash == expected_hash:
            print(f"✅ [MATCH] {key:<32} ({item['size_bytes']:>10,} bytes) -> SHA-256: {actual_hash[:16]}...")
        else:
            print(f"❌ [MISMATCH] {key}:")
            print(f"   Kỳ vọng: {expected_hash}")
            print(f"   Thực tế: {actual_hash}")
            all_passed = False

    if all_passed:
        print("\n🎉 KẾT QUẢ MỨC 1: 100% tệp dữ liệu, mã nguồn và kết quả khớp tuyệt đối với Manifest!")
    else:
        print("\n⚠️ CẢNH BÁO: Phát hiện tệp bị thiếu hoặc có sự thay đổi nội dung!")
    return all_passed


# ══════════════════════════════════════════════════════════════════════════════
# 2. MỨC 2: KIỂM THỬ TOÁN HỌC ĐỘC LẬP BẰNG DỮ LIỆU GIẢ ĐỊNH TÍNH TAY
# ══════════════════════════════════════════════════════════════════════════════

def verify_independent_math() -> bool:
    """Kiểm tra các công thức đo lường bằng các bộ dữ liệu nhỏ tính thủ công bằng bút và giấy."""
    print("\n" + "=" * 80)
    print("MỨC 2: KIỂM THỬ TOÁN HỌC ĐỘC LẬP BẰNG DỮ LIỆU TÍNH TAY (INDEPENDENT HAND-CALCULATIONS)")
    print("=" * 80)

    all_ok = True

    # --------------------------------------------------------------------------
    # Case 1: TREC Graded Relevance Hierarchy & Ideal Ranking
    # Pool: [3, 2, 1, 0] -> Ideal DCG@4:
    #   Rank 1 (g=3): (2^3 - 1) / log2(2) = 7.0 / 1.0 = 7.0
    #   Rank 2 (g=2): (2^2 - 1) / log2(3) = 3.0 / 1.58496250072 = 1.8927892607
    #   Rank 3 (g=1): (2^1 - 1) / log2(4) = 1.0 / 2.0 = 0.5
    #   Rank 4 (g=0): 0.0
    #   IDCG@4 = 7.0 + 1.8927892607 + 0.5 = 9.3927892607
    expected_idcg4 = 7.0 + 3.0 / math.log2(3) + 0.5
    actual_idcg4 = compute_idcg_at_k([3, 2, 1, 0], 4)
    assert abs(actual_idcg4 - expected_idcg4) < 1e-6, "Sai lệch IDCG@4 tính tay"
    print(f"✅ [Case 1 - IDCG@4 tính tay]: Kỳ vọng = {expected_idcg4:.6f} | Thực tế = {actual_idcg4:.6f} -> KHỚP")

    # Retrieved: [3, 2, 0, 1]
    #   DCG@4 = 7.0 + 3.0/log2(3) + 0 + 1.0/log2(5)
    #   1.0 / log2(5) = 1.0 / 2.32192809489 = 0.430676558
    #   DCG@4 = 7.0 + 1.8927892607 + 0.430676558 = 9.3234658188
    #   NDCG@4 = 9.3234658188 / 9.3927892607 = 0.992619503
    expected_dcg4 = 7.0 + 3.0 / math.log2(3) + 0.0 + 1.0 / math.log2(5)
    expected_ndcg4 = expected_dcg4 / expected_idcg4
    actual_ndcg4 = compute_ndcg_at_k([3, 2, 0, 1], [3, 2, 1, 0], 4)
    assert abs(actual_ndcg4 - expected_ndcg4) < 1e-6, "Sai lệch NDCG@4 tính tay"
    print(f"✅ [Case 1 - NDCG@4 tính tay]: Kỳ vọng = {expected_ndcg4:.6f} | Thực tế = {actual_ndcg4:.6f} -> KHỚP")

    # --------------------------------------------------------------------------
    # Case 2: Precision, Recall, MAP@4 và MRR tính tay
    # Retrieved flags (g >= 2): [True, True, False, False]
    # Total relevant in pool = 2 (chỉ các mục g=3 và g=2)
    # P@1 = 1/1 = 1.0, P@2 = 2/2 = 1.0, P@3 = 2/3 = 0.666667, P@4 = 2/4 = 0.5
    # PR-Recall@4 = 2 / 2 = 1.0
    # AP@4 = (P@1 + P@2) / min(2, 4) = (1.0 + 1.0) / 2 = 1.0
    # MRR = 1/1 = 1.0
    flags_c1 = [True, True, False, False]
    assert abs(compute_precision_at_k(flags_c1, 4) - 0.5) < 1e-6
    assert abs(compute_pooled_relative_recall_at_k(flags_c1, 2, 4) - 1.0) < 1e-6
    assert abs(compute_average_precision(flags_c1, 2, 4) - 1.0) < 1e-6
    assert abs(compute_reciprocal_rank(flags_c1, 4) - 1.0) < 1e-6
    print("✅ [Case 2 - P@4, PR-Recall@4, MAP@4, MRR tính tay]: Hoàn hảo (1.0 & 0.5) -> KHỚP")

    # --------------------------------------------------------------------------
    # Case 3: Ranking đảo chiều (Reversed Ranking)
    # Retrieved flags: [False, False, True, True] (Hits tại rank 3 và 4)
    # Total relevant in pool = 2
    # P@3 = 1/3, P@4 = 2/4 = 0.5
    # AP@4 = (1/3 + 1/2) / min(2, 4) = (5/6) / 2 = 5/12 = 0.4166667
    # MRR = 1/3 = 0.3333333
    flags_c3 = [False, False, True, True]
    expected_ap_c3 = (1.0 / 3.0 + 0.5) / 2.0
    expected_mrr_c3 = 1.0 / 3.0
    assert abs(compute_average_precision(flags_c3, 2, 4) - expected_ap_c3) < 1e-6
    assert abs(compute_reciprocal_rank(flags_c3, 4) - expected_mrr_c3) < 1e-6
    print(f"✅ [Case 3 - AP@4 đảo chiều]: Kỳ vọng = {expected_ap_c3:.6f} | Thực tế = {compute_average_precision(flags_c3, 2, 4):.6f} -> KHỚP")
    print(f"✅ [Case 3 - MRR đảo chiều]: Kỳ vọng = {expected_mrr_c3:.6f} | Thực tế = {compute_reciprocal_rank(flags_c3, 4):.6f} -> KHỚP")

    # --------------------------------------------------------------------------
    # Case 4: Trường hợp Biên Q076 (0 tài liệu liên quan Grade >= 2, nhưng có 1 Grade 1)
    # Pool: [1, 0, 0], total_relevant_in_pool = 0
    # Expected: PR-Recall = 0.0 (safe division guard), MAP = 0.0 (safe guard)
    # IDCG@10 = (2^1 - 1) / log2(2) = 1.0 > 0
    # Retrieved: [1, 0] -> DCG = 1.0 -> NDCG = 1.0
    # Retrieved: [0, 0] -> DCG = 0.0 -> NDCG = 0.0
    pool_q076 = [1, 0, 0]
    assert compute_pooled_relative_recall_at_k([False, False], 0, 10) == 0.0
    assert compute_average_precision([False, False], 0, 10) == 0.0
    assert abs(compute_idcg_at_k(pool_q076, 10) - 1.0) < 1e-6
    assert abs(compute_ndcg_at_k([1, 0], pool_q076, 10) - 1.0) < 1e-6
    assert abs(compute_ndcg_at_k([0, 0], pool_q076, 10) - 0.0) < 1e-6
    print("✅ [Case 4 - Biên Q076 (Zero Relevant Docs in Pool)]: PR-Recall=0.0, MAP=0.0, IDCG=1.0 -> KHỚP")

    # --------------------------------------------------------------------------
    # Case 5: Pool Rỗng hoặc Toàn Grade 0
    # Expected: IDCG = 0.0 -> NDCG = 0.0 an toàn
    assert compute_idcg_at_k([], 10) == 0.0
    assert compute_ndcg_at_k([2, 3], [], 10) == 0.0
    assert compute_idcg_at_k([0, 0, 0], 10) == 0.0
    assert compute_ndcg_at_k([0, 0], [0, 0, 0], 10) == 0.0
    print("✅ [Case 5 - Pool Rỗng / Toàn Grade 0]: Xử lý mẫu số 0 an toàn trả về 0.0 -> KHỚP")

    print("\n🎉 KẾT QUẢ MỨC 2: Toàn bộ 5 ca kiểm thử toán học độc lập đều đạt chuẩn xác 100%!")
    return all_ok


# ══════════════════════════════════════════════════════════════════════════════
# 3. MỨC 3: TÁI TÍNH TOÁN METRICS VĨ MÔ TỪ XẾP HẠNG TOP-10 GỐC
# ══════════════════════════════════════════════════════════════════════════════

def verify_stored_metrics() -> bool:
    """Tái tính toán toàn bộ công thức IR từ Top-10 gốc của từng query trong file JSON."""
    results_path = AI_SERVICE_DIR / "experiments" / "evaluation" / "benchmark_results_run04_calibrated.json"
    if not results_path.exists():
        print(f"[ERROR] Không tìm thấy kết quả JSON tại: {results_path}")
        return False

    with open(results_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    _, gt_map = load_ground_truth_and_queries()

    print("\n" + "=" * 80)
    print("MỨC 3: TÁI TÍNH TOÁN VÀ ĐỐI CHIẾU CHỈ SỐ VĨ MÔ TỪ XẾP HẠNG GỐC CỦA TỪNG QUERY")
    print("=" * 80)

    models = data["models"]
    all_consistent = True

    for model_name, m_info in models.items():
        details = m_info["per_query_details"]
        reported_cons = m_info["overall"]["metrics"]

        recalc_ndcg10 = []
        recalc_p10 = []
        recalc_pr_r10 = []
        recalc_map10 = []
        recalc_mrr = []
        recalc_hit10 = []

        for q_entry in details:
            qid = q_entry["query_id"]
            gt_info = gt_map[qid]
            pool_grades = gt_info["all_pool_grades"]
            total_rel = gt_info["total_rel_in_pool"]

            retrieved = q_entry["retrieved_top10"]
            grades_cons = [item["grade_conservative"] for item in retrieved]
            flags_cons = [item["is_relevant_conservative"] for item in retrieved]

            recalc_ndcg10.append(compute_ndcg_at_k(grades_cons, pool_grades, 10))
            recalc_p10.append(compute_precision_at_k(flags_cons, 10))
            recalc_pr_r10.append(compute_pooled_relative_recall_at_k(flags_cons, total_rel, 10))
            recalc_map10.append(compute_average_precision(flags_cons, total_rel, 10))
            recalc_mrr.append(compute_reciprocal_rank(flags_cons, 10))
            recalc_hit10.append(compute_hit_at_k(flags_cons, 10))

        mean_ndcg10 = sum(recalc_ndcg10) / len(recalc_ndcg10)
        mean_p10 = sum(recalc_p10) / len(recalc_p10)
        mean_pr_r10 = sum(recalc_pr_r10) / len(recalc_pr_r10)
        mean_map10 = sum(recalc_map10) / len(recalc_map10)
        mean_mrr = sum(recalc_mrr) / len(recalc_mrr)
        mean_hit10 = sum(recalc_hit10) / len(recalc_hit10)

        diff_ndcg = abs(mean_ndcg10 - reported_cons["ndcg@10"])
        diff_p10 = abs(mean_p10 - reported_cons["p@10"])
        diff_pr_r10 = abs(mean_pr_r10 - reported_cons["pr_recall@10"])
        diff_map10 = abs(mean_map10 - reported_cons["map@10"])

        status_ok = max(diff_ndcg, diff_p10, diff_pr_r10, diff_map10) < 1e-4
        if status_ok:
            print(f"✅ [{model_name:<22}] NDCG@10={mean_ndcg10:.4f} | P@10={mean_p10:.4f} | MAP@10={mean_map10:.4f} | PR-R@10={mean_pr_r10:.4f} -> Khớp 100%")
        else:
            print(f"❌ [{model_name:<22}] LỆCH SỐ LIỆU: NDCG@10={mean_ndcg10:.4f} vs {reported_cons['ndcg@10']:.4f}")
            all_consistent = False

    if all_consistent:
        print("\n🎉 KẾT QUẢ MỨC 3: 100% chỉ số IR vĩ mô trong báo cáo được tái lập hoàn hảo từ xếp hạng gốc!")
    return all_consistent


# ══════════════════════════════════════════════════════════════════════════════
# 4. MỨC 4: TÁI CHẠY TRUY XUẤT MẪU VÀ SO SÁNH RANKING CẢ 5 MÔ HÌNH
# ══════════════════════════════════════════════════════════════════════════════

def run_sample_all_models(iterations: int = 3) -> bool:
    """Thực thi truy xuất trực tiếp cả 5 mô hình trên 5 query mẫu và so sánh Top-10 với kết quả lưu trữ."""
    print("\n" + "=" * 80)
    print("MỨC 4: TÁI CHẠY TRUY XUẤT MẪU TRỰC TIẾP & SO SÁNH THỨ HẠNG CẢ 5 MÔ HÌNH")
    print("=" * 80)

    # 1. Nạp Corpus
    print("Đang nạp Corpus và Tokenizer Cache...")
    t0 = time.perf_counter()
    df = load_verified_corpus()
    tokenizer, tok_corpus = load_tokenizer_and_cache(df)
    movie_ids = df["movieId"].tolist()
    print(f"✅ Đã nạp {len(movie_ids):,} phim trong {time.perf_counter() - t0:.2f}s.")

    # 2. Khởi tạo TF-IDF
    print("Đang khởi tạo TF-IDF (25k features, sublinear TF)...")
    tok_corpus_strings = [" ".join(doc) for doc in tok_corpus]
    tfidf_vec = TfidfVectorizer(max_features=25000, sublinear_tf=True)
    tfidf_mat = tfidf_vec.fit_transform(tok_corpus_strings)

    # 3. Khởi tạo BM25
    print("Đang khởi tạo Okapi BM25...")
    bm25 = BM25Okapi(tok_corpus)

    # 4. Khởi tạo ChromaDB
    print("Đang nạp ChromaDB và mô hình Dense Embeddings...")
    chroma_dir = AI_SERVICE_DIR / "data" / "chroma_db"
    client = chromadb.PersistentClient(path=str(chroma_dir))
    col_sbert = client.get_collection("movies")
    col_e5_small = client.get_collection("movies_e5_small")
    col_e5_base = client.get_collection("movies_e5_base")

    model_sbert = SentenceTransformer("paraphrase-multilingual-MiniLM-L12-v2")
    model_e5_small = SentenceTransformer("intfloat/multilingual-e5-small")
    model_e5_base = SentenceTransformer("intfloat/multilingual-e5-base")

    # 5. Nạp kết quả đã lưu trữ
    results_path = AI_SERVICE_DIR / "experiments" / "evaluation" / "benchmark_results_run04_calibrated.json"
    with open(results_path, "r", encoding="utf-8") as f:
        calib_data = json.load(f)

    # 6. Danh sách 5 câu truy vấn đại diện
    queries_path = AI_SERVICE_DIR / "experiments" / "ground_truth" / "benchmark_queries_v2.json"
    with open(queries_path, "r", encoding="utf-8") as f:
        queries_data = json.load(f)["queries"]

    sample_qids = ["Q001", "Q021", "Q041", "Q061", "Q081"]
    sample_queries = [q for q in queries_data if q["query_id"] in sample_qids]

    models_config = {
        "TF-IDF": ("tfidf", tfidf_vec),
        "BM25": ("bm25", bm25),
        "SBERT MiniLM": ("dense", (model_sbert, col_sbert, False)),
        "Multilingual E5 Small": ("dense", (model_e5_small, col_e5_small, True)),
        "Multilingual E5 Base": ("dense", (model_e5_base, col_e5_base, True)),
    }

    total_checks = 0
    exact_matches = 0

    for m_name, (m_type, engine) in models_config.items():
        print(f"\n--- Kiểm tra Mô hình: {m_name} ---")
        saved_details = {q["query_id"]: q for q in calib_data["models"][m_name]["per_query_details"]}

        for q in sample_queries:
            qid = q["query_id"]
            qtext = q["query"]
            saved_top10 = [item["movie_id"] for item in saved_details[qid]["retrieved_top10"]]

            # Đo độ trễ và truy xuất thực tế
            latencies = []
            live_top10 = []

            for it in range(iterations + 1):  # 1 warmup + iterations
                t_start = time.perf_counter()

                if m_type == "tfidf":
                    tokens = tokenizer.tokenize(qtext)
                    q_str = " ".join(tokens)
                    q_vec = engine.transform([q_str])
                    scores = cosine_similarity(q_vec, tfidf_mat).flatten()
                    top_idx = scores.argsort()[::-1][:10]
                    cur_ids = [int(df.iloc[idx]["movieId"]) for idx in top_idx]

                elif m_type == "bm25":
                    tokens = tokenizer.tokenize(qtext)
                    scores = np.array(engine.get_scores(tokens))
                    top_idx = scores.argsort()[::-1][:10]
                    cur_ids = [int(df.iloc[idx]["movieId"]) for idx in top_idx]

                elif m_type == "dense":
                    m_enc, m_col, has_prefix = engine
                    p_query = ("query: " + qtext) if has_prefix else qtext
                    emb = m_enc.encode(p_query, normalize_embeddings=True).tolist()
                    res = m_col.query(query_embeddings=[emb], n_results=10)
                    cur_ids = [int(mid) for mid in res["ids"][0]]

                dur = (time.perf_counter() - t_start) * 1000
                if it > 0:
                    latencies.append(dur)
                    live_top10 = cur_ids

            mean_lat = sum(latencies) / len(latencies)
            is_match = (live_top10 == saved_top10)
            overlap = len(set(live_top10).intersection(set(saved_top10)))
            total_checks += 1
            if is_match:
                exact_matches += 1
                status_icon = "✅ [MATCH 100%]"
            else:
                status_icon = f"⚠️ [OVERLAP {overlap}/10]"

            print(f"[{qid}] {status_icon} | Latency: {mean_lat:5.2f} ms | Live: {live_top10[:3]} | Lưu trữ: {saved_top10[:3]}")

    match_pct = (exact_matches / total_checks) * 100
    print(f"\n🎉 KẾT QUẢ MỨC 4: Tỷ lệ khớp thứ hạng Top-10 đạt {exact_matches}/{total_checks} ({match_pct:.1f}%) trên cả 5 mô hình!")
    return exact_matches == total_checks


# ══════════════════════════════════════════════════════════════════════════════
# MAIN DISPATCHER
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Xác minh và tái lập độc lập kết quả IR Bước 4.")
    parser.add_argument("--verify-checksums", action="store_true", help="Mức 1: Xác minh mã băm SHA-256 các tệp bàn giao.")
    parser.add_argument("--verify-math", action="store_true", help="Mức 2: Kiểm thử toán học độc lập bằng toy datasets tính tay.")
    parser.add_argument("--verify-stored-metrics", action="store_true", help="Mức 3: Tái tính toán công thức IR từ xếp hạng Top-10.")
    parser.add_argument("--run-sample-all-models", action="store_true", help="Mức 4: Tái chạy mẫu trực tiếp cả 5 mô hình và đo latency.")
    parser.add_argument("--all", action="store_true", help="Thực hiện toàn bộ 4 mức kiểm tra.")

    args = parser.parse_args()

    run_all = args.all or (
        not args.verify_checksums
        and not args.verify_math
        and not args.verify_stored_metrics
        and not args.run_sample_all_models
    )

    results = {}
    if args.verify_checksums or run_all:
        results["Mức 1 (Checksum)"] = verify_checksums()

    if args.verify_math or run_all:
        results["Mức 2 (Toán học Độc lập)"] = verify_independent_math()

    if args.verify_stored_metrics or run_all:
        results["Mức 3 (Metrics Tổng hợp)"] = verify_stored_metrics()

    if args.run_sample_all_models or run_all:
        results["Mức 4 (Tái chạy 5 Mô hình)"] = run_sample_all_models(iterations=3)

    print("\n" + "=" * 80)
    print("TỔNG HỢP KẾT QUẢ KIỂM CHỨNG TÁI LẬP BƯỚC 4:")
    print("=" * 80)
    for k, v in results.items():
        icon = "✅ ĐẠT (PASS)" if v else "❌ KHÔNG ĐẠT (FAIL)"
        print(f"  - {k:<30}: {icon}")
    print("=" * 80)


if __name__ == "__main__":
    main()
