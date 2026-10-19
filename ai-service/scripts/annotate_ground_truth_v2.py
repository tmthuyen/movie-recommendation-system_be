#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""annotate_ground_truth_v2.py.

============================
Công cụ hỗ trợ chuyên gia thẩm định và gán nhãn Ground Truth V2 (Bước 3):
1. Đánh giá mù không thiên lệch (Double-Blind Evaluation Protocol):
   - Ẩn toàn bộ tên model (TF-IDF, BM25, SBERT), thứ hạng truy xuất, điểm gợi ý và thông tin phim nguồn.
   - Xáo trộn danh sách ứng viên một cách có thể tái lập (reproducible shuffling) bằng seed cố định.
2. Hiển thị thông tin khách quan: query, tiêu đề phim tiếng Việt & tiếng Anh, thể loại (chuẩn hóa), điểm vote, tóm tắt.
3. Cho phép người đánh giá xác nhận hoặc chỉnh sửa relevance_grade (0, 1, 2, 3).
4. Phân biệt rõ ràng:
   - Phim chưa đánh giá: relevance_grade = null (status: "unassessed", verified_by_human = False).
   - Phim xác nhận không liên quan: relevance_grade = 0 (status: "verified", verified_by_human = True).
5. Không tự coi phim nguồn là đáp án duy nhất; không tự đánh dấu nhãn LLM hay phim nguồn là con người đã xác minh.
6. Tự động lưu tiến độ tăng dần (incremental autosave) vào ground_truth_v2.json và annotation_queue_v2.json, hỗ trợ tiếp tục công việc mà không mất các nhãn đã xác minh.
7. Báo cáo thống kê tiến độ: nhãn đã xác minh vs chưa xác minh.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime
import json
import os
from pathlib import Path
import random
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


# ══════════════════════════════════════════════════════════════════════════════
# 1. HÀM XÁO TRỘN CÓ THỂ TÁI LẬP (REPRODUCIBLE SHUFFLING)
# ══════════════════════════════════════════════════════════════════════════════


def get_reproducible_shuffled_candidates(
    query_id: str, candidates: List[Dict[str, Any]], seed: int = SHUFFLE_SEED
) -> List[Dict[str, Any]]:
    """Xáo trộn danh sách ứng viên một cách có thể tái lập (deterministic) theo query_id và seed.

    Đảm bảo người thẩm định không thể đoán mô hình truy xuất hay vị trí phim nguồn.
    """
    rng = random.Random(f"{seed}_{query_id}")
    shuffled = list(candidates)
    rng.shuffle(shuffled)
    return shuffled


# ══════════════════════════════════════════════════════════════════════════════
# 2. HÀM NẠP VÀ LƯU DỮ LIỆU ANNOTATION ĐỒNG BỘ
# ══════════════════════════════════════════════════════════════════════════════


def load_ground_truth_v2() -> Dict[str, Any]:
    """Nạp tệp ground_truth_v2.json."""
    if not GROUND_TRUTH_V2_FILE.exists():
        raise FileNotFoundError(
            f"[FATAL] Không tìm thấy file {GROUND_TRUTH_V2_FILE}. "
            "Vui lòng chạy 'python scripts/build_ground_truth_v2.py' trước!"
        )
    with open(GROUND_TRUTH_V2_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_ground_truth_v2(data: Dict[str, Any]) -> None:
    """Lưu tệp ground_truth_v2.json kèm cập nhật lại metadata đếm số nhãn."""
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

    with open(GROUND_TRUTH_V2_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def sync_annotation_queue(gt_data: Dict[str, Any]) -> None:
    """Đồng bộ trạng thái từ ground_truth_v2 sang annotation_queue_v2.json."""
    queue_items = []
    verified_items = 0
    pending_items = 0

    for q in gt_data.get("queries", []):
        qid = q["query_id"]
        q_type = q["query_type"]
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
                    # Thông tin nội bộ phục vụ phân tích (ẩn khi hiển thị đánh giá)
                    "pooled_by": c.get("pooled_by", []),
                    "model_ranks": c.get("model_ranks", {}),
                    "is_source_movie": c.get("is_source_movie", False),
                    # Trạng thái đánh giá
                    "relevance_grade": c.get("relevance_grade"),
                    "verified_by_human": is_verified,
                    "status": c.get("status", "unassessed"),
                    "annotated_by": c.get("annotated_by", ""),
                    "annotated_at": c.get("annotated_at", ""),
                    "notes": c.get("notes", ""),
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
    with open(ANNOTATION_QUEUE_FILE, "w", encoding="utf-8") as f:
        json.dump(queue_payload, f, ensure_ascii=False, indent=2)


# ══════════════════════════════════════════════════════════════════════════════
# 3. HÀM CẬP NHẬT NHÃN (DÙNG CHO PROGRAMMATIC HOẶC CLI)
# ══════════════════════════════════════════════════════════════════════════════


def annotate_candidate(
    gt_data: Dict[str, Any],
    query_id: str,
    movie_id: int,
    relevance_grade: int,
    annotator: str = "Expert Annotator",
    notes: str = "",
    save_to_file: bool = True,
) -> bool:
    """Gán nhãn xác minh của con người cho một ứng viên trong ground_truth_v2.

    Thang điểm:
      3: Rất liên quan
      2: Liên quan
      1: Liên quan một phần
      0: Không liên quan
    """
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
    target_cand["annotated_by"] = annotator
    target_cand["annotated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if notes:
        target_cand["notes"] = notes

    if save_to_file:
        save_ground_truth_v2(gt_data)
        sync_annotation_queue(gt_data)
    return True


# ══════════════════════════════════════════════════════════════════════════════
# 4. BÁO CÁO TIẾN ĐỘ THẨM ĐỊNH (ANNOTATION STATISTICS)
# ══════════════════════════════════════════════════════════════════════════════


def get_annotation_statistics(gt_data: Dict[str, Any]) -> Dict[str, Any]:
    """Tính toán thống kê chi tiết về số lượng nhãn đã/chưa xác minh."""
    total_candidates = 0
    verified_count = 0
    unassessed_count = 0
    source_movies_count = 0
    source_movies_verified = 0

    grade_distribution = Counter()
    group_stats = defaultdict(lambda: {"total": 0, "verified": 0, "unassessed": 0})
    annotator_counts = Counter()

    for q in gt_data.get("queries", []):
        grp = q.get("query_type", "Unknown")
        for c in q.get("candidates", []):
            total_candidates += 1
            group_stats[grp]["total"] += 1

            if c.get("is_source_movie"):
                source_movies_count += 1

            is_verified = bool(c.get("verified_by_human", False))
            grade = c.get("relevance_grade")

            if is_verified:
                verified_count += 1
                group_stats[grp]["verified"] += 1
                grade_distribution[str(grade)] += 1
                if c.get("is_source_movie"):
                    source_movies_verified += 1
                ann = c.get("annotated_by") or "Anonymous"
                annotator_counts[ann] += 1
            else:
                unassessed_count += 1
                group_stats[grp]["unassessed"] += 1

    return {
        "total_queries": len(gt_data.get("queries", [])),
        "total_candidates": total_candidates,
        "verified_by_human_count": verified_count,
        "unassessed_count": unassessed_count,
        "source_movies_total": source_movies_count,
        "source_movies_human_verified": source_movies_verified,
        "verified_percentage": round((verified_count / total_candidates * 100), 2) if total_candidates > 0 else 0.0,
        "grade_distribution": dict(grade_distribution),
        "group_stats": dict(group_stats),
        "annotator_counts": dict(annotator_counts),
    }


def print_annotation_report(gt_data: Dict[str, Any]) -> None:
    """In báo cáo định dạng chuẩn ra màn hình."""
    stats = get_annotation_statistics(gt_data)

    print("\n" + "=" * 70)
    print("📋 BÁO CÁO TIẾN ĐỘ THẨM ĐỊNH GROUND TRUTH V2 (BƯỚC 3)")
    print("=" * 70)
    print(f"  • Tổng số truy vấn:                 {stats['total_queries']} queries (5 nhóm x 20)")
    print(f"  • Tổng số cặp ứng viên (Candidates): {stats['total_candidates']:,} cặp")
    print(
        f"  • Số nhãn ĐÃ ĐƯỢC CON NGƯỜI XÁC MINH: {stats['verified_by_human_count']:,} / {stats['total_candidates']:,} ({stats['verified_percentage']}%)"
    )
    print(f"  • Số ứng viên CHƯA ĐÁNH GIÁ (Unassessed): {stats['unassessed_count']:,}")
    print(
        f"  • Phim nguồn tham chiếu đã xác minh: {stats['source_movies_human_verified']} / {stats['source_movies_total']}"
    )

    print("\n📊 Phân bổ ứng viên theo 5 nhóm truy vấn:")
    print(f"  {'Nhóm':<15} | {'Tổng ứng viên':<15} | {'Đã xác minh':<15} | {'Chưa đánh giá':<15}")
    print("  " + "-" * 66)
    for grp, g_info in stats["group_stats"].items():
        print(f"  {grp:<15} | {g_info['total']:<15} | {g_info['verified']:<15} | {g_info['unassessed']:<15}")

    print("\n🎯 Phân bổ điểm số của các nhãn đã xác minh (Grade 0-3):")
    if stats["grade_distribution"]:
        for grade in ["3", "2", "1", "0"]:
            cnt = stats["grade_distribution"].get(grade, 0)
            label = {
                "3": "Grade 3 (Rất liên quan - Primary match)",
                "2": "Grade 2 (Liên quan - Strong partial)",
                "1": "Grade 1 (Một phần - Weak peripheral)",
                "0": "Grade 0 (Không liên quan - Irrelevant)",
            }.get(grade, f"Grade {grade}")
            print(f"  • {label}: {cnt} nhãn")
    else:
        print("  (Chưa có nhãn nào được thẩm định thủ công bởi con người)")

    print("\n🔒 Nguyên tắc Ground Truth tuân thủ nghiêm ngặt:")
    print("  ✓ Không gán sẵn grade 3 cho phim nguồn; toàn bộ để null cho đến khi con người thẩm định.")
    print("  ✓ Đánh giá mù (Double-Blind): Ẩn hoàn toàn tên mô hình, thứ hạng rank, điểm gợi ý và cờ phim nguồn.")
    print("  ✓ Xáo trộn ứng viên có thể tái lập (Reproducible Shuffling) với seed cố định.")
    print("  ✓ Phân biệt rõ null (chưa đánh giá) và grade 0 (con người xác nhận không liên quan).")
    print("  ✓ Đánh giá nhị phân sử dụng Grade >= 2; NDCG sử dụng điểm 0, 1, 2, 3.")
    print("=" * 70 + "\n")


# ══════════════════════════════════════════════════════════════════════════════
# 5. GIAO DIỆN CLI TƯƠNG TÁC CHO HUMAN ANNOTATION (ĐÁNH GIÁ MÙ)
# ══════════════════════════════════════════════════════════════════════════════


def run_interactive_annotation(
    query_id: Optional[str] = None,
    group: Optional[str] = None,
    unassessed_only: bool = True,
    annotator: str = "Expert Annotator",
    limit: int = 50,
) -> None:
    """Vòng lặp tương tác thẩm định từng ứng viên theo chuẩn đánh giá mù (Blind Evaluation)."""
    gt_data = load_ground_truth_v2()

    # Nhóm ứng viên theo từng query và xáo trộn có thể tái lập (Reproducible Shuffling)
    candidates_to_review = []
    for q in gt_data.get("queries", []):
        if query_id and q["query_id"] != query_id:
            continue
        if group and q["query_type"] != group:
            continue

        cands = q.get("candidates", [])
        # Áp dụng xáo trộn có thể tái lập để tránh bias theo thứ tự pooling/model
        shuffled_cands = get_reproducible_shuffled_candidates(q["query_id"], cands, seed=SHUFFLE_SEED)

        for c in shuffled_cands:
            if unassessed_only and c.get("verified_by_human"):
                continue
            candidates_to_review.append((q, c))

    print(f"\n🎬 Bắt đầu phiên thẩm định ĐÁNH GIÁ MÙ ({len(candidates_to_review)} ứng viên cần duyệt)...")
    print("⚡ [Double-Blind Mode] Tên model, thứ hạng và thông tin phim nguồn đã được ẩn hoàn toàn để tránh thiên lệch.")
    print("Hướng dẫn: Nhập điểm 0, 1, 2, 3 | Nhập 's' để bỏ qua | Nhập 'q' để lưu và thoát\n")

    reviewed_in_session = 0
    for q_info, cand in candidates_to_review:
        if reviewed_in_session >= limit:
            print(f"Đã đạt giới hạn {limit} ứng viên trong phiên làm việc. Dừng lại.")
            break

        print("-" * 70)
        print(f"🔍 QUERY [{q_info['query_id']}] ({q_info['query_type']}): \"{q_info['query']}\"")
        if q_info.get("source_evidence") and q_info["source_evidence"].get("matched_concepts"):
            print(f"   Ý định / Khái niệm: {q_info['source_evidence'].get('matched_concepts')}")

        # KHÔNG HIỂN THỊ: pooled_by, model_ranks, retrieval_scores, is_source_movie, suggested_grade
        print(f"\n🎬 PHIM ỨNG VIÊN #{cand['movie_id']}")
        print(f"   Tiêu đề VI:  {cand.get('title_vi')} | EN: {cand.get('title_en')}")
        print(f"   Thể loại:    {cand.get('genres')}")
        print(f"   Điểm TB:     {cand.get('vote_average')}/10 | Năm: {cand.get('release_date')}")
        print(f"   Tóm tắt:     {cand.get('overview_snippet')}")

        if cand.get("verified_by_human"):
            print(f"   Trạng thái:  ĐÃ ĐÁNH GIÁ (Grade {cand.get('relevance_grade')}) bởi {cand.get('annotated_by')}")
        else:
            print("   Trạng thái:  Chưa đánh giá (relevance_grade = null)")

        while True:
            try:
                choice = input("👉 Nhập điểm (0=Không liên quan, 1=Một phần, 2=Liên quan, 3=Rất liên quan, s=Bỏ qua, q=Thoát): ").strip().lower()
            except (KeyboardInterrupt, EOFError):
                choice = "q"

            if choice in ("q", "quit", "exit"):
                print("\n💾 Đã lưu tiến độ và thoát.")
                save_ground_truth_v2(gt_data)
                sync_annotation_queue(gt_data)
                print_annotation_report(gt_data)
                return

            if choice in ("s", "skip", ""):
                print("   ⏩ Bỏ qua ứng viên này.")
                break

            if choice in ("0", "1", "2", "3"):
                grade = int(choice)
                note = input("   Ghi chú / Rationale (tùy chọn, Enter để bỏ qua): ").strip()
                annotate_candidate(
                    gt_data=gt_data,
                    query_id=q_info["query_id"],
                    movie_id=cand["movie_id"],
                    relevance_grade=grade,
                    annotator=annotator,
                    notes=note,
                    save_to_file=True,
                )
                reviewed_in_session += 1
                print(f"   ✅ Đã gán nhãn Grade {grade} thành công! (Đã duyệt: {reviewed_in_session})\n")
                break
            else:
                print("   ❌ Lựa chọn không hợp lệ! Vui lòng chọn 0, 1, 2, 3, s hoặc q.")

    save_ground_truth_v2(gt_data)
    sync_annotation_queue(gt_data)
    print("\n🏁 Kết thúc phiên thẩm định.")
    print_annotation_report(gt_data)


# ══════════════════════════════════════════════════════════════════════════════
# 6. ENTRYPOINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Công cụ hỗ trợ Human Annotation Ground Truth V2")
    parser.add_argument("--stats", action="store_true", help="Hiển thị báo cáo thống kê nhãn đã/chưa xác minh")
    parser.add_argument("--interactive", action="store_true", help="Chạy giao diện dòng lệnh tương tác đánh giá nhãn")
    parser.add_argument("--query_id", type=str, default=None, help="Lọc theo query_id cụ thể (vd: Q001)")
    parser.add_argument("--group", type=str, default=None, help="Lọc theo nhóm query (vd: Lexical, Abstract)")
    parser.add_argument("--all", action="store_true", help="Duyệt tất cả ứng viên thay vì chỉ unassessed")
    parser.add_argument("--annotator", type=str, default="Expert Annotator", help="Tên người đánh giá")
    parser.add_argument("--limit", type=int, default=30, help="Số lượng ứng viên tối đa duyệt trong một phiên")
    args = parser.parse_args()

    gt = load_ground_truth_v2()

    if args.interactive:
        run_interactive_annotation(
            query_id=args.query_id,
            group=args.group,
            unassessed_only=not args.all,
            annotator=args.annotator,
            limit=args.limit,
        )
    else:
        print_annotation_report(gt)
