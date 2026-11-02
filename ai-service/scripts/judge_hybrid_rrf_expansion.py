#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""judge_hybrid_rrf_expansion.py.

==============================
Thực hiện thẩm định 142 cặp ứng viên Top-10 của Hybrid RRF bằng Gemini LLM-as-a-Judge:
1. Nạp hàng đợi mù (annotation_queue_hybrid_rrf_top10_blinded.json) - 142 cặp (41 insufficient, 101 new_unpooled).
2. Gửi request theo batch (5 cặp/lượt) tới Gemini API (gemini-3.5-flash) theo Double-Blind Rubric 0-3.
3. Lưu checkpoint an toàn, phân tách rõ ràng llm_grade (0..3) và llm_reasoning.
4. Hợp nhất vào Ground Truth V3 (ground_truth_v3.json) bảo tồn 100% nhãn cũ, lưu audit trail.
5. Xuất tập qrels_v3.json và qrels_v3.txt chuẩn hóa.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import json
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional

# UTF-8 stdout configuration for Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent
PROJECT_ROOT = AI_SERVICE_DIR.parent
GT_DIR = AI_SERVICE_DIR / "experiments" / "ground_truth"
EVALUATION_DIR = AI_SERVICE_DIR / "experiments" / "evaluation"

if str(AI_SERVICE_DIR / "src") not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR / "src"))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from llm_judge_ground_truth_v2 import (
    atomic_save_json,
    build_judge_prompt,
    call_gemini_api,
    clean_and_parse_json,
    get_gemini_api_key,
    DEFAULT_JUDGE_MODEL,
)
from benchmark_expansion import (
    export_canonical_qrels,
    merge_expansion_labels_into_ground_truth,
)

BLINDED_QUEUE_FILE = GT_DIR / "annotation_queue_hybrid_rrf_top10_blinded.json"
CHECKPOINT_FILE = GT_DIR / "llm_judge_expansion_142_checkpoint.json"
GROUND_TRUTH_V2_FILE = GT_DIR / "ground_truth_v2.json"
GROUND_TRUTH_V3_FILE = GT_DIR / "ground_truth_v3.json"
QRELS_V3_JSON_FILE = GT_DIR / "qrels_v3.json"
QRELS_V3_TREC_FILE = GT_DIR / "qrels_v3.txt"


def run_expansion_judging(
    batch_size: int = 5,
    delay_between_batches: float = 1.5,
    max_items: Optional[int] = None,
) -> List[Dict[str, Any]]:
    print("=" * 80)
    print("🚀 BẮT ĐẦU THẨM ĐỊNH 142 CẶP ỨNG VIÊN HYBRID RRF BẰNG GEMINI LLM-AS-A-JUDGE")
    print("=" * 80)

    api_key = get_gemini_api_key()
    if not api_key:
        raise ValueError("Không tìm thấy GEMINI_API_KEY trong môi trường hoặc .env!")

    if not BLINDED_QUEUE_FILE.exists():
        raise FileNotFoundError(f"Không tìm thấy file hàng đợi tại: {BLINDED_QUEUE_FILE}")

    with open(BLINDED_QUEUE_FILE, "r", encoding="utf-8") as f:
        queue_payload = json.load(f)

    queue_items = queue_payload.get("queue", [])
    if max_items:
        queue_items = queue_items[:max_items]

    print(f"📋 Tổng số cặp cần thẩm định: {len(queue_items)} cặp")

    # Nạp checkpoint nếu có
    checkpoint_data: Dict[str, Dict[str, Any]] = {}
    if CHECKPOINT_FILE.exists():
        try:
            with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                checkpoint_data = json.load(f).get("judgments", {})
            print(f"🔄 Đã nạp checkpoint: {len(checkpoint_data)} cặp đã hoàn thành trước đó.")
        except Exception as e:
            print(f"⚠️ Lỗi đọc checkpoint ({e}), bắt đầu mới.")

    pending_items = [it for it in queue_items if it["queue_id"] not in checkpoint_data]
    print(f"⏳ Số cặp còn phải gửi API: {len(pending_items)} cặp ({len(queue_items) - len(pending_items)} đã có nhãn)")

    # Xử lý theo batch
    total_batches = (len(pending_items) + batch_size - 1) // batch_size
    for b_idx in range(total_batches):
        batch = pending_items[b_idx * batch_size : (b_idx + 1) * batch_size]
        print(f"\n[Batch {b_idx + 1}/{total_batches}] Đang thẩm định {len(batch)} cặp ({batch[0]['queue_id']} .. {batch[-1]['queue_id']})...")

        # Chuẩn bị input cho prompt
        formatted_batch = []
        for it in batch:
            item_copy = dict(it)
            item_copy["pair_id"] = it["queue_id"]
            formatted_batch.append(item_copy)

        prompt = build_judge_prompt(formatted_batch)
        try:
            raw_resp, model_used = call_gemini_api(prompt, api_key, model_name=DEFAULT_JUDGE_MODEL)
            parsed_list = clean_and_parse_json(raw_resp)
            parsed_dict = {p["pair_id"]: p for p in parsed_list if "pair_id" in p}

            for it in batch:
                qid_mid = it["queue_id"]
                if qid_mid in parsed_dict:
                    res = parsed_dict[qid_mid]
                    g = res.get("grade")
                    v = res.get("verdict", "irrelevant")
                    r = res.get("reasoning", "")
                else:
                    print(f"⚠️ Không tìm thấy kết quả bóc tách cho {qid_mid}, mặc định insufficient")
                    g = None
                    v = "insufficient_evidence"
                    r = "Missing response in parsed JSON"

                judgment_record = {
                    "queue_id": qid_mid,
                    "query_id": it["query_id"],
                    "movie_id": int(it["movie_id"]),
                    "title_vi": it.get("title_vi", ""),
                    "title_en": it.get("title_en", ""),
                    "llm_grade": g,
                    "relevance_grade": None,  # Tuyệt đối không đánh dấu human-verified
                    "verified_by_human": False,
                    "llm_verdict": v,
                    "llm_reasoning": r,
                    "judge_model": model_used,
                    "annotated_by": f"{model_used} (LLM-as-a-Judge)",
                    "annotated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "status": "llm_judged" if g is not None else "insufficient_evidence",
                }
                checkpoint_data[qid_mid] = judgment_record
                print(f"  ✓ {qid_mid}: Grade={g} ({v}) | {it.get('title_vi', '')[:30]}")

            # Lưu checkpoint atomically
            atomic_save_json(
                CHECKPOINT_FILE,
                {
                    "metadata": {
                        "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                        "total_judged": len(checkpoint_data),
                    },
                    "judgments": checkpoint_data,
                },
                create_backup=False,
            )

        except Exception as e:
            print(f"❌ Lỗi xử lý batch {b_idx + 1}: {e}")
            time.sleep(3.0)
            continue

        if b_idx < total_batches - 1:
            time.sleep(delay_between_batches)

    judged_items = list(checkpoint_data.values())
    print("\n" + "=" * 80)
    print(f"🎉 THẨM ĐỊNH HOÀN TẤT: {len(judged_items)}/{len(queue_items)} cặp có nhãn chuẩn học thuật!")
    grade_counts = {}
    for it in judged_items:
        g = it.get("llm_grade")
        grade_counts[g] = grade_counts.get(g, 0) + 1
    print(f"📊 Phân bố Grade: {grade_counts}")
    print("=" * 80)
    return judged_items


def create_ground_truth_and_qrels_v3(judged_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    print("\n⏳ Đang hợp nhất vào Ground Truth V3 và xuất qrels_v3...")
    with open(GROUND_TRUTH_V2_FILE, "r", encoding="utf-8") as f:
        gt_v2 = json.load(f)

    # Hợp nhất bằng hàm chuẩn học thuật (bảo toàn 100% nhãn cũ, lưu audit trail)
    gt_v3 = merge_expansion_labels_into_ground_truth(
        base_gt_data=gt_v2,
        new_labeled_items=judged_items,
        new_version_tag="3.0-expanded",
        allow_override=False,
    )

    with open(GROUND_TRUTH_V3_FILE, "w", encoding="utf-8") as f:
        json.dump(gt_v3, f, ensure_ascii=False, indent=2)
    print(f"✅ Đã tạo Ground Truth V3 tại: {GROUND_TRUTH_V3_FILE}")

    # Xuất qrels_v3 theo chuẩn TREC và JSON
    qrels_payload = export_canonical_qrels(
        gt_data=gt_v3,
        out_json_path=QRELS_V3_JSON_FILE,
        out_trec_path=QRELS_V3_TREC_FILE,
        version="3.0-canonical",
    )
    print(f"✅ Đã xuất qrels_v3 (JSON) tại: {QRELS_V3_JSON_FILE}")
    print(f"✅ Đã xuất qrels_v3 (TREC) tại: {QRELS_V3_TREC_FILE}")
    print(f"   Tổng cặp trong TREC qrels: {len(qrels_payload['qrels'])} queries, "
          f"{qrels_payload['metadata'].get('judged_pairs_in_trec', qrels_payload['metadata'].get('judged_in_trec_count', 0))} judgments có grade xác định.")
    return gt_v3


def main():
    parser = argparse.ArgumentParser(description="Judge 142 expansion pairs using Gemini LLM-as-a-Judge")
    parser.add_argument("--batch-size", type=int, default=5, help="Kích thước batch (mặc định 5)")
    parser.add_argument("--delay", type=float, default=1.5, help="Độ trễ giữa các request (s)")
    parser.add_argument("--max-items", type=int, default=None, help="Giới hạn số item (để test)")
    args = parser.parse_args()

    judged_items = run_expansion_judging(
        batch_size=args.batch_size,
        delay_between_batches=args.delay,
        max_items=args.max_items,
    )
    create_ground_truth_and_qrels_v3(judged_items)


if __name__ == "__main__":
    main()
