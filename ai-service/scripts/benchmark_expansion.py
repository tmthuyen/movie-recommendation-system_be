#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""benchmark_expansion.py.

======================
Cơ chế mở rộng Benchmark và Quản lý Qrels chuẩn học thuật (Bước 4 & Giai đoạn tiếp theo):
1. Xuất và phiên bản hóa Qrels (qrels_v2, qrels_v2.1) theo chuẩn TREC và JSON.
2. Tái sử dụng 100% nhãn đã có từ Ground Truth V2 (3.673 cặp) khi bổ sung mô hình mới hoặc Hybrid RRF.
3. Tự động phát hiện ứng viên mới chưa có nhãn (Unjudged candidates), xuất hàng đợi đánh giá mù (Double-Blind Annotation Queue).
4. Hợp nhất nhãn mới vào tập qrels mở rộng mà tuyệt đối không làm thay đổi hay ghi đè các nhãn cũ.
5. Tái tính toán số đo IR đồng bộ cho toàn bộ mô hình trên cùng một tập qrels chuẩn hóa.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime
import json
import math
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional, Set, Tuple

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent
PROJECT_ROOT = AI_SERVICE_DIR.parent
GT_DIR = AI_SERVICE_DIR / "experiments" / "ground_truth"
EVALUATION_DIR = AI_SERVICE_DIR / "experiments" / "evaluation"

GROUND_TRUTH_V2_FILE = GT_DIR / "ground_truth_v2.json"
BENCHMARK_QUERIES_FILE = GT_DIR / "benchmark_queries_v2.json"
QRELS_V2_JSON_FILE = GT_DIR / "qrels_v2.json"
QRELS_V2_TREC_FILE = GT_DIR / "qrels_v2.txt"

BINARY_RELEVANCE_THRESHOLD = 2


# ══════════════════════════════════════════════════════════════════════════════
# 1. HÀM TRÍCH XUẤT VÀ XUẤT QRELS PHIÊN BẢN CHUẨN
# ══════════════════════════════════════════════════════════════════════════════


def get_effective_candidate_grade(candidate: Dict[str, Any]) -> Optional[int]:
    """Xác định điểm liên quan thực tế của ứng viên:

    Ưu tiên 1: relevance_grade đã được con người xác minh (verified_by_human = True).
    Ưu tiên 2: llm_grade từ thẩm định LLM-as-a-Judge.
    Nếu là insufficient_evidence hoặc chưa đánh giá -> trả về None.

    Quy chuẩn kiểm tra Grade:
    - Bắt buộc là số nguyên (hoặc float có giá trị nguyên chính xác) thuộc {0, 1, 2, 3}.
    - Tuyệt đối không chấp nhận bool (True/False không được coi là 1/0).
    - Không chấp nhận NaN, Inf.
    - Không ép kiểu làm tròn float không nguyên (1.5 không bị chuyển thành 1).
    """
    if candidate.get("verified_by_human") and candidate.get("relevance_grade") is not None:
        g = candidate.get("relevance_grade")
    else:
        g = candidate.get("llm_grade")

    if g is None or isinstance(g, bool):
        return None

    if isinstance(g, float):
        if math.isnan(g) or math.isinf(g):
            return None
        if not g.is_integer():
            return None
        g = int(g)

    if isinstance(g, int) and g in (0, 1, 2, 3):
        return g

    return None


def export_canonical_qrels(
    gt_data: Optional[Dict[str, Any]] = None,
    out_json_path: Path = QRELS_V2_JSON_FILE,
    out_trec_path: Path = QRELS_V2_TREC_FILE,
    version: str = "2.0-canonical",
) -> Dict[str, Any]:
    """Xuất tập qrels chuẩn hóa dạng JSON và định dạng TREC chuẩn (qid 0 docid grade).
    
    Theo nguyên tắc IR chuẩn quốc tế (TREC):
    - File TREC CHỈ xuất các cặp đã được đánh giá thực tế (grade thuộc {0, 1, 2, 3}).
    - Các cặp thiếu bằng chứng (insufficient_evidence) hoặc chưa đánh giá (grade=null)
      được bảo lưu nguyên trạng trong file JSON với status tường minh, TUYỆT ĐỐI không gán ngầm grade 0
      trong file TREC.
    """
    if gt_data is None:
        if not GROUND_TRUTH_V2_FILE.exists():
            raise FileNotFoundError(f"Không tìm thấy file Ground Truth tại: {GROUND_TRUTH_V2_FILE}")
        with open(GROUND_TRUTH_V2_FILE, "r", encoding="utf-8") as f:
            gt_data = json.load(f)

    queries = gt_data.get("queries", [])
    qrels_dict: Dict[str, Dict[int, Dict[str, Any]]] = {}
    trec_lines: List[str] = []

    grade_counts = Counter()
    status_counts = Counter()
    total_pairs = 0

    for q in queries:
        qid = q["query_id"]
        qrels_dict[qid] = {}
        for c in q.get("candidates", []):
            mid = int(c["movie_id"])
            eff_grade = get_effective_candidate_grade(c)
            verdict = c.get("llm_verdict")

            if eff_grade is not None:
                status = "judged"
                grade_counts[eff_grade] += 1
            elif verdict == "insufficient_evidence" or c.get("status") == "insufficient_evidence":
                status = "insufficient_evidence"
            else:
                status = "unassessed"

            status_counts[status] += 1
            total_pairs += 1

            in_trec = (eff_grade is not None and eff_grade in (0, 1, 2, 3))

            qrels_dict[qid][mid] = {
                "movie_id": mid,
                "grade": eff_grade,
                "status": status,
                "verdict": verdict,
                "in_trec": in_trec,
                "verified_by_human": bool(c.get("verified_by_human", False)),
                "is_source_movie": bool(c.get("is_source_movie", False)),
            }

            # Định dạng TREC chuẩn: <query_id> 0 <movie_id> <relevance_grade>
            # CHỈ xuất các cặp có confirmed grade 0-3; loại bỏ các cặp thiếu bằng chứng / chưa đánh giá.
            if in_trec:
                trec_lines.append(f"{qid} 0 {mid} {eff_grade}")

    judged_in_trec_count = len(trec_lines)
    excluded_from_trec_count = total_pairs - judged_in_trec_count

    qrels_payload = {
        "metadata": {
            "version": version,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_queries": len(queries),
            "total_candidate_pairs": total_pairs,
            "judged_pairs_in_trec": judged_in_trec_count,
            "unjudged_or_insufficient_pairs_excluded_from_trec": excluded_from_trec_count,
            "status_breakdown": dict(status_counts),
            "grade_distribution": dict(grade_counts),
            "binary_relevance_threshold": BINARY_RELEVANCE_THRESHOLD,
            "standards_note": (
                "TREC standard qrels file strictly contains only judged pairs with confirmed grades in {0, 1, 2, 3}. "
                "Candidate pairs with insufficient evidence or unassessed status (grade=null) are excluded from the TREC file "
                "and preserved explicitly in JSON qrels to avoid confounding lack of evidence with irrelevance."
            ),
        },
        "qrels": {qid: {str(mid): info for mid, info in m_map.items()} for qid, m_map in qrels_dict.items()},
    }

    out_json_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_json_path, "w", encoding="utf-8") as f:
        json.dump(qrels_payload, f, ensure_ascii=False, indent=2)

    with open(out_trec_path, "w", encoding="utf-8") as f:
        f.write("\n".join(trec_lines) + "\n")

    return qrels_payload


# ══════════════════════════════════════════════════════════════════════════════
# 2. HÀM TÁI SỬ DỤNG NHÃN CŨ & XUẤT HÀNG ĐỢI GÁN NHÃN CHO MÔ HÌNH MỚI
# ══════════════════════════════════════════════════════════════════════════════


def find_unjudged_candidates_for_run(
    run_retrieval_results: Dict[str, List[int]],
    existing_gt_data: Dict[str, Any],
    movie_metadata_lookup: Optional[Dict[int, Dict[str, Any]]] = None,
    new_model_name: str = "Hybrid_BM25_E5Base_RRF",
    top_k: int = 10,
) -> Tuple[Dict[str, List[Dict[str, Any]]], Dict[str, Any]]:
    """Phát hiện và phân tách ứng viên cho một mô hình / phương pháp mới (e.g. Hybrid RRF):

    1. Tái sử dụng 100% nhãn cũ đối với các cặp đã có điểm trong Ground Truth (reused_judged).
    2. Phát hiện các cặp nằm trong pool nhưng thiếu bằng chứng (insufficient_evidence / unassessed)
       để đưa vào hàng đợi đánh giá bổ sung (needs_review_insufficient).
    3. Gom các cặp mới (new_unpooled) chưa từng xuất hiện trong pool để thẩm định mù.
    Tuyệt đối không tự động gán Grade 0 cho các cặp chưa được đánh giá.
    """
    existing_pairs: Dict[Tuple[str, int], Dict[str, Any]] = {}
    query_lookup: Dict[str, Dict[str, Any]] = {}

    for q in existing_gt_data.get("queries", []):
        qid = q["query_id"]
        query_lookup[qid] = q
        for c in q.get("candidates", []):
            existing_pairs[(qid, int(c["movie_id"]))] = c

    reused_judged_count = 0
    needs_review_insufficient_count = 0
    new_unpooled_count = 0
    unjudged_items = []
    seen_queue_keys: Set[str] = set()
    summary_by_status = Counter()

    for qid, retrieved_movie_ids in run_retrieval_results.items():
        q_obj = query_lookup.get(qid, {})
        q_text = q_obj.get("query", "")
        q_type = q_obj.get("query_type") or q_obj.get("query_group", "General")

        for rank, mid in enumerate(retrieved_movie_ids[:top_k], start=1):
            mid_int = int(mid)
            pair_key = (qid, mid_int)
            queue_id = f"{qid}_{mid_int}"

            if pair_key in existing_pairs:
                c_exist = existing_pairs[pair_key]
                eff_grade = get_effective_candidate_grade(c_exist)
                if eff_grade is not None:
                    summary_by_status["reused_judged"] += 1
                    reused_judged_count += 1
                else:
                    # Đã có trong pool nhưng chưa có nhãn chắc chắn (insufficient_evidence hoặc unassessed)
                    is_insufficient = (
                        c_exist.get("llm_verdict") == "insufficient_evidence"
                        or c_exist.get("status") == "insufficient_evidence"
                    )
                    status_name = "needs_review_insufficient" if is_insufficient else "needs_review_unassessed"
                    summary_by_status[status_name] += 1
                    needs_review_insufficient_count += 1

                    if queue_id not in seen_queue_keys:
                        seen_queue_keys.add(queue_id)
                        meta = movie_metadata_lookup.get(mid_int, {}) if movie_metadata_lookup else {}
                        unjudged_items.append({
                            "queue_id": queue_id,
                            "query_id": qid,
                            "query_type": q_type,
                            "query": q_text,
                            "movie_id": mid_int,
                            "queue_category": "needs_review_insufficient",
                            "existing_status": c_exist.get("status") or c_exist.get("llm_verdict", "insufficient_evidence"),
                            "tmdb_id": c_exist.get("tmdb_id") or meta.get("tmdb_id"),
                            "title_vi": c_exist.get("title_vi") or meta.get("title_vi") or meta.get("title") or "Unknown",
                            "title_en": c_exist.get("title_en") or meta.get("title") or "",
                            "genres": c_exist.get("genres") or meta.get("genres", ""),
                            "release_date": c_exist.get("release_date") or meta.get("release_date", ""),
                            "vote_average": c_exist.get("vote_average") or meta.get("vote_average", 0.0),
                            "overview_snippet": c_exist.get("overview_snippet") or meta.get("overview_snippet", meta.get("overview", "")[:120]),
                            "overview_full": c_exist.get("overview_full") or meta.get("overview", ""),
                            "proposed_by": [new_model_name],
                            "model_ranks": {new_model_name: rank},
                            "is_source_movie": (mid_int == q_obj.get("source_movie_id")),
                            "relevance_grade": None,
                            "verified_by_human": False,
                            "status": "needs_review",
                            "reason_for_queue": "Candidate exists in pool but has insufficient evidence or unassessed status",
                            "annotated_by": "",
                            "annotated_at": "",
                            "notes": "",
                        })
            else:
                summary_by_status["new_unpooled"] += 1
                new_unpooled_count += 1
                if queue_id not in seen_queue_keys:
                    seen_queue_keys.add(queue_id)
                    meta = movie_metadata_lookup.get(mid_int, {}) if movie_metadata_lookup else {}
                    unjudged_items.append({
                        "queue_id": queue_id,
                        "query_id": qid,
                        "query_type": q_type,
                        "query": q_text,
                        "movie_id": mid_int,
                        "queue_category": "new_unpooled",
                        "existing_status": None,
                        "tmdb_id": meta.get("tmdb_id"),
                        "title_vi": meta.get("title_vi") or meta.get("title") or "Unknown",
                        "title_en": meta.get("title") or "",
                        "genres": meta.get("genres", ""),
                        "release_date": meta.get("release_date", ""),
                        "vote_average": meta.get("vote_average", 0.0),
                        "overview_snippet": meta.get("overview_snippet", meta.get("overview", "")[:120]),
                        "overview_full": meta.get("overview", ""),
                        "proposed_by": [new_model_name],
                        "model_ranks": {new_model_name: rank},
                        "is_source_movie": (mid_int == q_obj.get("source_movie_id")),
                        "relevance_grade": None,
                        "verified_by_human": False,
                        "status": "unassessed",
                        "reason_for_queue": "New candidate outside existing pool proposed by model retrieval",
                        "annotated_by": "",
                        "annotated_at": "",
                        "notes": "",
                    })

    total_positions = sum(len(ids[:top_k]) for ids in run_retrieval_results.values())
    report = {
        "new_model_name": new_model_name,
        "evaluated_queries": len(run_retrieval_results),
        "total_retrieved_positions": total_positions,
        "reused_labels_count": reused_judged_count,
        "reused_judged_count": reused_judged_count,
        "needs_review_insufficient_count": needs_review_insufficient_count,
        "new_unpooled_count": new_unpooled_count,
        "new_unjudged_candidates_count": len(unjudged_items),
        "label_reuse_rate_pct": round((reused_judged_count / max(1, total_positions)) * 100, 2),
        "status_breakdown": dict(summary_by_status),
    }

    return {"unjudged_items": unjudged_items}, report


def export_annotation_expansion_queue(
    unjudged_items: List[Dict[str, Any]],
    out_queue_file: Path,
    version: str = "2.1-expansion-queue",
) -> None:
    """Xuất file hàng đợi gán nhãn mới, chuẩn bị cho LLM-as-a-Judge hoặc chuyên gia đánh giá mù."""
    category_counts = Counter(item.get("queue_category", "unspecified") for item in unjudged_items)
    payload = {
        "metadata": {
            "version": version,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_pending_items": len(unjudged_items),
            "category_breakdown": dict(category_counts),
            "blinded_evaluation": True,
            "instruction": "Đánh giá mức độ liên quan thang 0-3 theo rubric chuẩn. Tuyệt đối không tự động gán nhãn mặc định.",
        },
        "queue": unjudged_items,
    }
    out_queue_file.parent.mkdir(parents=True, exist_ok=True)
    with open(out_queue_file, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


# ══════════════════════════════════════════════════════════════════════════════
# 3. HỢP NHẤT NHÃN MỚI VÀO QRELS (BẢO TOÀN 100% NHÃN CŨ)
# ══════════════════════════════════════════════════════════════════════════════


def merge_expansion_labels_into_ground_truth(
    base_gt_data: Dict[str, Any],
    new_labeled_items: List[Dict[str, Any]],
    new_version_tag: str = "2.1-expanded",
    allow_override: bool = False,
    strict_conflict_error: bool = False,
) -> Dict[str, Any]:
    """Hợp nhất các nhãn mới vào bản sao của Ground Truth:

    - BẢO TỒN NGUYÊN VẸN toàn bộ 3.673 cặp nhãn cũ theo mặc định (allow_override=False).
    - Ngăn chặn ghi đè trái phép; báo cáo xung đột rõ ràng hoặc raise ValueError nếu strict_conflict_error=True.
    - Trường hợp Adjudication (thẩm định chuyên gia / sửa nhãn cũ): yêu cầu allow_override=True,
      bắt buộc ghi nhận audit trail (người sửa, lý do, thời gian, nhãn cũ).
    - Bắt buộc kiểm tra grade phải là số nguyên trong {0, 1, 2, 3}.
    - Bổ sung ứng viên mới vào danh sách candidates của query tương ứng.
    - Cập nhật metadata phiên bản qrels mới.
    """
    updated_gt = json.loads(json.dumps(base_gt_data))  # Deep copy độc lập
    queries_map = {q["query_id"]: q for q in updated_gt.get("queries", [])}

    added_count = 0
    initial_labeled_count = 0
    adjudicated_count = 0
    conflicts = []

    for item in new_labeled_items:
        qid = item["query_id"]
        mid = int(item["movie_id"])
        if qid not in queries_map:
            continue

        q_entry = queries_map[qid]
        cand_list = q_entry.get("candidates", [])
        existing_cand = next((c for c in cand_list if int(c["movie_id"]) == mid), None)

        # Xác định grade từ item
        cand_grade = item.get("relevance_grade")
        if cand_grade is None:
            cand_grade = item.get("llm_grade")

        # Kiểm tra tính hợp lệ của grade nếu có
        if cand_grade is not None:
            if isinstance(cand_grade, bool):
                raise ValueError(
                    f"Giá trị grade không hợp lệ ({cand_grade!r}) cho cặp ({qid}, {mid}). Không chấp nhận kiểu bool."
                )
            if isinstance(cand_grade, float):
                if math.isnan(cand_grade) or math.isinf(cand_grade):
                    raise ValueError(
                        f"Giá trị grade không hợp lệ ({cand_grade!r}) cho cặp ({qid}, {mid}). Không chấp nhận NaN hoặc Inf."
                    )
                if not cand_grade.is_integer():
                    raise ValueError(
                        f"Giá trị grade không hợp lệ ({cand_grade!r}) cho cặp ({qid}, {mid}). "
                        f"Grade bắt buộc phải là số nguyên (không chấp nhận 1.5)."
                    )
                cand_grade = int(cand_grade)
            if not isinstance(cand_grade, int) or cand_grade not in (0, 1, 2, 3):
                raise ValueError(
                    f"Giá trị grade không hợp lệ ({cand_grade!r}) cho cặp ({qid}, {mid}). "
                    f"Grade bắt buộc phải là số nguyên thuộc {{0, 1, 2, 3}}."
                )

        if existing_cand is not None:
            old_eff_grade = get_effective_candidate_grade(existing_cand)

            if old_eff_grade is None:
                # ── TRƯỜNG HỢP 1: GÁN NHÃN LẦN ĐẦU (INITIAL LABELING) ─────────
                # Cặp đã tồn tại trong pool nhưng chưa có Grade (insufficient_evidence / unassessed).
                # Cho phép gán nhãn lần đầu mà KHÔNG CẦN bật allow_override=True.
                if cand_grade is not None:
                    annotator = item.get("annotated_by") or "Domain Annotator"
                    assign_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    notes = item.get("adjudication_reason") or item.get("notes") or "Initial grade assignment for previously unjudged candidate"

                    audit_record = {
                        "action": "initial_grade_assignment",
                        "timestamp": assign_timestamp,
                        "previous_grade": None,
                        "previous_status": existing_cand.get("status") or existing_cand.get("llm_verdict", "insufficient_evidence"),
                        "new_grade": cand_grade,
                        "annotator": annotator,
                        "reason": notes,
                    }
                    if "audit_trail" not in existing_cand:
                        existing_cand["audit_trail"] = []
                    existing_cand["audit_trail"].append(audit_record)

                    is_human = bool(item.get("verified_by_human", False))
                    if is_human:
                        existing_cand["relevance_grade"] = cand_grade
                        existing_cand["verified_by_human"] = True
                        existing_cand["status"] = "verified"
                    else:
                        existing_cand["llm_grade"] = cand_grade
                        existing_cand["status"] = "llm_judged"
                        if item.get("llm_verdict"):
                            existing_cand["llm_verdict"] = item.get("llm_verdict")

                    existing_cand["annotated_by"] = annotator
                    existing_cand["annotated_at"] = assign_timestamp
                    if notes:
                        existing_cand["notes"] = notes
                    initial_labeled_count += 1
            else:
                # ── TRƯỜNG HỢP 2: CẶP ĐÃ CÓ GRADE (0..3) ──────────────────────
                # Bảo vệ khỏi ghi đè theo mặc định nếu allow_override=False.
                if not allow_override:
                    conflict_record = {
                        "query_id": qid,
                        "movie_id": mid,
                        "existing_grade": old_eff_grade,
                        "existing_status": existing_cand.get("status"),
                        "proposed_grade": cand_grade,
                        "proposed_by": item.get("annotated_by") or item.get("proposed_by", "Unknown"),
                        "action": "rejected_existing_preserved",
                    }
                    conflicts.append(conflict_record)
                    if strict_conflict_error:
                        raise ValueError(
                            f"Xung đột nhãn cho cặp ({qid}, {mid}): Nhãn hiện tại là {old_eff_grade}, "
                            f"nhãn đề xuất là {cand_grade}. Chế độ mặc định từ chối ghi đè nhãn cũ đã có điểm (allow_override=False)."
                        )
                else:
                    # Chế độ Adjudication / Thẩm định chuyên gia (cho phép ghi đè có kiểm soát và lưu vết audit trail)
                    adjudication_reason = item.get("adjudication_reason") or item.get("notes") or "Adjudication override"
                    annotator = item.get("annotated_by") or "Expert Adjudicator"
                    audit_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                    audit_record = {
                        "action": "adjudication_override",
                        "timestamp": audit_timestamp,
                        "previous_grade": old_eff_grade,
                        "previous_status": existing_cand.get("status"),
                        "new_grade": cand_grade,
                        "annotator": annotator,
                        "reason": adjudication_reason,
                    }
                    if "audit_trail" not in existing_cand:
                        existing_cand["audit_trail"] = []
                    existing_cand["audit_trail"].append(audit_record)

                    existing_cand["relevance_grade"] = cand_grade
                    existing_cand["verified_by_human"] = True
                    existing_cand["status"] = "adjudicated"
                    existing_cand["annotated_by"] = annotator
                    existing_cand["annotated_at"] = audit_timestamp
                    existing_cand["notes"] = adjudication_reason
                    adjudicated_count += 1
        else:
            # Ứng viên mới toanh bổ sung vào pool
            status = item.get("status")
            if not status:
                if cand_grade is not None:
                    status = "verified" if item.get("verified_by_human") else "llm_judged"
                else:
                    status = "unassessed"

            cand_entry = {
                "movie_id": mid,
                "tmdb_id": item.get("tmdb_id"),
                "title_vi": item.get("title_vi", ""),
                "title_en": item.get("title_en", ""),
                "genres": item.get("genres", ""),
                "release_date": item.get("release_date", ""),
                "vote_average": item.get("vote_average", 0.0),
                "overview_snippet": item.get("overview_snippet", ""),
                "overview_full": item.get("overview_full", ""),
                "pooled_by": item.get("proposed_by", ["Expansion"]),
                "model_ranks": item.get("model_ranks", {}),
                "retrieval_scores": item.get("retrieval_scores", {}),
                "is_source_movie": bool(item.get("is_source_movie", False)),
                "llm_grade": item.get("llm_grade") if not item.get("verified_by_human") else None,
                "llm_verdict": item.get("llm_verdict"),
                "relevance_grade": cand_grade if item.get("verified_by_human") else None,
                "verified_by_human": bool(item.get("verified_by_human", False)),
                "status": status,
                "annotated_by": item.get("annotated_by", ""),
                "annotated_at": item.get("annotated_at", ""),
                "notes": item.get("notes", ""),
            }
            cand_list.append(cand_entry)
            q_entry["total_candidates"] = len(cand_list)
            added_count += 1

    # Cập nhật metadata
    meta = updated_gt.get("metadata", {})
    meta["version"] = new_version_tag
    meta["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    pool_meta = meta.setdefault("candidate_pooling", {})
    pool_meta["total_pooled_candidates"] = sum(len(q["candidates"]) for q in updated_gt["queries"])
    pool_meta["expansion_additions"] = added_count
    pool_meta["initial_labeled_updates"] = initial_labeled_count
    pool_meta["adjudicated_updates"] = adjudicated_count

    meta["merge_report"] = {
        "base_version": base_gt_data.get("metadata", {}).get("version", "2.0"),
        "target_version": new_version_tag,
        "total_input_items": len(new_labeled_items),
        "added_new_candidates": added_count,
        "initial_labeled_count": initial_labeled_count,
        "rejected_conflicts_count": len(conflicts),
        "adjudicated_count": adjudicated_count,
        "allow_override": allow_override,
        "conflicts": conflicts,
    }

    return updated_gt


# ══════════════════════════════════════════════════════════════════════════════
# 4. TÁI TÍNH TOÁN METRICS ĐỒNG BỘ TRÊN CÙNG BỘ NHÃN QRELS
# ══════════════════════════════════════════════════════════════════════════════


def reevaluate_model_runs_on_qrels(
    model_runs_top10: Dict[str, Any],
    gt_data: Dict[str, Any],
    top_k: int = 10,
    strict_query_validation: bool = True,
) -> Dict[str, Dict[str, Any]]:
    """Tái tính toán toàn bộ số đo IR cho tất cả các mô hình trên cùng một tập qrels chuẩn hóa:

    - Kiểm tra nghiêm ngặt: Mỗi mô hình bắt buộc phải có đầy đủ toàn bộ 100 queries chuẩn benchmark.
      Nếu thiếu, thừa hoặc trùng bất kỳ query nào, raise ValueError (đảm bảo tính công bằng của macro-average).
    - Phân tách rõ ràng giữa:
        + Conservative metric: gán gain = 0 cho ứng viên unjudged / insufficient để đối chuẩn với Run #04.1.
        + Báo cáo độ bao phủ (coverage report): chi tiết số lượng judged, insufficient, unpooled, unassessed.
        + Cờ cảnh báo rõ ràng: không tự tuyên bố kết quả bảo thủ là hoàn toàn xác minh.
    """
    from scripts.benchmark_models_v2 import (
        compute_average_precision,
        compute_hit_at_k,
        compute_ndcg_at_k,
        compute_pooled_relative_recall_at_k,
        compute_precision_at_k,
        compute_reciprocal_rank,
    )

    queries_map = {}
    expected_queries = gt_data.get("queries", [])
    expected_qids = [q["query_id"] for q in expected_queries]
    expected_set = set(expected_qids)

    for q in expected_queries:
        qid = q["query_id"]
        cands_by_id = {int(c["movie_id"]): c for c in q.get("candidates", [])}
        eff_grades = [
            get_effective_candidate_grade(c)
            for c in q.get("candidates", [])
            if get_effective_candidate_grade(c) is not None
        ]
        total_rel = sum(1 for g in eff_grades if g >= BINARY_RELEVANCE_THRESHOLD)
        queries_map[qid] = {
            "cands_by_id": cands_by_id,
            "all_pool_grades": eff_grades,
            "total_rel_in_pool": total_rel,
        }

    results: Dict[str, Dict[str, Any]] = {}

    for model_name, run_data in model_runs_top10.items():
        # Chuẩn hóa run_data hỗ trợ cả Dict[qid, list] lẫn List[dict] / List[tuple]
        if isinstance(run_data, list):
            qids_sequence = []
            normalized_run = {}
            for item in run_data:
                if isinstance(item, dict):
                    q_id = item.get("query_id")
                    retrieved = item.get("retrieved_top10") or item.get("retrieved_ids") or []
                    if isinstance(retrieved, list) and retrieved and isinstance(retrieved[0], dict):
                        retrieved = [r.get("movie_id") for r in retrieved]
                elif isinstance(item, (list, tuple)) and len(item) == 2:
                    q_id, retrieved = item
                else:
                    raise ValueError(f"Dạng dữ liệu run không hợp lệ trong danh sách của mô hình '{model_name}': {item}")

                qids_sequence.append(q_id)
                normalized_run[q_id] = retrieved

            # Kiểm tra query ID trùng lặp trong run dạng danh sách
            dup_counts = Counter(qids_sequence)
            duplicates = [q_id for q_id, count in dup_counts.items() if count > 1]
            if duplicates:
                raise ValueError(
                    f"Mô hình '{model_name}' chứa query ID bị trùng lặp: {duplicates}. "
                    f"Mỗi truy vấn chỉ được xuất hiện chính xác 1 lần trong run."
                )
            run_dict = normalized_run
        elif isinstance(run_data, dict):
            run_dict = run_data
        else:
            raise TypeError(f"Dữ liệu run của '{model_name}' phải là dict hoặc list!")

        run_qids = set(run_dict.keys())
        missing_qids = expected_set - run_qids
        extra_qids = run_qids - expected_set

        if extra_qids and strict_query_validation:
            raise ValueError(
                f"Mô hình '{model_name}' chứa {len(extra_qids)} query thừa không thuộc Ground Truth "
                f"(kỳ vọng đúng {len(expected_qids)} queries). Các query thừa: {sorted(list(extra_qids))[:5]}... "
                f"Run bắt buộc phải khớp chính xác tập queries của benchmark."
            )

        if missing_qids and strict_query_validation:
            raise ValueError(
                f"Mô hình '{model_name}' thiếu {len(missing_qids)} query so với Ground Truth "
                f"(kỳ vọng {len(expected_qids)} queries, nhận {len(run_qids)}). "
                f"Các query thiếu: {sorted(list(missing_qids))[:5]}... "
                f"Để đảm bảo macro-average công bằng, run bắt buộc phải chứa đầy đủ toàn bộ benchmark queries."
            )

        all_ndcg = []
        all_p = []
        all_pr_r = []
        all_map = []
        all_mrr = []
        all_hit = []

        judged_count = 0
        insufficient_count = 0
        unpooled_count = 0
        unassessed_count = 0
        total_retrieved = 0

        for qid in expected_qids:
            if qid not in run_dict:
                continue

            q_info = queries_map[qid]
            cand_pool = q_info["cands_by_id"]
            pool_grades = q_info["all_pool_grades"]
            total_rel = q_info["total_rel_in_pool"]

            retrieved_ids = run_dict[qid]
            retrieved_grades = []
            rel_flags = []

            for mid in retrieved_ids[:top_k]:
                total_retrieved += 1
                mid_int = int(mid)
                c = cand_pool.get(mid_int)
                if c is not None:
                    g = get_effective_candidate_grade(c)
                    v = c.get("llm_verdict")
                    if g is not None:
                        judged_count += 1
                        grade_val = g
                    elif v == "insufficient_evidence" or c.get("status") == "insufficient_evidence":
                        insufficient_count += 1
                        grade_val = 0  # Quy ước bảo thủ
                    else:
                        unassessed_count += 1
                        grade_val = 0  # Quy ước bảo thủ
                else:
                    unpooled_count += 1
                    grade_val = 0  # Quy ước bảo thủ

                retrieved_grades.append(grade_val)
                rel_flags.append(grade_val >= BINARY_RELEVANCE_THRESHOLD)

            all_ndcg.append(compute_ndcg_at_k(retrieved_grades, pool_grades, top_k))
            all_p.append(compute_precision_at_k(rel_flags, top_k))
            all_pr_r.append(compute_pooled_relative_recall_at_k(rel_flags, total_rel, top_k))
            all_map.append(compute_average_precision(rel_flags, total_rel, top_k))
            all_mrr.append(compute_reciprocal_rank(rel_flags, top_k))
            all_hit.append(compute_hit_at_k(rel_flags, top_k))

        n = len(all_ndcg) if all_ndcg else 1
        unjudged_total = insufficient_count + unpooled_count + unassessed_count
        coverage_pct = round((judged_count / max(1, total_retrieved)) * 100, 2)

        conservative_metrics = {
            "ndcg@10": round(sum(all_ndcg) / n, 4),
            "p@10": round(sum(all_p) / n, 4),
            "pr_recall@10": round(sum(all_pr_r) / n, 4),
            "map@10": round(sum(all_map) / n, 4),
            "mrr": round(sum(all_mrr) / n, 4),
            "hit@10": round(sum(all_hit) / n, 4),
        }

        results[model_name] = {
            **conservative_metrics,
            "metrics_conservative": conservative_metrics,
            "coverage": {
                "total_retrieved_k": total_retrieved,
                "judged_count": judged_count,
                "insufficient_evidence_count": insufficient_count,
                "unpooled_count": unpooled_count,
                "unassessed_count": unassessed_count,
                "coverage_at_k_pct": coverage_pct,
            },
            "unjudged_policy_notice": (
                "Conservative evaluation policy: Unjudged candidates and candidates with insufficient "
                "evidence are treated as grade 0 (not relevant) for consistency with Run #04.1. "
                "These metrics represent a lower-bound estimate and should not be claimed as verified."
            ),
            "has_unjudged_warning": unjudged_total > 0,
            "is_fully_verified": False,
        }

    return results


if __name__ == "__main__":
    print("🚀 Đang xuất canonical qrels_v2 từ Ground Truth V2...")
    qrels = export_canonical_qrels()
    print("✅ Hoàn thành xuất qrels_v2:")
    print(f"   • Tổng số cặp ứng viên: {qrels['metadata']['total_candidate_pairs']}")
    print(f"   • Số cặp đã đánh giá xuất vào TREC: {qrels['metadata']['judged_pairs_in_trec']}")
    print(f"   • Số cặp thiếu bằng chứng/chưa đánh giá (loại khỏi TREC): {qrels['metadata']['unjudged_or_insufficient_pairs_excluded_from_trec']}")
    print(f"   • File JSON: {QRELS_V2_JSON_FILE}")
    print(f"   • File TREC: {QRELS_V2_TREC_FILE}")

