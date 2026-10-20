#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""annotate_ground_truth_v2.py.

============================
Công cụ hỗ trợ chuyên gia thẩm định và gán nhãn Ground Truth V2 (Bước 3):
1. Đánh giá mù hoàn toàn độc lập (Strict Double-Blind Independent Evaluation):
   - Ẩn toàn bộ tên model (TF-IDF, BM25, SBERT, E5), thứ hạng rank, điểm số và cờ phim nguồn.
   - ẨN ĐIỂM SỐ VÀ GIẢI THÍCH CỦA GEMINI trước khi người đánh giá đưa ra quyết định để tránh thiên lệch (anchoring bias).
   - Chỉ hiển thị đối chiếu sau khi người đánh giá đã chốt điểm hoặc khi có yêu cầu cụ thể.
2. Hỗ trợ hai thành viên thẩm định độc lập (Multi-Annotator Protocol):
   - Lưu trữ nhãn riêng biệt cho từng thành viên: `human_annotations_<id>.json` (ví dụ 52300063 và 52300070).
   - Đo lường mức độ đồng thuận: Tỷ lệ đồng thuận chính xác (%), đồng thuận nhị phân (%), và Weighted Cohen's Kappa (Quadratic / Linear weights).
   - Cơ chế giải quyết bất đồng (Adjudication flow): Cho phép thảo luận và chốt nhãn đồng thuận (consensus) chính thức.
3. Mẫu kiểm chứng phân tầng nâng cao (Comprehensive Stratified Verification Sampling):
   - Bao phủ đồng đều 5 nhóm truy vấn (Lexical, Semantic, Abstract, Typo_Slang, Short_Long).
   - Bao phủ toàn diện các mức điểm 0–3, các trường hợp thiếu bằng chứng (insufficient_evidence).
   - Ưu tiên đặc biệt các trường hợp phim nguồn bị LLM đánh giá thấp (under-scored sources như Q048, Q051, Q054, Q055, Q076).
4. Hoạt động 100% offline, không phụ thuộc vào Gemini API key khi xem báo cáo và kiểm chứng.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime
import json
import os
from pathlib import Path
import random
import shutil
import sys
from typing import Any, Dict, List, Optional, Tuple

# ─── Thiết lập encoding UTF-8 ────────────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent
GT_DIR = AI_SERVICE_DIR / "experiments" / "ground_truth"

GROUND_TRUTH_V2_FILE = GT_DIR / "ground_truth_v2.json"
ANNOTATION_QUEUE_FILE = GT_DIR / "annotation_queue_v2.json"
SHUFFLE_SEED = 42

# Danh mục các query có trường hợp phim nguồn đặc biệt cần lưu tâm
UNDER_SCORED_SOURCE_QUERIES = {"Q048", "Q051", "Q054", "Q055", "Q076"}


# ══════════════════════════════════════════════════════════════════════════════
# 1. HÀM XÁO TRỘN CÓ THỂ TÁI LẬP (REPRODUCIBLE SHUFFLING)
# ══════════════════════════════════════════════════════════════════════════════


def get_reproducible_shuffled_candidates(
    query_id: str, candidates: List[Dict[str, Any]], seed: int = SHUFFLE_SEED
) -> List[Dict[str, Any]]:
    """Xáo trộn danh sách ứng viên một cách có thể tái lập theo query_id và seed."""
    rng = random.Random(f"{seed}_{query_id}")
    shuffled = list(candidates)
    rng.shuffle(shuffled)
    return shuffled


# ══════════════════════════════════════════════════════════════════════════════
# 2. HÀM NẠP VÀ LƯU DỮ LIỆU ANNOTATION ĐỒNG BỘ
# ══════════════════════════════════════════════════════════════════════════════


def load_ground_truth_v2() -> Dict[str, Any]:
    """Nạp tệp ground_truth_v2.json an toàn."""
    if not GROUND_TRUTH_V2_FILE.exists():
        raise FileNotFoundError(
            f"[FATAL] Không tìm thấy file {GROUND_TRUTH_V2_FILE}. "
            "Vui lòng chạy 'python scripts/build_ground_truth_v2.py' trước!"
        )
    with open(GROUND_TRUTH_V2_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_ground_truth_v2(data: Dict[str, Any]) -> None:
    """Lưu tệp ground_truth_v2.json nguyên tử kèm cập nhật lại metadata."""
    total_candidates = 0
    verified_count = 0
    unassessed_count = 0
    source_verified = 0

    for q in data.get("queries", []):
        for c in q.get("candidates", []):
            total_candidates += 1
            if c.get("verified_by_human"):
                verified_count += 1
                if c.get("is_source_movie"):
                    source_verified += 1
            else:
                unassessed_count += 1

    status_meta = data.get("metadata", {}).get("annotation_status", {})
    status_meta["total_candidates"] = total_candidates
    status_meta["verified_by_human_count"] = verified_count
    status_meta["unassessed_count"] = unassessed_count
    status_meta["source_movies_human_verified"] = source_verified

    GROUND_TRUTH_V2_FILE.parent.mkdir(parents=True, exist_ok=True)
    bak_p = GROUND_TRUTH_V2_FILE.with_suffix(".bak")
    tmp_p = GROUND_TRUTH_V2_FILE.with_suffix(".tmp")
    if GROUND_TRUTH_V2_FILE.exists():
        shutil.copy2(GROUND_TRUTH_V2_FILE, bak_p)
    with open(tmp_p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp_p.replace(GROUND_TRUTH_V2_FILE)


def sync_annotation_queue(gt_data: Dict[str, Any]) -> None:
    """Đồng bộ trạng thái từ ground_truth_v2 sang annotation_queue_v2.json."""
    queue_items = []
    verified_items = 0
    pending_items = 0

    for q in gt_data.get("queries", []):
        qid = q["query_id"]
        q_type = q.get("query_group") or q.get("query_type")
        q_text = q["query"]

        for c in q.get("candidates", []):
            is_verified = bool(c.get("verified_by_human", False))
            if is_verified:
                verified_items += 1
            else:
                pending_items += 1

            queue_items.append(
                {
                    "queue_id": f"{qid}_{c['movie_id']}",
                    "query_id": qid,
                    "query_type": q_type,
                    "query": q_text,
                    "movie_id": c["movie_id"],
                    "tmdb_id": c.get("tmdb_id"),
                    "title_vi": c.get("title_vi"),
                    "title_en": c.get("title_en"),
                    "genres": c.get("genres"),
                    "release_date": c.get("release_date"),
                    "vote_average": c.get("vote_average"),
                    "overview_snippet": c.get("overview_snippet"),
                    "overview_full": c.get("overview_full"),
                    "pooled_by": c.get("pooled_by", []),
                    "model_ranks": c.get("model_ranks", {}),
                    "is_source_movie": c.get("is_source_movie", False),
                    "relevance_grade": c.get("relevance_grade"),
                    "verified_by_human": is_verified,
                    "status": c.get("status", "llm_judged"),
                    "annotated_by": c.get("annotated_by", ""),
                    "annotated_at": c.get("annotated_at", ""),
                    "notes": c.get("notes", ""),
                    "llm_grade": c.get("llm_grade"),
                    "llm_verdict": c.get("llm_verdict"),
                    "llm_reasoning": c.get("llm_reasoning"),
                    "judge_model": c.get("judge_model"),
                }
            )

    queue_payload = {
        "metadata": {
            "version": "2.0-annotation-queue",
            "last_synced_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_items": len(queue_items),
            "pending_annotation_items": pending_items,
            "verified_items": verified_items,
            "blinded_evaluation": True,
        },
        "queue": queue_items,
    }
    ANNOTATION_QUEUE_FILE.parent.mkdir(parents=True, exist_ok=True)
    bak_p = ANNOTATION_QUEUE_FILE.with_suffix(".bak")
    tmp_p = ANNOTATION_QUEUE_FILE.with_suffix(".tmp")
    if ANNOTATION_QUEUE_FILE.exists():
        shutil.copy2(ANNOTATION_QUEUE_FILE, bak_p)
    with open(tmp_p, "w", encoding="utf-8") as f:
        json.dump(queue_payload, f, ensure_ascii=False, indent=2)
    tmp_p.replace(ANNOTATION_QUEUE_FILE)


# ══════════════════════════════════════════════════════════════════════════════
# 3. QUẢN LÝ NHÃN CỦA TỪNG NGƯỜI ĐÁNH GIÁ ĐỘC LẬP (INDIVIDUAL ANNOTATIONS)
# ══════════════════════════════════════════════════════════════════════════════


def get_annotator_file_path(annotator_id: str) -> Path:
    """Trả về đường dẫn file lưu nhãn độc lập của một người đánh giá."""
    safe_id = "".join(ch for ch in annotator_id if ch.isalnum() or ch in ("_", "-"))
    GT_DIR.mkdir(parents=True, exist_ok=True)
    return GT_DIR / f"human_annotations_{safe_id}.json"


def load_annotator_records(annotator_id: str) -> Dict[str, Any]:
    """Nạp các nhãn đã chấm của một thành viên."""
    p = get_annotator_file_path(annotator_id)
    if not p.exists():
        return {
            "annotator_id": annotator_id,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "annotations": {},
        }
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


def save_annotator_grade(
    annotator_id: str,
    query_id: str,
    movie_id: int,
    grade: int,
    notes: str = "",
) -> None:
    """Lưu nhãn độc lập của thành viên vào file riêng biệt."""
    if not annotator_id or not str(annotator_id).strip():
        raise ValueError("annotator_id không được để trống khi lưu đánh giá cá nhân!")
    if grade not in (0, 1, 2, 3):
        raise ValueError(f"Grade phải thuộc {{0, 1, 2, 3}}, nhận: {grade}")

    data = load_annotator_records(annotator_id)
    pair_id = f"{query_id}_{movie_id}"
    data["annotations"][pair_id] = {
        "pair_id": pair_id,
        "query_id": query_id,
        "movie_id": int(movie_id),
        "grade": grade,
        "notes": notes,
        "annotated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    data["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    data["total_annotated"] = len(data["annotations"])

    p = get_annotator_file_path(annotator_id)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp_p = p.with_suffix(".tmp")
    with open(tmp_p, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp_p.replace(p)


def annotate_candidate(
    gt_data: Dict[str, Any],
    query_id: str,
    movie_id: int,
    relevance_grade: int,
    annotator: str = "Expert Annotator",
    notes: str = "",
    save_to_file: bool = True,
) -> bool:
    """Gán nhãn xác minh chính thức của con người vào ground_truth_v2."""
    if not annotator or not str(annotator).strip():
        raise ValueError("annotator không được để trống khi xác minh nhãn con người!")
    if relevance_grade not in (0, 1, 2, 3):
        raise ValueError(f"relevance_grade phải thuộc {{0, 1, 2, 3}}, nhận: {relevance_grade}")

    movie_id = int(movie_id)
    target_q = next((q for q in gt_data.get("queries", []) if q["query_id"] == query_id), None)
    if not target_q:
        return False

    target_cand = next((c for c in target_q.get("candidates", []) if int(c["movie_id"]) == movie_id), None)
    if not target_cand:
        return False

    target_cand["relevance_grade"] = relevance_grade
    target_cand["verified_by_human"] = True
    target_cand["status"] = "verified"
    target_cand["annotated_by"] = str(annotator).strip()
    target_cand["annotated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if notes:
        target_cand["notes"] = notes

    if save_to_file:
        save_ground_truth_v2(gt_data)
        sync_annotation_queue(gt_data)
    return True


# ══════════════════════════════════════════════════════════════════════════════
# 4. TÍNH TOÁN ĐỒNG THUẬN VÀ WEIGHTED COHEN'S KAPPA (INTER-ANNOTATOR AGREEMENT)
# ══════════════════════════════════════════════════════════════════════════════


def compute_weighted_cohen_kappa(
    ratings1: List[int], ratings2: List[int], weights: str = "quadratic"
) -> float:
    """Tính toán Weighted Cohen's Kappa cho hai danh sách đánh giá thứ bậc (0, 1, 2, 3).

    Công thức:
      w_ij = (i - j)^2 / 9 (quadratic) hoặc |i - j| / 3 (linear)
      kappa = 1 - (observed_weighted_disagreement / expected_weighted_disagreement)
    """
    assert len(ratings1) == len(ratings2), "Hai danh sách đánh giá phải có cùng số lượng mẫu"
    N = len(ratings1)
    if N == 0:
        return 0.0

    K = 4  # Số mức đánh giá: 0, 1, 2, 3
    # 1. Ma trận quan sát (Confusion Matrix)
    observed = [[0] * K for _ in range(K)]
    for r1, r2 in zip(ratings1, ratings2):
        if 0 <= r1 < K and 0 <= r2 < K:
            observed[r1][r2] += 1

    # 2. Tổng biên
    row_sums = [sum(observed[i][j] for j in range(K)) for i in range(K)]
    col_sums = [sum(observed[i][j] for i in range(K)) for j in range(K)]

    # 3. Ma trận kỳ vọng
    expected = [[(row_sums[i] * col_sums[j]) / N for j in range(K)] for i in range(K)]

    # 4. Ma trận trọng số khoảng cách bất đồng
    denom = (K - 1) ** 2 if weights == "quadratic" else (K - 1)
    weight_matrix = [[0.0] * K for _ in range(K)]
    for i in range(K):
        for j in range(K):
            diff = (i - j) ** 2 if weights == "quadratic" else abs(i - j)
            weight_matrix[i][j] = diff / denom

    # 5. Tính bất đồng quan sát và kỳ vọng
    d_o = sum(weight_matrix[i][j] * observed[i][j] for i in range(K) for j in range(K)) / N
    d_e = sum(weight_matrix[i][j] * expected[i][j] for i in range(K) for j in range(K)) / N

    if d_e == 0:
        return 1.0 if d_o == 0 else 0.0

    kappa = 1.0 - (d_o / d_e)
    return round(float(kappa), 4)


def get_kappa_interpretation(kappa: float) -> str:
    """Giải thích mức độ đồng thuận theo quy chuẩn Landis & Koch (1977)."""
    if kappa < 0.0:
        return "Bất đồng thuận (Poor / Less than chance agreement)"
    elif kappa <= 0.20:
        return "Đồng thuận rất yếu (Slight agreement)"
    elif kappa <= 0.40:
        return "Đồng thuận trung bình yếu (Fair agreement)"
    elif kappa <= 0.60:
        return "Đồng thuận vừa phải (Moderate agreement)"
    elif kappa <= 0.80:
        return "Đồng thuận đáng kể (Substantial agreement)"
    else:
        return "Đồng thuận gần như tuyệt đối (Almost perfect agreement)"


def compute_inter_annotator_agreement(
    annotator1_id: str = "52300063", annotator2_id: str = "52300070"
) -> Dict[str, Any]:
    """So sánh toàn bộ nhãn giữa hai người đánh giá độc lập."""
    ann1 = load_annotator_records(annotator1_id).get("annotations", {})
    ann2 = load_annotator_records(annotator2_id).get("annotations", {})

    shared_pairs = sorted(list(set(ann1.keys()) & set(ann2.keys())))
    if not shared_pairs:
        return {
            "annotator1": annotator1_id,
            "annotator2": annotator2_id,
            "shared_count": 0,
            "ann1_total": len(ann1),
            "ann2_total": len(ann2),
            "exact_agreement_rate": 0.0,
            "binary_agreement_rate": 0.0,
            "quadratic_weighted_kappa": 0.0,
            "linear_weighted_kappa": 0.0,
            "disagreements": [],
        }

    ratings1 = [ann1[p]["grade"] for p in shared_pairs]
    ratings2 = [ann2[p]["grade"] for p in shared_pairs]

    exact_matches = sum(1 for r1, r2 in zip(ratings1, ratings2) if r1 == r2)
    binary_matches = sum(1 for r1, r2 in zip(ratings1, ratings2) if (r1 >= 2) == (r2 >= 2))

    quad_kappa = compute_weighted_cohen_kappa(ratings1, ratings2, weights="quadratic")
    linear_kappa = compute_weighted_cohen_kappa(ratings1, ratings2, weights="linear")

    disagreements = []
    for p in shared_pairs:
        g1 = ann1[p]["grade"]
        g2 = ann2[p]["grade"]
        if g1 != g2:
            disagreements.append(
                {
                    "pair_id": p,
                    "query_id": ann1[p]["query_id"],
                    "movie_id": ann1[p]["movie_id"],
                    "grade_1": g1,
                    "grade_2": g2,
                    "diff": abs(g1 - g2),
                    "note_1": ann1[p].get("notes", ""),
                    "note_2": ann2[p].get("notes", ""),
                }
            )

    return {
        "annotator1": annotator1_id,
        "annotator2": annotator2_id,
        "shared_count": len(shared_pairs),
        "ann1_total": len(ann1),
        "ann2_total": len(ann2),
        "exact_matches": exact_matches,
        "exact_agreement_rate": round(exact_matches / len(shared_pairs) * 100, 2),
        "binary_matches": binary_matches,
        "binary_agreement_rate": round(binary_matches / len(shared_pairs) * 100, 2),
        "quadratic_weighted_kappa": quad_kappa,
        "linear_weighted_kappa": linear_kappa,
        "kappa_interpretation": get_kappa_interpretation(quad_kappa),
        "disagreements": disagreements,
    }


def print_inter_annotator_report(report: Dict[str, Any]) -> None:
    """Hiển thị báo cáo đồng thuận đẹp mắt trên console."""
    print("\n" + "=" * 80)
    print("🤝 BÁO CÁO ĐỒNG THUẬN GIỮA HAI NGƯỜI ĐÁNH GIÁ ĐỘC LẬP")
    print(f"   Thành viên 1: [{report['annotator1']}] (Đã chấm: {report['ann1_total']} cặp)")
    print(f"   Thành viên 2: [{report['annotator2']}] (Đã chấm: {report['ann2_total']} cặp)")
    print("=" * 80)
    print(f"  • Số cặp trùng khớp cả hai đã chấm:           {report['shared_count']} cặp")

    if report["shared_count"] == 0:
        print("  ⚠️ Chưa có cặp nào được cả hai người chấm chung! Vui lòng chấm trên cùng một tập mẫu.")
        print("=" * 80 + "\n")
        return

    print(f"  • Tỷ lệ đồng thuận chính xác (Exact Match):    {report['exact_matches']}/{report['shared_count']} ({report['exact_agreement_rate']}%)")
    print(f"  • Tỷ lệ đồng thuận nhị phân (Binary Grade>=2): {report['binary_matches']}/{report['shared_count']} ({report['binary_agreement_rate']}%)")
    print(f"  • Quadratic Weighted Cohen's Kappa (κ):        {report['quadratic_weighted_kappa']:.4f}")
    print(f"  • Linear Weighted Cohen's Kappa:              {report['linear_weighted_kappa']:.4f}")
    print(f"  • Đánh giá mức độ đồng thuận:                 {report['kappa_interpretation']}")

    dis = report["disagreements"]
    print(f"\n⚡ Số cặp có bất đồng quan điểm (|g1 - g2| > 0): {len(dis)} cặp")
    if dis:
        print(f"{'Pair ID':<16} | {'Điểm [1]':<8} | {'Điểm [2]':<8} | {'Độ lệch':<8} | Ghi chú")
        print("-" * 75)
        for d in dis[:15]:
            note_str = f"1: {d['note_1']}" if d['note_1'] else ""
            if d['note_2']:
                note_str += f" | 2: {d['note_2']}"
            print(f"{d['pair_id']:<16} | {d['grade_1']:<8} | {d['grade_2']:<8} | {d['diff']:<8} | {note_str[:35]}")
        if len(dis) > 15:
            print(f"... và {len(dis) - 15} cặp bất đồng khác. Dùng '--adjudicate' để giải quyết.")
    print("=" * 80 + "\n")


# ══════════════════════════════════════════════════════════════════════════════
# 5. MẪU KIỂM CHỨNG PHÂN TẦNG TOÀN DIỆN (ENHANCED STRATIFIED SAMPLING)
def generate_representative_random_sample(
    gt_data: Dict[str, Any],
    sample_size: int = 100,
    seed: int = SHUFFLE_SEED,
) -> List[Dict[str, Any]]:
    """Tạo mẫu ngẫu nhiên phân tầng đại diện (Representative Random Stratified Sample)
    để ước lượng không thiên lệch chất lượng nhãn LLM trên toàn bộ tập dữ liệu.
    Mỗi nhóm truy vấn được phân bổ chính xác sample_size // 5 cặp một cách ngẫu nhiên đồng đều.
    """
    rng = random.Random(seed)
    groups = ["Lexical", "Semantic", "Abstract", "Typo_Slang", "Short_Long"]
    cands_by_group: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for q in gt_data.get("queries", []):
        qid = q["query_id"]
        grp = q.get("query_group") or q.get("query_type", "General")
        q_text = q["query"]

        for c in q.get("candidates", []):
            item = {
                "pair_id": f"{qid}_{c['movie_id']}",
                "query_id": qid,
                "query_type": grp,
                "query": q_text,
                "movie_id": c["movie_id"],
                "title_vi": c.get("title_vi"),
                "title_en": c.get("title_en"),
                "genres": c.get("genres"),
                "release_date": c.get("release_date"),
                "vote_average": c.get("vote_average"),
                "overview_snippet": c.get("overview_snippet"),
                "overview_full": c.get("overview_full"),
                "is_source_movie": bool(c.get("is_source_movie", False)),
                "llm_grade": c.get("llm_grade"),
                "llm_verdict": c.get("llm_verdict"),
                "llm_reasoning": c.get("llm_reasoning"),
                "judge_model": c.get("judge_model"),
                "relevance_grade": c.get("relevance_grade"),
                "verified_by_human": c.get("verified_by_human", False),
                "sampling_strategy": "representative_random_stratified",
            }
            cands_by_group[grp].append(item)

    per_group = max(1, sample_size // len(groups))
    sampled: List[Dict[str, Any]] = []

    for grp in groups:
        pool = list(cands_by_group[grp])
        rng.shuffle(pool)
        sampled.extend(pool[:per_group])

    rng.shuffle(sampled)
    return sampled[:sample_size]


def generate_stratified_verification_sample(
    gt_data: Dict[str, Any],
    sample_size: int = 50,
    seed: int = SHUFFLE_SEED,
) -> List[Dict[str, Any]]:
    """Tạo mẫu kiểm chứng phân tầng nâng cao:

    Đảm bảo đầy đủ:
    1. Bao phủ đồng đều 5 nhóm truy vấn (Lexical, Semantic, Abstract, Typo_Slang, Short_Long).
    2. Nếu sample_size == 100: Đảm bảo bao phủ 100% 100 queries (mỗi query 1 cặp).
    3. Phân tầng bao phủ:
       - Phim nguồn bị LLM đánh giá thấp (underscored_source: Grade < 2, đặc biệt Q048, Q051, Q054, Q055, Q076).
       - Trường hợp thiếu bằng chứng (insufficient_evidence: Grade None).
       - Nhãn phân cực cao (Grade 3) & vừa phải (Grade 2).
       - Nhãn liên quan yếu / cận biên (Grade 1).
       - Nhãn không liên quan (Grade 0) để kiểm tra False Negatives.
    """
    rng = random.Random(seed)
    groups = ["Lexical", "Semantic", "Abstract", "Typo_Slang", "Short_Long"]

    # Phân loại ứng viên theo (query_group, stratum_category)
    items_by_stratum: Dict[str, Dict[str, List[Dict[str, Any]]]] = {
        g: {
            "underscored_source": [],
            "insufficient_evidence": [],
            "high_relevance": [],
            "moderate_relevance": [],
            "ambiguous": [],
            "low_relevance": [],
        }
        for g in groups
    }

    # Bảng tra cứu query_id -> candidates
    cands_by_query: Dict[str, List[Dict[str, Any]]] = defaultdict(list)

    for q in gt_data.get("queries", []):
        qid = q["query_id"]
        grp = q.get("query_group") or q.get("query_type", "General")
        q_text = q["query"]

        for c in q.get("candidates", []):
            llm_g = c.get("llm_grade")
            llm_v = c.get("llm_verdict")
            is_src = bool(c.get("is_source_movie", False))

            # Xác định Stratum Category
            if is_src and (llm_g is None or llm_g < 2):
                cat = "underscored_source"
            elif llm_v == "insufficient_evidence" or llm_g is None:
                cat = "insufficient_evidence"
            elif llm_g == 3:
                cat = "high_relevance"
            elif llm_g == 2:
                cat = "moderate_relevance"
            elif llm_g == 1:
                cat = "ambiguous"
            else:
                cat = "low_relevance"

            item = {
                "pair_id": f"{qid}_{c['movie_id']}",
                "query_id": qid,
                "query_type": grp,
                "query": q_text,
                "movie_id": c["movie_id"],
                "title_vi": c.get("title_vi"),
                "title_en": c.get("title_en"),
                "genres": c.get("genres"),
                "release_date": c.get("release_date"),
                "vote_average": c.get("vote_average"),
                "overview_snippet": c.get("overview_snippet"),
                "overview_full": c.get("overview_full"),
                "is_source_movie": is_src,
                "llm_grade": llm_g,
                "llm_verdict": llm_v,
                "llm_reasoning": c.get("llm_reasoning"),
                "judge_model": c.get("judge_model"),
                "relevance_grade": c.get("relevance_grade"),
                "verified_by_human": c.get("verified_by_human", False),
                "stratum_category": cat,
                "is_special_case": qid in UNDER_SCORED_SOURCE_QUERIES,
            }
            if grp in items_by_stratum:
                items_by_stratum[grp][cat].append(item)
            cands_by_query[qid].append(item)

    sampled: List[Dict[str, Any]] = []
    seen_pair_ids = set()

    # TRƯỜNG HỢP sample_size >= 100: Đảm bảo 100% 100 queries đều có ít nhất 1 ứng viên
    if sample_size >= 100 and len(cands_by_query) == 100:
        priority_order = [
            "underscored_source",
            "insufficient_evidence",
            "high_relevance",
            "moderate_relevance",
            "ambiguous",
            "low_relevance",
        ]
        # Bước A: Chọn chính xác 1 ứng viên đại diện ưu tiên ca khó từ mỗi query trong 100 queries
        for qid in sorted(cands_by_query.keys()):
            query_cands = cands_by_query[qid]
            chosen = None
            for p_cat in priority_order:
                candidates_in_cat = [c for c in query_cands if c["stratum_category"] == p_cat]
                if candidates_in_cat:
                    sub_rng = random.Random(f"{seed}_{qid}")
                    chosen = sub_rng.choice(candidates_in_cat)
                    break
            if not chosen:
                chosen = query_cands[0]

            sampled.append(chosen)
            seen_pair_ids.add(chosen["pair_id"])

        # Bước B: Nếu sample_size > 100, chọn thêm các ứng viên còn lại ưu tiên độ khó và cân bằng 5 nhóm
        remaining_slots = sample_size - len(sampled)
        if remaining_slots > 0:
            extra_pool: List[Dict[str, Any]] = []
            for grp in groups:
                for cat_name in priority_order:
                    for it in items_by_stratum[grp][cat_name]:
                        if it["pair_id"] not in seen_pair_ids:
                            extra_pool.append(it)
            rng.shuffle(extra_pool)
            for it in extra_pool[:remaining_slots]:
                sampled.append(it)
                seen_pair_ids.add(it["pair_id"])

        rng.shuffle(sampled)
        return sampled[:sample_size]

    # TRƯỜNG HỢP sample_size < 100 (ví dụ 50 hoặc tùy chọn)
    # BƯỚC 1: Đưa TẤT CẢ các trường hợp đặc biệt (underscored_source ở Q048, Q051, Q054, Q055, Q076) vào trước
    for grp in groups:
        for it in items_by_stratum[grp]["underscored_source"]:
            if it["is_special_case"] and it["pair_id"] not in seen_pair_ids:
                sampled.append(it)
                seen_pair_ids.add(it["pair_id"])

    # BƯỚC 2: Phân bổ số mẫu còn lại đều cho 5 nhóm
    per_group_target = max(1, sample_size // len(groups))

    for grp in groups:
        cat_pools = items_by_stratum[grp]
        current_in_group = [it for it in sampled if it["query_type"] == grp]
        needed_for_group = per_group_target - len(current_in_group)

        if needed_for_group <= 0:
            continue

        # Phân tầng mục tiêu trong nhóm
        sub_allocations = [
            ("insufficient_evidence", max(1, round(needed_for_group * 0.15))),
            ("high_relevance", max(1, round(needed_for_group * 0.25))),
            ("moderate_relevance", max(1, round(needed_for_group * 0.25))),
            ("ambiguous", max(1, round(needed_for_group * 0.20))),
            ("low_relevance", max(1, round(needed_for_group * 0.15))),
        ]

        for cat_name, tgt in sub_allocations:
            avail = [it for it in cat_pools[cat_name] if it["pair_id"] not in seen_pair_ids]
            rng.shuffle(avail)
            for it in avail[:tgt]:
                sampled.append(it)
                seen_pair_ids.add(it["pair_id"])

        # Nếu nhóm này chưa đủ per_group_target, lấy thêm từ bất kỳ category nào chưa chọn
        current_group_count = sum(1 for it in sampled if it["query_type"] == grp)
        if current_group_count < per_group_target:
            rem = []
            for c_name in cat_pools:
                for it in cat_pools[c_name]:
                    if it["pair_id"] not in seen_pair_ids:
                        rem.append(it)
            rng.shuffle(rem)
            needed = per_group_target - current_group_count
            for it in rem[:needed]:
                sampled.append(it)
                seen_pair_ids.add(it["pair_id"])

    # Bù thêm nếu tổng số mẫu chưa đạt sample_size
    if len(sampled) < sample_size:
        all_left = []
        for grp in groups:
            for c_name in items_by_stratum[grp]:
                for it in items_by_stratum[grp][c_name]:
                    if it["pair_id"] not in seen_pair_ids:
                        all_left.append(it)
        rng.shuffle(all_left)
        needed = sample_size - len(sampled)
        for it in all_left[:needed]:
            sampled.append(it)
            seen_pair_ids.add(it["pair_id"])

    rng.shuffle(sampled)
    return sampled[:sample_size]


# ══════════════════════════════════════════════════════════════════════════════
# 6. BÁO CÁO THỐNG KÊ TIẾN ĐỘ GROUND TRUTH V2 (100% OFFLINE)
# ══════════════════════════════════════════════════════════════════════════════


def get_annotation_statistics(gt_data: Dict[str, Any]) -> Dict[str, Any]:
    """Tính toán thống kê chi tiết nhãn đã xác minh bởi con người và LLM gợi ý."""
    total_candidates = 0
    verified_count = 0
    unassessed_count = 0
    llm_judged_count = 0
    source_movies_count = 0
    source_movies_verified = 0

    grade_distribution = Counter()
    llm_grade_distribution = Counter()
    group_stats = defaultdict(lambda: {"total": 0, "verified": 0, "llm_judged": 0, "unassessed": 0})
    annotator_counts = Counter()

    llm_human_comparisons = 0
    llm_human_exact_matches = 0
    llm_human_binary_matches = 0

    for q in gt_data.get("queries", []):
        grp = q.get("query_group") or q.get("query_type", "Unknown")
        for c in q.get("candidates", []):
            total_candidates += 1
            group_stats[grp]["total"] += 1

            if c.get("is_source_movie"):
                source_movies_count += 1

            is_verified = bool(c.get("verified_by_human", False))
            grade = c.get("relevance_grade")
            llm_g = c.get("llm_grade")

            if llm_g is not None or c.get("status") == "llm_judged":
                llm_judged_count += 1
                group_stats[grp]["llm_judged"] += 1
                if llm_g is not None:
                    llm_grade_distribution[str(llm_g)] += 1

            if is_verified:
                verified_count += 1
                group_stats[grp]["verified"] += 1
                grade_distribution[str(grade)] += 1
                if c.get("is_source_movie"):
                    source_movies_verified += 1
                ann = c.get("annotated_by") or "Anonymous"
                annotator_counts[ann] += 1

                if llm_g is not None:
                    llm_human_comparisons += 1
                    if grade == llm_g:
                        llm_human_exact_matches += 1
                    if (grade >= 2) == (llm_g >= 2):
                        llm_human_binary_matches += 1
            else:
                unassessed_count += 1
                group_stats[grp]["unassessed"] += 1

    agreement_rate = (
        round((llm_human_exact_matches / llm_human_comparisons * 100), 2)
        if llm_human_comparisons > 0
        else 0.0
    )
    binary_agreement_rate = (
        round((llm_human_binary_matches / llm_human_comparisons * 100), 2)
        if llm_human_comparisons > 0
        else 0.0
    )

    return {
        "total_queries": len(gt_data.get("queries", [])),
        "total_candidates": total_candidates,
        "verified_by_human_count": verified_count,
        "unassessed_count": unassessed_count,
        "llm_judged_count": llm_judged_count,
        "source_movies_count": source_movies_count,
        "source_movies_verified": source_movies_verified,
        "grade_distribution": dict(grade_distribution),
        "llm_grade_distribution": dict(llm_grade_distribution),
        "group_stats": dict(group_stats),
        "annotator_counts": dict(annotator_counts),
        "consensus": {
            "llm_human_comparisons": llm_human_comparisons,
            "llm_human_exact_matches": llm_human_exact_matches,
            "exact_agreement_rate": agreement_rate,
            "llm_human_binary_matches": llm_human_binary_matches,
            "binary_agreement_rate": binary_agreement_rate,
        },
    }


def print_annotation_report(gt_data: Dict[str, Any]) -> None:
    """In báo cáo thống kê đẹp mắt."""
    stats = get_annotation_statistics(gt_data)
    total_cands = stats["total_candidates"]
    ver_cands = stats["verified_by_human_count"]
    pct_ver = round(ver_cands / max(1, total_cands) * 100, 1)

    print("\n" + "=" * 75)
    print("📋 BÁO CÁO TIẾN ĐỘ THẨM ĐỊNH GROUND TRUTH V2 (BƯỚC 3)")
    print("=" * 75)
    print(f"  • Tổng số truy vấn:                     {stats['total_queries']} queries (5 nhóm x 20)")
    print(f"  • Tổng số cặp ứng viên (Candidates):     {total_cands:,} cặp")
    print(f"  • Số nhãn ĐÃ ĐƯỢC CON NGƯỜI XÁC MINH:    {ver_cands:,} / {total_cands:,} ({pct_ver}%)")
    print(f"  • Số nhãn đã được LLM-as-a-Judge gợi ý: {stats['llm_judged_count']:,}")
    print(f"  • Số ứng viên CHƯA DUYỆT BỞI CON NGƯỜI: {stats['unassessed_count']:,}")
    print(f"  • Phim nguồn tham chiếu đã xác minh:     {stats['source_movies_verified']} / {stats['source_movies_count']}")

    print("\n📊 Phân bổ ứng viên theo 5 nhóm truy vấn:")
    print("  " + f"{'Nhóm':<15} | {'Tổng ứng viên':<14} | {'Đã xác minh':<12} | {'LLM gợi ý':<12} | {'Chưa duyệt':<10}")
    print("  " + "-" * 71)
    for grp, g_info in stats["group_stats"].items():
        print(
            "  "
            + f"{grp:<15} | {g_info['total']:<14} | {g_info['verified']:<12} | {g_info['llm_judged']:<12} | {g_info['unassessed']:<10}"
        )

    print("\n🎯 Phân bổ điểm số của các nhãn đã xác minh bởi con người (Grade 0-3):")
    if stats["grade_distribution"]:
        for g in ("3", "2", "1", "0"):
            cnt = stats["grade_distribution"].get(g, 0)
            print(f"  • Human Grade {g}: {cnt} cặp")
    else:
        print("  (Chưa có nhãn nào được thẩm định thủ công bởi con người)")

    print("\n🤖 Phân bổ điểm số gợi ý từ LLM-as-a-Judge:")
    for g in ("3", "2", "1", "0"):
        cnt = stats["llm_grade_distribution"].get(g, 0)
        print(f"  • LLM Grade {g}: {cnt} cặp")
    unscored_llm = stats["llm_judged_count"] - sum(stats["llm_grade_distribution"].values())
    if unscored_llm > 0:
        print(f"  • LLM Thiếu bằng chứng (Grade None): {unscored_llm} cặp")

    cons = stats["consensus"]
    if cons["llm_human_comparisons"] > 0:
        print("\n🤝 MỨC ĐỘ ĐỒNG THUẬN LLM – HUMAN:")
        print(f"  • Số cặp được cả LLM và Con người thẩm định: {cons['llm_human_comparisons']} cặp")
        print(f"  • Mức đồng thuận chính xác (Exact Grade):     {cons['llm_human_exact_matches']}/{cons['llm_human_comparisons']} ({cons['exact_agreement_rate']}%)")
        print(f"  • Mức đồng thuận nhị phân (Binary Grade>=2):  {cons['llm_human_binary_matches']}/{cons['llm_human_comparisons']} ({cons['binary_agreement_rate']}%)")

    print("\n🔒 Nguyên tắc Ground Truth tuân thủ nghiêm ngặt:")
    print("  ✓ Không gán sẵn grade 3 cho phim nguồn; toàn bộ để null cho đến khi con người thẩm định.")
    print("  ✓ Đánh giá mù (Double-Blind): Ẩn hoàn toàn tên mô hình, thứ hạng rank, điểm gợi ý và cờ phim nguồn.")
    print("  ✓ Ẩn điểm số & nhận định của LLM trước khi người đánh giá nhập điểm để tránh thiên lệch mỏ neo (Anchoring).")
    print("  ✓ Xáo trộn ứng viên có thể tái lập (Reproducible Shuffling) với seed cố định.")
    print("  ✓ Phân biệt rõ null (chưa đánh giá) và grade 0 (con người xác nhận không liên quan).")
    print("  ✓ Đánh giá nhị phân sử dụng Grade >= 2; NDCG sử dụng điểm 0, 1, 2, 3.")
    print("=" * 75 + "\n")


# ══════════════════════════════════════════════════════════════════════════════
# 7. GIAO DIỆN CLI CHẤM ĐỘC LẬP (INDEPENDENT DOUBLE-BLIND ANNOTATION)
# ══════════════════════════════════════════════════════════════════════════════


def run_interactive_annotation(
    query_id: Optional[str] = None,
    group: Optional[str] = None,
    unassessed_only: bool = True,
    annotator: str = "52300063",
    limit: int = 50,
    sample_file: str = "",
    mode: str = "blind",
    apply_to_gt: bool = False,
) -> None:
    """Giao diện dòng lệnh cho chuyên gia chấm nhãn, phân định rõ Blind Mode và Assisted Mode."""
    gt_data = load_ground_truth_v2()

    candidates_to_review: List[Tuple[Dict[str, Any], Dict[str, Any]]] = []

    # 1. Nạp từ sample_file nếu có
    if sample_file and Path(sample_file).exists():
        with open(sample_file, "r", encoding="utf-8") as f:
            s_data = json.load(f)
            sample_list = s_data.get("sample", s_data) if isinstance(s_data, dict) else s_data
        print(f"📦 Đã nạp {len(sample_list)} cặp kiểm chứng từ file: {sample_file}")

        cand_lookup = {}
        for q in gt_data.get("queries", []):
            for c in q.get("candidates", []):
                cand_lookup[f"{q['query_id']}_{c['movie_id']}"] = (q, c)

        for s in sample_list:
            pid = s.get("pair_id") or f"{s['query_id']}_{s['movie_id']}"
            if pid in cand_lookup:
                candidates_to_review.append(cand_lookup[pid])
    else:
        # Nạp theo query_id / group từ ground truth
        for q in gt_data.get("queries", []):
            if query_id and q["query_id"] != query_id:
                continue
            if group and (q.get("query_group") or q.get("query_type")) != group:
                continue

            cands = q.get("candidates", [])
            shuffled_cands = get_reproducible_shuffled_candidates(q["query_id"], cands, seed=SHUFFLE_SEED)
            for c in shuffled_cands:
                if unassessed_only and c.get("verified_by_human"):
                    continue
                candidates_to_review.append((q, c))

    # Nạp các nhãn cá nhân đã có của annotator này để không phải chấm lại
    my_records = load_annotator_records(annotator).get("annotations", {})

    print("\n" + "=" * 80)
    print(f"🎬 BẮT ĐẦU PHIÊN CHẤM – CHUYÊN GIA: [{annotator}]")
    print(f"• Tổng số cặp trong danh sách: {len(candidates_to_review)} cặp")
    print(f"• Số cặp bạn đã từng chấm:   {len(my_records)} cặp (sẽ tự động bỏ qua nếu đã có)")

    if mode == "blind":
        print("🔒 [CHẾ ĐỘ ĐÁNH GIÁ MÙ ĐỘC LẬP - DOUBLE-BLIND]:")
        print("   - Ẩn hoàn toàn tên mô hình, thứ hạng rank, điểm số và cờ phim nguồn tham chiếu.")
        print("   - ẨN ĐIỂM SỐ VÀ GIẢI THÍCH CỦA GEMINI để loại bỏ hoàn toàn thiên lệch mỏ neo (Anchoring Bias).")
        print("   - Tuyệt đối không cho phép xem trước gợi ý LLM trước khi lưu điểm độc lập.")
        print("   - Thao tác: 0, 1, 2, 3 | 's'=Bỏ qua | 'q'=Lưu & Thoát")
    else:
        print("🤖 [CHẾ ĐỘ THẨM ĐỊNH ĐỐI SOÁT - ASSISTED REVIEW]:")
        print("   - Hiển thị nhận định và giải thích của Gemini LLM để đối soát chất lượng nhãn.")
        print("   - Phù hợp cho việc kiểm toán sai số (error analysis) và thẩm tra ranh giới quyết định.")
        print("   - Thao tác: 0, 1, 2, 3 | 's'=Bỏ qua | 'q'=Lưu & Thoát")
    print("=" * 80 + "\n")

    reviewed_in_session = 0
    for q_info, cand in candidates_to_review:
        if reviewed_in_session >= limit:
            print(f"\n🛑 Đã đạt giới hạn {limit} ứng viên trong phiên làm việc hôm nay. Tạm dừng.")
            break

        pair_id = f"{q_info['query_id']}_{cand['movie_id']}"
        if pair_id in my_records:
            continue

        print("-" * 80)
        qgrp = q_info.get("query_group") or q_info.get("query_type")
        print(f"🔍 TRUY VẤN [{q_info['query_id']}] ({qgrp}): \"{q_info['query']}\"")

        # Trong Blind Mode: TUYỆT ĐỐI KHÔNG HIỂN THỊ source_evidence hoặc matched_concepts để tránh lộ thông tin phim nguồn!
        if mode == "assisted":
            if q_info.get("source_evidence") and q_info["source_evidence"].get("matched_concepts"):
                print(f"   Ý định cốt lõi: {q_info['source_evidence'].get('matched_concepts')}")

        print(f"\n🎬 PHIM ĐÁNH GIÁ (ID: {cand['movie_id']})")
        print(f"   Tiêu đề VI:  {cand.get('title_vi')} | EN: {cand.get('title_en')}")
        print(f"   Thể loại:    {cand.get('genres')}")
        print(f"   Điểm TB:     {cand.get('vote_average')}/10 | Năm: {cand.get('release_date')}")
        print(f"   Tóm tắt:     {cand.get('overview_snippet') or cand.get('overview_full')}")

        llm_g = cand.get("llm_grade")
        llm_v = cand.get("llm_verdict")
        llm_r = cand.get("llm_reasoning", "")

        # Trong Assisted Mode: Hiển thị nhận định Gemini
        if mode == "assisted":
            print(f"\n   🤖 [Tham chiếu Gemini]: Grade {llm_g} ({llm_v})")
            if llm_r:
                print(f"      Lý do LLM: {llm_r}")

        while True:
            prompt_str = "\n👉 [BLIND] Nhập điểm độc lập (0, 1, 2, 3 | 's'=Bỏ qua | 'q'=Lưu): " if mode == "blind" else "\n👉 [ASSISTED] Nhập điểm thẩm định (0, 1, 2, 3 | 's'=Bỏ qua | 'q'=Lưu): "
            try:
                choice = input(prompt_str).strip().lower()
            except (KeyboardInterrupt, EOFError):
                choice = "q"

            if choice in ("q", "quit", "exit"):
                print(f"\n💾 Đã lưu tiến độ của [{annotator}].")
                return

            if choice in ("s", "skip", ""):
                print("   ⏩ Đã bỏ qua cặp này.")
                break

            if choice in ("v", "view", "peek"):
                if mode == "blind":
                    print("   ⚠️ CHẾ ĐỘ CHẤM MÙ ĐỘC LẬP: Không cho phép xem trước gợi ý LLM để tránh thiên lệch mỏ neo (Anchoring Bias). Hãy nhập điểm 0-3 dựa trên phán đoán độc lập của bạn!")
                    continue
                else:
                    print(f"\n   🤖 [Gợi ý Gemini]: Grade {llm_g} ({llm_v})")
                    if llm_r:
                        print(f"      Lý do: {llm_r}")
                    continue

            if choice in ("0", "1", "2", "3"):
                grade = int(choice)
                notes = input("   Ghi chú ngắn (tùy chọn, Enter để bỏ qua): ").strip()

                # Lưu vào file cá nhân của annotator
                save_annotator_grade(
                    annotator_id=annotator,
                    query_id=q_info["query_id"],
                    movie_id=cand["movie_id"],
                    grade=grade,
                    notes=notes,
                )

                # Nếu có cờ apply_to_gt, áp dụng luôn vào file chung
                if apply_to_gt:
                    annotate_candidate(
                        gt_data=gt_data,
                        query_id=q_info["query_id"],
                        movie_id=cand["movie_id"],
                        relevance_grade=grade,
                        annotator=annotator,
                        notes=notes,
                        save_to_file=True,
                    )

                reviewed_in_session += 1
                print(f"   ✅ Đã ghi nhận Grade {grade} cho [{annotator}]. (Phiên này: {reviewed_in_session})\n")
                break
            else:
                valid_opts = "0, 1, 2, 3, 's', 'q'" if mode == "blind" else "0, 1, 2, 3, 'v', 's', 'q'"
                print(f"   ❌ Lựa chọn không hợp lệ! Vui lòng nhập {valid_opts}.")

    print(f"\n🏁 Hoàn thành phiên chấm cho [{annotator}]. Tổng cộng phiên này đã chấm {reviewed_in_session} cặp.")


# ══════════════════════════════════════════════════════════════════════════════
# 8. GIẢI QUYẾT BẤT ĐỒNG QUAN ĐIỂM (ADJUDICATION FLOW)
# ══════════════════════════════════════════════════════════════════════════════


def run_adjudication_flow(
    annotator1_id: str = "52300063", annotator2_id: str = "52300070"
) -> None:
    """Quy trình phân xử bất đồng giữa 2 thành viên để chốt Ground Truth chính thức."""
    agreement_report = compute_inter_annotator_agreement(annotator1_id, annotator2_id)
    disagreements = agreement_report.get("disagreements", [])

    if not disagreements:
        print("\n🎉 Tuyệt vời! Không có bất kỳ cặp nào bị bất đồng quan điểm giữa hai thành viên.")
        return

    print("\n" + "=" * 80)
    print(f"⚖️ BẮT ĐẦU QUY TRÌNH PHÂN XỬ BẤT ĐỒNG ({len(disagreements)} cặp cần thống nhất)")
    print(f"   Thành viên 1: [{annotator1_id}]  vs  Thành viên 2: [{annotator2_id}]")
    print("=" * 80)

    gt_data = load_ground_truth_v2()
    lookup = {}
    for q in gt_data.get("queries", []):
        for c in q.get("candidates", []):
            lookup[f"{q['query_id']}_{c['movie_id']}"] = (q, c)

    adjudicated_count = 0
    for dis in disagreements:
        pid = dis["pair_id"]
        if pid not in lookup:
            continue
        q_info, cand = lookup[pid]

        print("\n" + "-" * 80)
        print(f"📌 CẶP [{pid}] | Query: \"{q_info['query']}\"")
        print(f"🎬 Phim: \"{cand.get('title_vi')} / {cand.get('title_en')}\" (Thể loại: {cand.get('genres')})")
        print(f"   Tóm tắt: {cand.get('overview_snippet')}")
        print("\n📊 Ý KIẾN HAI BÊN:")
        print(f"   • [{annotator1_id}]: Grade {dis['grade_1']} | Ghi chú: \"{dis['note_1']}\"")
        print(f"   • [{annotator2_id}]: Grade {dis['grade_2']} | Ghi chú: \"{dis['note_2']}\"")
        print(f"   • [Gemini LLM]:  Grade {cand.get('llm_grade')} ({cand.get('llm_verdict')})")
        if cand.get("llm_reasoning"):
            print(f"     Lý do LLM:   {cand.get('llm_reasoning')}")

        while True:
            try:
                choice = input(f"\n👉 Chốt điểm ĐỒNG THUẬN cuối cùng (0, 1, 2, 3 | 's'=Bỏ qua | 'q'=Lưu & Thoát): ").strip().lower()
            except (KeyboardInterrupt, EOFError):
                choice = "q"

            if choice in ("q", "quit", "exit"):
                save_ground_truth_v2(gt_data)
                sync_annotation_queue(gt_data)
                print(f"\n💾 Đã lưu {adjudicated_count} nhãn đồng thuận chính thức vào Ground Truth V2.")
                return

            if choice in ("s", "skip", ""):
                print("   ⏩ Bỏ qua cặp này.")
                break

            if choice in ("0", "1", "2", "3"):
                c_grade = int(choice)
                annotate_candidate(
                    gt_data=gt_data,
                    query_id=q_info["query_id"],
                    movie_id=cand["movie_id"],
                    relevance_grade=c_grade,
                    annotator=f"{annotator1_id}+{annotator2_id} (Consensus)",
                    notes=f"Đồng thuận sau phân xử (g1={dis['grade_1']}, g2={dis['grade_2']})",
                    save_to_file=True,
                )
                adjudicated_count += 1
                print(f"   ✅ ĐÃ CHỐT NHÃN ĐỒNG THUẬN: Grade {c_grade}!")
                break
            else:
                print("   ❌ Lựa chọn không hợp lệ! Vui lòng nhập 0, 1, 2, 3 hoặc 's', 'q'.")

    save_ground_truth_v2(gt_data)
    sync_annotation_queue(gt_data)
    print(f"\n🏁 Đã hoàn tất phân xử! Đã cập nhật {adjudicated_count} nhãn đồng thuận vào Ground Truth V2.")


# ══════════════════════════════════════════════════════════════════════════════
# 9. ENTRYPOINT CLI
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Công cụ hỗ trợ Human Annotation Ground Truth V2")
    parser.add_argument("--stats", action="store_true", help="Hiển thị báo cáo thống kê nhãn đã/chưa xác minh")
    parser.add_argument("--interactive", action="store_true", help="Chạy giao diện dòng lệnh tương tác đánh giá nhãn")
    parser.add_argument("--mode", type=str, choices=["blind", "assisted"], default="blind", help="Chế độ đánh giá: 'blind' (chấm mù độc lập tuyệt đối) hoặc 'assisted' (đối soát có gợi ý LLM)")
    parser.add_argument("--assisted", action="store_true", help="Kích hoạt chế độ assisted review (tương đương --mode assisted)")
    parser.add_argument("--stratified-sample", action="store_true", help="Tạo mẫu kiểm chứng phân tầng theo 5 nhóm và grade 0-3")
    parser.add_argument("--sample-size", type=int, default=50, help="Kích thước mẫu kiểm chứng phân tầng (mặc định: 50)")
    parser.add_argument("--export-sample", type=str, default="", help="Đường dẫn file JSON để xuất mẫu kiểm chứng")
    parser.add_argument("--sample-file", type=str, default="", help="Đường dẫn file mẫu kiểm chứng để chấm (vd: stratified_verification_sample_50.json)")
    parser.add_argument("--query_id", type=str, default=None, help="Lọc theo query_id cụ thể (vd: Q001)")
    parser.add_argument("--group", type=str, default=None, help="Lọc theo nhóm query (vd: Lexical, Abstract)")
    parser.add_argument("--all", action="store_true", help="Duyệt tất cả ứng viên thay vì chỉ unassessed")
    parser.add_argument("--annotator", type=str, default="52300063", help="ID thành viên đánh giá (vd: 52300063 hoặc 52300070)")
    parser.add_argument("--limit", type=int, default=50, help="Số lượng ứng viên tối đa duyệt trong một phiên")
    parser.add_argument("--no-blind", action="store_true", help="Tương đương --mode assisted (để tương thích ngược)")
    parser.add_argument("--apply-to-gt", action="store_true", help="Ghi nhận ngay vào ground_truth_v2.json khi chấm đơn lẻ")
    parser.add_argument("--inter-annotator-agreement", "--agreement", action="store_true", help="Tính mức độ đồng thuận & Weighted Cohen's Kappa giữa 2 thành viên")
    parser.add_argument("--random-sample", action="store_true", help="Tạo mẫu ngẫu nhiên phân tầng đại diện (representative random stratified) để ước lượng chất lượng nhãn chung")
    parser.add_argument("--annotator1", type=str, default="52300063", help="ID thành viên thứ nhất")
    parser.add_argument("--annotator2", type=str, default="52300070", help="ID thành viên thứ hai")
    parser.add_argument("--adjudicate", action="store_true", help="Quy trình phân xử bất đồng giữa hai thành viên")
    args = parser.parse_args()

    gt = load_ground_truth_v2()

    # Xác định evaluation mode
    active_mode = "assisted" if (args.assisted or args.no_blind or args.mode == "assisted") else "blind"

    if args.inter_annotator_agreement:
        report = compute_inter_annotator_agreement(args.annotator1, args.annotator2)
        print_inter_annotator_report(report)

    elif args.adjudicate:
        run_adjudication_flow(args.annotator1, args.annotator2)

    elif args.random_sample:
        sample = generate_representative_random_sample(gt, sample_size=args.sample_size)
        print("\n" + "=" * 80)
        print(f"📊 MẪU NGẪU NHIÊN PHÂN TẦNG ĐẠI DIỆN (N = {len(sample)} cặp)")
        print("• Phương pháp lấy mẫu: Representative Random Stratified Sampling")
        print("• Mục đích: Ước lượng không thiên lệch (unbiased estimation) chất lượng nhãn LLM trên toàn bộ tập dữ liệu.")
        print("• Đặc tính: Mẫu ngẫu nhiên đại diện (is_representative_random = True).")
        print("=" * 80)
        print(f"{'Nhóm':<12} | {'Query ID':<8} | {'Phim ID':<8} | {'LLM Grade':<10} | {'LLM Verdict':<15}")
        print("-" * 65)
        for s in sample[:25]:
            print(f"{s['query_type']:<12} | {s['query_id']:<8} | {s['movie_id']:<8} | {str(s.get('llm_grade')):<10} | {str(s.get('llm_verdict')):<15}")
        if len(sample) > 25:
            print(f"... và {len(sample) - 25} cặp khác.")
        if args.export_sample:
            out_p = Path(args.export_sample)
            out_p.parent.mkdir(parents=True, exist_ok=True)
            export_payload = {
                "metadata": {
                    "version": "2.0-representative-random-sample",
                    "sample_size": len(sample),
                    "sampling_method": "representative_random_stratified",
                    "is_representative_random": True,
                    "methodology_note": "Mẫu ngẫu nhiên phân tầng đại diện được lấy ngẫu nhiên đồng đều trong từng nhóm truy vấn nhằm ước lượng không thiên lệch độ chính xác và chất lượng của nhãn LLM trên toàn corpus.",
                    "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "group_distribution": dict(Counter(s["query_type"] for s in sample)),
                    "llm_grade_distribution": dict(Counter(str(s.get("llm_grade")) for s in sample)),
                },
                "sample": sample,
            }
            with open(out_p, "w", encoding="utf-8") as f:
                json.dump(export_payload, f, ensure_ascii=False, indent=2)
            print(f"\n💾 Đã xuất mẫu ngẫu nhiên đại diện tại: {out_p}")

    elif args.stratified_sample:
        sample = generate_stratified_verification_sample(gt, sample_size=args.sample_size)
        print("\n" + "=" * 80)
        print(f"📋 MẪU KIỂM CHỨNG PHÂN TẦNG ƯU TIÊN CA KHÓ (N = {len(sample)} cặp)")
        print("• Phương pháp lấy mẫu: Stratified Difficulty-Prioritized Sampling")
        print("• Ghi chú phương pháp luận: Mẫu này ưu tiên các trường hợp biên, phim nguồn điểm thấp và thiếu bằng chứng để stress-test mô hình; KHÔNG PHẢI là mẫu ngẫu nhiên đại diện (not a representative simple random sample).")
        print("=" * 80)
        print(f"{'Nhóm':<12} | {'Query ID':<8} | {'Phim ID':<8} | {'Phân Tầng':<22} | {'LLM Grade':<10} | {'LLM Verdict':<15}")
        print("-" * 88)
        for s in sample[:25]:
            cat_label = s.get('stratum_category', 'general')
            print(f"{s['query_type']:<12} | {s['query_id']:<8} | {s['movie_id']:<8} | {cat_label:<22} | {str(s.get('llm_grade')):<10} | {str(s.get('llm_verdict')):<15}")
        if len(sample) > 25:
            print(f"... và {len(sample) - 25} cặp khác.")
        if args.export_sample:
            out_p = Path(args.export_sample)
            out_p.parent.mkdir(parents=True, exist_ok=True)
            export_payload = {
                "metadata": {
                    "version": "2.0-stratified-verification-sample",
                    "sample_size": len(sample),
                    "sampling_method": "stratified_difficulty_prioritized",
                    "is_representative_random": False,
                    "methodology_note": "Mẫu kiểm chứng phân tầng ưu tiên ca khó (phim nguồn bị đánh giá thấp, trường hợp thiếu bằng chứng, ca cận biên/ambiguous), KHÔNG PHẢI là mẫu ngẫu nhiên đại diện. Mục tiêu thực nghiệm là kiểm tra stress-test chất lượng nhãn LLM tại các vùng ranh giới quyết định.",
                    "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "group_distribution": dict(Counter(s["query_type"] for s in sample)),
                    "stratum_distribution": dict(Counter(s.get("stratum_category", "general") for s in sample)),
                    "llm_grade_distribution": dict(Counter(str(s.get("llm_grade")) for s in sample)),
                },
                "sample": sample,
            }
            with open(out_p, "w", encoding="utf-8") as f:
                json.dump(export_payload, f, ensure_ascii=False, indent=2)
            print(f"\n💾 Đã xuất mẫu kiểm chứng tại: {out_p}")

    elif args.interactive:
        run_interactive_annotation(
            query_id=args.query_id,
            group=args.group,
            unassessed_only=not args.all,
            annotator=args.annotator,
            limit=args.limit,
            sample_file=args.sample_file,
            mode=active_mode,
            apply_to_gt=args.apply_to_gt,
        )

    else:
        print_annotation_report(gt)
