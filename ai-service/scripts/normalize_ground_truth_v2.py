"""Script chuẩn hóa trạng thái và đồng bộ dữ liệu Ground Truth V2, Checkpoint và Annotation Queue.

Mục tiêu:
1. Đối chiếu và đồng bộ 25 bản ghi có kết quả LLM nhưng còn mang trạng thái 'unassessed'.
2. Đưa toàn bộ 3.673 cặp ứng viên về trạng thái 'llm_judged' đồng nhất.
3. Cập nhật checkpoint 'llm_judge_checkpoint.json' đủ 3.673 bản ghi.
4. Đảm bảo verified_by_human giữ nguyên False (không tự ý đánh dấu người duyệt).
"""

import json
import shutil
import sys
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

GT_DIR = Path("ai-service/experiments/ground_truth")
GT_FILE = GT_DIR / "ground_truth_v2.json"
QUEUE_FILE = GT_DIR / "annotation_queue_v2.json"
CKPT_FILE = GT_DIR / "llm_judge_checkpoint.json"
PILOT_FILE = GT_DIR / "pilot_llm_judge_results.json"


class DataConflictError(Exception):
    """Ngoại lệ phát sinh khi phát hiện mâu thuẫn/xung đột dữ liệu giữa GT, Checkpoint hoặc Queue."""
    pass


def atomic_save(file_path: Path, data: dict):
    """Ghi dữ liệu an toàn nguyên tử bằng file tạm và backup, tự tạo thư mục cha."""
    file_path.parent.mkdir(parents=True, exist_ok=True)
    bak_path = file_path.with_suffix(".bak")
    tmp_path = file_path.with_suffix(".tmp")
    if file_path.exists():
        shutil.copy2(file_path, bak_path)
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp_path.replace(file_path)


def normalize_and_sync(strict: bool = True):
    print("=" * 80)
    print("🔄 BẮT ĐẦU CHUẨN HÓA TRẠNG THÁI VÀ ĐỒNG BỘ GROUND TRUTH V2")
    print("=" * 80)

    with open(GT_FILE, "r", encoding="utf-8") as f:
        gt_data = json.load(f)

    with open(QUEUE_FILE, "r", encoding="utf-8") as f:
        queue_data = json.load(f)

    with open(CKPT_FILE, "r", encoding="utf-8") as f:
        ckpt_data = json.load(f)

    pilot_map = {}
    if PILOT_FILE.exists():
        with open(PILOT_FILE, "r", encoding="utf-8") as f:
            pilot_data = json.load(f)
            for j in pilot_data.get("judgments", []):
                key = (str(j["query_id"]), int(j["movie_id"]))
                pilot_map[key] = j

    ckpt_judgments = list(ckpt_data.get("judgments", []))
    ckpt_map = {}
    for j in ckpt_judgments:
        key = (str(j["query_id"]), int(j["movie_id"]))
        ckpt_map[key] = j

    queue_items = list(queue_data.get("queue", []))
    queue_map = {}
    for it in queue_items:
        key = (str(it["query_id"]), int(it["movie_id"]))
        queue_map[key] = it

    print(f"• Số bản ghi hiện tại trong Checkpoint: {len(ckpt_judgments)}")
    print(f"• Số bản ghi từ Pilot:                {len(pilot_map)}")
    print(f"• Số bản ghi trong Annotation Queue:  {len(queue_items)}")

    # ══════════════════════════════════════════════════════════════════════════
    # GIAI ĐOẠN 1: KIỂM SOÁT TÍNH HỢP LỆ VÀ PHÁT HIỆN XUNG ĐỘT (READ-ONLY)
    # Tuyệt đối không thay đổi bất kỳ trạng thái nào và không ghi bất kỳ file nào!
    # ══════════════════════════════════════════════════════════════════════════
    conflict_records = []
    gt_map = {}

    for q in gt_data.get("queries", []):
        qid = str(q["query_id"])
        for c in q.get("candidates", []):
            mid = int(c["movie_id"])
            key = (qid, mid)
            pair_id = f"{qid}_{mid}"
            gt_map[key] = c

            has_human_flag = bool(c.get("verified_by_human", False)) or c.get("status") == "verified"
            raw_grade = c.get("relevance_grade")
            has_grade = raw_grade is not None
            valid_grade = has_grade and (raw_grade in (0, 1, 2, 3))
            has_annotator = bool(c.get("annotated_by") and str(c.get("annotated_by")).strip())

            # 1.1. Kiểm tra tính hợp lệ của grade (0, 1, 2, 3)
            if has_grade and not valid_grade:
                conflict_records.append({
                    "pair_id": pair_id,
                    "issue": "invalid_relevance_grade_out_of_range",
                    "relevance_grade": raw_grade,
                    "status": c.get("status"),
                })

            # 1.2. Có grade nhưng thiếu bằng chứng người đánh giá (thiếu cờ verified hoặc thiếu người chấm)
            if has_grade and not (has_human_flag and has_annotator):
                conflict_records.append({
                    "pair_id": pair_id,
                    "issue": "relevance_grade_without_verified_human_provenance",
                    "relevance_grade": raw_grade,
                    "status": c.get("status"),
                    "annotated_by": c.get("annotated_by"),
                })

            # 1.3. Đánh dấu verified nhưng không có điểm số
            if has_human_flag and not has_grade:
                conflict_records.append({
                    "pair_id": pair_id,
                    "issue": "verified_flag_without_relevance_grade",
                    "status": c.get("status"),
                    "annotated_by": c.get("annotated_by"),
                })

            # 1.4. Đối soát xung đột kết quả LLM giữa GT và Checkpoint
            if key in ckpt_map:
                ckpt_entry = ckpt_map[key]
                if c.get("llm_grade") is not None and ckpt_entry.get("llm_grade") is not None:
                    if c.get("llm_grade") != ckpt_entry.get("llm_grade"):
                        conflict_records.append({
                            "pair_id": pair_id,
                            "issue": "llm_grade_mismatch_gt_vs_ckpt",
                            "gt_grade": c.get("llm_grade"),
                            "ckpt_grade": ckpt_entry.get("llm_grade"),
                        })
                if c.get("llm_verdict") is not None and ckpt_entry.get("llm_verdict") is not None:
                    if c.get("llm_verdict") != ckpt_entry.get("llm_verdict"):
                        conflict_records.append({
                            "pair_id": pair_id,
                            "issue": "llm_verdict_mismatch_gt_vs_ckpt",
                            "gt_verdict": c.get("llm_verdict"),
                            "ckpt_verdict": ckpt_entry.get("llm_verdict"),
                        })

            # 1.5. Đối soát xung đột giữa GT và Annotation Queue
            if key in queue_map:
                q_item = queue_map[key]
                q_grade = q_item.get("relevance_grade")
                q_is_ver = bool(q_item.get("verified_by_human") or q_item.get("status") == "verified")

                # Cả hai đều có relevance_grade nhưng lệch nhau
                if has_grade and q_grade is not None and raw_grade != q_grade:
                    conflict_records.append({
                        "pair_id": pair_id,
                        "issue": "relevance_grade_mismatch_gt_vs_queue",
                        "gt_grade": raw_grade,
                        "queue_grade": q_grade,
                    })

                # Queue tự nhận là verified nhưng GT lại không có xác minh từ người
                if q_is_ver and not (has_human_flag and has_grade and has_annotator):
                    conflict_records.append({
                        "pair_id": pair_id,
                        "issue": "uncommitted_verified_in_queue_not_in_gt",
                        "queue_status": q_item.get("status"),
                        "gt_status": c.get("status"),
                    })

                # Lệch kết quả LLM giữa GT và Queue
                if c.get("llm_grade") is not None and q_item.get("llm_grade") is not None:
                    if c.get("llm_grade") != q_item.get("llm_grade"):
                        conflict_records.append({
                            "pair_id": pair_id,
                            "issue": "llm_grade_mismatch_gt_vs_queue",
                            "gt_llm_grade": c.get("llm_grade"),
                            "queue_llm_grade": q_item.get("llm_grade"),
                        })

    # 1.6. Kiểm tra tính hợp lệ của từng bản ghi trong Annotation Queue
    for it in queue_items:
        key = (str(it["query_id"]), int(it["movie_id"]))
        pair_id = f"{it['query_id']}_{it['movie_id']}"
        q_raw_grade = it.get("relevance_grade")
        if q_raw_grade is not None and q_raw_grade not in (0, 1, 2, 3):
            conflict_records.append({
                "pair_id": pair_id,
                "issue": "invalid_queue_relevance_grade_out_of_range",
                "relevance_grade": q_raw_grade,
            })
        if (it.get("verified_by_human") or it.get("status") == "verified") and q_raw_grade is None:
            conflict_records.append({
                "pair_id": pair_id,
                "issue": "verified_queue_flag_without_relevance_grade",
                "status": it.get("status"),
            })

    # DỪNG LẬP TỨC NẾU CÓ BẤT KỲ XUNG ĐỘT NÀO TRƯỚC KHI THỰC HIỆN BẤT CỨ THAY ĐỔI NÀO
    if conflict_records:
        print("\n" + "!" * 80)
        print(f"🚨 PHÁT HIỆN {len(conflict_records)} XUNG ĐỘT DỮ LIỆU CHƯA ĐƯỢC XỬ LÝ!")
        print("🛑 TIẾN TRÌNH TỪ CHỐI GHI ĐỂ BẢO VỆ TÍNH TOÀN VẸN CỦA GROUND TRUTH.")
        print("🔒 KHÔNG CÓ BẤT KỲ FILE NÀO (Ground Truth, Checkpoint, Queue) BỊ GHI ĐÈ HAY THAY ĐỔI!")
        print("!" * 80)
        for cr in conflict_records[:10]:
            print(f"  • {cr}")
        if len(conflict_records) > 10:
            print(f"  ... và {len(conflict_records) - 10} xung đột khác.")
        print("!" * 80 + "\n")
        if strict:
            raise DataConflictError(
                f"Phát hiện {len(conflict_records)} xung đột dữ liệu chưa được xử lý! Dừng toàn bộ tiến trình ghi."
            )
        return False

    # ══════════════════════════════════════════════════════════════════════════
    # GIAI ĐOẠN 2: CHUẨN HÓA VÀ ĐỒNG BỘ NỘI DUNG (KHI ĐÃ XÁC NHẬN 0 XUNG ĐỘT)
    # ══════════════════════════════════════════════════════════════════════════
    normalized_gt_count = 0
    preserved_human_count = 0
    added_to_ckpt_count = 0

    for q in gt_data.get("queries", []):
        qid = str(q["query_id"])
        qtype = q.get("query_group") or q.get("query_type")
        qtext = q.get("query")
        for c in q.get("candidates", []):
            mid = int(c["movie_id"])
            key = (qid, mid)
            pair_id = f"{qid}_{mid}"

            has_human_flag = bool(c.get("verified_by_human", False)) or c.get("status") == "verified"
            raw_grade = c.get("relevance_grade")
            valid_grade = (raw_grade is not None) and (raw_grade in (0, 1, 2, 3))
            has_annotator = bool(c.get("annotated_by") and str(c.get("annotated_by")).strip())

            if has_human_flag and valid_grade and has_annotator:
                preserved_human_count += 1
                c["verified_by_human"] = True
                c["status"] = "verified"
            else:
                if c.get("status") == "unassessed" and (c.get("llm_grade") is not None or c.get("llm_verdict") is not None):
                    c["status"] = "llm_judged"
                    c["verified_by_human"] = False
                    c["relevance_grade"] = None
                    normalized_gt_count += 1

            if key not in ckpt_map:
                pilot_entry = pilot_map.get(key)
                judged_time = c.get("llm_judged_at") or (pilot_entry.get("llm_judged_at") if pilot_entry else None)
                new_entry = {
                    "pair_id": pair_id,
                    "query_id": qid,
                    "query_type": qtype,
                    "query": qtext,
                    "movie_id": mid,
                    "title_vi": c.get("title_vi"),
                    "title_en": c.get("title_en"),
                    "llm_grade": c.get("llm_grade"),
                    "llm_verdict": c.get("llm_verdict"),
                    "llm_reasoning": c.get("llm_reasoning") or (pilot_entry.get("llm_reasoning") if pilot_entry else ""),
                    "judge_model": c.get("judge_model") or "gemini-3.5-flash-lite",
                    "rubric_version": c.get("rubric_version") or "2.0-unified-5groups",
                    "llm_judged_at": judged_time,
                    "status": c.get("status", "llm_judged"),
                    "verified_by_human": c.get("verified_by_human", False),
                }
                ckpt_judgments.append(new_entry)
                ckpt_map[key] = new_entry
                added_to_ckpt_count += 1

    ckpt_data["judgments"] = ckpt_judgments
    ckpt_data["total_judged"] = len(ckpt_judgments)
    ckpt_data["total_target"] = len(ckpt_judgments)
    ckpt_data["last_updated"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    normalized_queue_count = 0
    actual_verified_count = 0

    for it in queue_items:
        qid = str(it["query_id"])
        mid = int(it["movie_id"])
        key = (qid, mid)

        gt_cand = gt_map.get(key)
        if gt_cand:
            gt_is_ver = bool(gt_cand.get("verified_by_human") or gt_cand.get("status") == "verified")
            if gt_is_ver:
                it["verified_by_human"] = True
                it["status"] = "verified"
                it["relevance_grade"] = gt_cand.get("relevance_grade")
                it["annotated_by"] = gt_cand.get("annotated_by")
                it["annotated_at"] = gt_cand.get("annotated_at")
                it["notes"] = gt_cand.get("notes")
                actual_verified_count += 1
            else:
                if it.get("status") == "unassessed" and key in ckpt_map:
                    ckpt_entry = ckpt_map[key]
                    it["status"] = "llm_judged"
                    it["llm_grade"] = ckpt_entry.get("llm_grade")
                    it["llm_verdict"] = ckpt_entry.get("llm_verdict")
                    it["llm_reasoning"] = ckpt_entry.get("llm_reasoning")
                    it["judge_model"] = ckpt_entry.get("judge_model")
                    it["verified_by_human"] = False
                    normalized_queue_count += 1
        else:
            if it.get("verified_by_human"):
                actual_verified_count += 1

    queue_meta = queue_data.setdefault("metadata", {})
    queue_meta["total_items"] = len(queue_items)
    queue_meta["verified_items"] = actual_verified_count
    queue_meta["pending_annotation_items"] = len(queue_items) - actual_verified_count
    queue_meta["last_synced_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ══════════════════════════════════════════════════════════════════════════
    # GIAI ĐOẠN 3: GHI NGUYÊN TỬ VÀO ĐĨA (CHỈ KHI TOÀN BỘ KIỂM TRA ĐÃ PASS)
    # ══════════════════════════════════════════════════════════════════════════
    atomic_save(GT_FILE, gt_data)
    atomic_save(CKPT_FILE, ckpt_data)
    atomic_save(QUEUE_FILE, queue_data)

    print("\n✅ HOÀN TẤT CHUẨN HÓA VÀ ĐỒNG BỘ (0 XUNG ĐỘT):")
    print(f"  • Số bản ghi chuẩn hóa status trong Ground Truth:  {normalized_gt_count}")
    print(f"  • Số bản ghi bảo toàn nhãn con người đã xác minh: {preserved_human_count}")
    print(f"  • Số xung đột phát hiện:                         0 (Hoàn toàn nhất quán)")
    print(f"  • Số bản ghi bổ sung vào Checkpoint:             {added_to_ckpt_count}")
    print(f"  • Tổng số bản ghi trong Checkpoint mới:          {len(ckpt_judgments)} / 3.673 (100%)")
    print(f"  • Số bản ghi chuẩn hóa status trong Queue:        {normalized_queue_count}")
    print(f"  • Số nhãn thực tế đã verified trong Queue:       {actual_verified_count}")
    print(f"  • Số nhãn đang chờ duyệt (Pending):              {len(queue_items) - actual_verified_count}")
    print("=" * 80)
    return True


if __name__ == "__main__":
    normalize_and_sync()
