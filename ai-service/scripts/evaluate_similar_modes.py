"""
scripts/evaluate_similar_modes.py
=================================
Đánh giá thực nghiệm so sánh 3 chế độ reranking của similar_movies:
- off (baseline)
- soft (configurable genre_weight: 0.2, 0.3, 0.4)
- strict

Chỉ số đo lường:
1. GenreOverlap@10: Tỷ lệ thể loại trùng khớp trung bình giữa phim mục tiêu và Top-10
2. Diversity@10: Số lượng thể loại độc nhất xuất hiện trong Top-10
3. Latency (ms): Thời gian thực thi trung bình (Retrieval + Rerank)
4. Phân tích định tính thủ công mức độ phù hợp thực tế.
"""

from __future__ import annotations

import json
import csv
import os
import sys
import time
from pathlib import Path

# UTF-8 console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Add ai-service/src to sys.path
_THIS_DIR = Path(__file__).resolve().parent
_SRC_DIR = _THIS_DIR.parent / "src"
if str(_SRC_DIR) not in sys.path:
    sys.path.insert(0, str(_SRC_DIR))

import chromadb
from utils.genre_utils import extract_genres, compute_genre_similarity, rerank_similar_candidates
from similar_review_utils import select_review_text

CHROMA_DIR = _THIS_DIR.parent / "data" / "chroma_db"
COLLECTION_NAME = "movies"

# Tập phim mẫu thử nghiệm đại diện cho các nhóm thể loại và trường hợp biên:
TEST_MOVIES = [
    {"id": 1115, "name": "The Sleepover", "note": "Đa thể loại: Hài + Kinh dị"},
    {"id": 3190, "name": "Supernova", "note": "Đa thể loại: Viễn tưởng + Kinh dị + Gây cấn"},
    {"id": 895, "name": "Wenecja", "note": "Đa thể loại: Chính kịch + Lãng mạn"},
    {"id": 2769, "name": "The Yards", "note": "Đa thể loại: Hình sự + Chính kịch + Gây cấn"},
    {"id": 19, "name": "Ace Ventura", "note": "Phim Hài + Phiêu lưu"},
    {"id": 18, "name": "Four Rooms", "note": "Phim Hài + Bí ẩn"},
    {"id": 3, "name": "Grumpier Old Men", "note": "Phim Hài + Lãng mạn"},
    {"id": 24, "name": "Powder", "note": "Phim Chính kịch + Giả tượng"},
    {"id": 20, "name": "Money Train", "note": "Phim Hành động + Hình sự"},
    {"id": 74553, "name": "Bí Mật Của Kells", "note": "Phim Hoạt hình + Gia đình + Giả tượng"},
]


def run_benchmark():
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    collection = client.get_collection(COLLECTION_NAME)

    print("=" * 80)
    print("  BENCHMARK P1-B2: GENRE-AWARE RERANKING CHO SIMILAR_MOVIES")
    print(f"  ChromaDB Path : {CHROMA_DIR}")
    print(f"  Collection    : {COLLECTION_NAME} ({collection.count():,} vectors)")
    print("=" * 80)

    modes = ["off", "strict", "soft_0.2", "soft_0.3", "soft_0.4"]
    metrics_by_mode = {
        m: {"overlaps": [], "diversities": [], "latencies": [], "counts": [], "match_rates": []}
        for m in modes
    }
    review_candidates = {}  # (targetId, movieId) -> blinded manual-review row
    qualitative_samples = {}

    # Check if a sibling collection has document corpus text as fallback
    doc_fallback_col = None
    for fb_name in ["movies_e5_base", "movies_e5_small"]:
        try:
            fb_c = client.get_collection(fb_name)
            if fb_c.count() > 0:
                doc_fallback_col = fb_c
                break
        except Exception:
            pass

    for item in TEST_MOVIES:
        mid = item["id"]
        res = collection.get(ids=[str(mid)], include=["embeddings", "metadatas", "documents"])
        if not res["ids"]:
            print(f"[WARN] Không tìm thấy movie_id={mid}")
            continue

        target_vec = res["embeddings"][0]
        target_meta = res["metadatas"][0] or {}
        target_document = (res.get("documents") or [None])[0]
        if not target_document and doc_fallback_col:
            fb_res = doc_fallback_col.get(ids=[str(mid)], include=["documents"])
            if fb_res.get("documents"):
                target_document = fb_res["documents"][0]
        target_review_text, target_text_source = select_review_text(target_meta, target_document)
        target_title = target_meta.get("title") or item["name"]
        target_genres = extract_genres(target_meta.get("genres"))

        # Candidate retrieval: Top-100
        t0 = time.perf_counter()
        raw = collection.query(
            query_embeddings=[target_vec],
            # +1 compensates for the source movie in the ANN output.
            n_results=min(101, collection.count()),
            include=["metadatas", "distances", "documents"],
        )
        t_retrieval = (time.perf_counter() - t0) * 1000

        documents_by_rank = (raw.get("documents") or [[]])[0] or []
        if (not documents_by_rank or all(d is None for d in documents_by_rank)) and doc_fallback_col:
            cand_ids = [str(cid) for cid in raw["ids"][0]]
            fb_cand_res = doc_fallback_col.get(ids=cand_ids, include=["documents"])
            id_to_doc = dict(zip(fb_cand_res["ids"], fb_cand_res.get("documents") or []))
            documents_by_rank = [id_to_doc.get(str(cid)) for cid in raw["ids"][0]]
        seen_ids = set()
        candidates = []
        for idx, (cid, dist, meta) in enumerate(zip(raw["ids"][0], raw["distances"][0], raw["metadatas"][0])):
            meta = meta or {}
            candidate_document = documents_by_rank[idx] if idx < len(documents_by_rank) else None
            icid = int(cid)
            if icid == mid or icid in seen_ids:
                continue
            seen_ids.add(icid)
            candidates.append({
                "id": icid,
                "score": float(1.0 - dist),
                "payload": meta,
                "document": candidate_document,
                "genres": meta.get("genres"),
                "title": meta.get("title"),
            })

        # Match the public service's candidate pool, excluding the target.
        candidates = candidates[:100]
        qualitative_samples[mid] = {
            "title": target_title,
            "genres": list(target_genres),
            "note": item["note"],
            "results": {},
        }

        # Evaluate each mode
        for mode_key in modes:
            if mode_key.startswith("soft"):
                weight = float(mode_key.split("_")[1])
                mode_name = "soft"
            else:
                weight = 0.3
                mode_name = mode_key

            t0 = time.perf_counter()
            reranked = rerank_similar_candidates(
                candidates=candidates,
                target_genres=target_genres,
                mode=mode_name,
                genre_weight=weight,
                top_k=10,
            )
            t_rerank = (time.perf_counter() - t0) * 1000
            total_latency = t_retrieval + t_rerank

            # Calculate metrics
            overlap_scores = []
            unique_genres = set()
            for r in reranked:
                c_genres = extract_genres(r.get("genres") or (r.get("payload") or {}).get("genres"))
                unique_genres.update(c_genres)
                if target_genres:
                    common = target_genres & c_genres
                    # Overlap ratio = |intersection| / |target|
                    overlap_scores.append(len(common) / len(target_genres))
                else:
                    overlap_scores.append(1.0)  # neutral if target has no genre

            avg_overlap = sum(overlap_scores) / len(overlap_scores) if overlap_scores else 0.0
            diversity = len(unique_genres)  # Not Intra-List Diversity; only unique genre count.
            match_rate = sum(
                bool(target_genres & extract_genres(r.get("genres") or (r.get("payload") or {}).get("genres")))
                for r in reranked
            ) / len(reranked) if reranked and target_genres else None

            metrics_by_mode[mode_key]["overlaps"].append(avg_overlap)
            metrics_by_mode[mode_key]["diversities"].append(diversity)
            metrics_by_mode[mode_key]["latencies"].append(total_latency)
            metrics_by_mode[mode_key]["counts"].append(len(reranked))
            if match_rate is not None:
                metrics_by_mode[mode_key]["match_rates"].append(match_rate)
            # Pool each unique candidate ONCE. The reviewer does not see mode/rank.
            for r in reranked:
                key = (mid, int(r["id"]))
                candidate_meta = r.get("payload") or {}
                candidate_review_text, candidate_text_source = select_review_text(
                    candidate_meta, r.get("document")
                )
                review_candidates.setdefault(key, {
                    "target_movie_id": mid,
                    "target_title": target_title,
                    "target_genres": ", ".join(sorted(target_genres)),
                    "target_overview": target_review_text,
                    "target_text_source": target_text_source,
                    "candidate_movie_id": int(r["id"]),
                    "candidate_title": r.get("title") or (r.get("payload") or {}).get("title", ""),
                    "candidate_genres": ", ".join(sorted(extract_genres(
                        r.get("genres") or (r.get("payload") or {}).get("genres")))),
                    "candidate_overview": candidate_review_text,
                    "candidate_text_source": candidate_text_source,
                    "relevance_grade_0_3": "",  # Human annotator must fill.
                    "reviewer_note": "",
                })

            # Lưu lại top 3 cho đánh giá định tính
            top3 = [
                {
                    "id": r["id"],
                    "title": r.get("title"),
                    "score": round(r.get("score", 0.0), 3),
                    "genres": list(extract_genres(r.get("genres"))),
                }
                for r in reranked[:3]
            ]
            qualitative_samples[mid]["results"][mode_key] = {
                "overlap_at_10": round(avg_overlap * 100, 1),
                "diversity_at_10": diversity,
                "top3": top3,
            }

    # Summary table
    print("\n" + "=" * 80)
    print("  TỔNG HỢP KẾT QUẢ BENCHMARK TRÊN 10 PHIM MẪU")
    print("=" * 80)
    print(f"{'Chế độ (Mode)':<16} | {'GenreOverlap@10':<16} | {'Diversity@10':<14} | {'Latency (ms)':<14}")
    print("-" * 66)

    summary_data = {}
    for m in modes:
        entries = metrics_by_mode[m]["overlaps"]
        if not entries:
            print(f"{m:<16} | no valid samples")
            continue
        mean_overlap = 100 * sum(entries) / len(entries)
        mean_diversity = sum(metrics_by_mode[m]["diversities"]) / len(entries)
        mean_latency = sum(metrics_by_mode[m]["latencies"]) / len(entries)
        mean_count = sum(metrics_by_mode[m]["counts"]) / len(entries)
        match_rates = metrics_by_mode[m]["match_rates"]
        summary_data[m] = {
            "target_genre_recall_pct": round(mean_overlap, 2),
            "unique_genres_at_10": round(mean_diversity, 2),
            "latency_ms": round(mean_latency, 2),
            "mean_returned_at_10": round(mean_count, 2),
            "any_genre_match_rate_pct": round(100 * sum(match_rates) / len(match_rates), 2) if match_rates else None,
            "sample_count": len(entries),
        }
        print(f"{m:<16} | {mean_overlap:>14.2f}% | {mean_diversity:>12.2f} | {mean_latency:>12.2f}ms")

    # Output detailed JSON report
    report_path = _THIS_DIR.parent / "logs" / "similar_movies_benchmark_audited_v2.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump({
            "evaluation_scope": "10 hand-picked movies; genre metrics only, no independent human relevance labels",
            "note": "Strict mode never backfills nonmatching genres; low result count reported separately.",
            "summary": summary_data,
            "samples": qualitative_samples,
        }, f, ensure_ascii=False, indent=2)
    print(f"\n[OK] Đã lưu báo cáo chi tiết tại: {report_path}")
    review_path = _THIS_DIR.parent / "logs" / "similar_movies_human_review_queue_v2.csv"
    with review_path.open("w", encoding="utf-8-sig", newline="") as stream:
        fields = ["target_movie_id", "target_title", "target_genres", "target_overview", "target_text_source",
                  "candidate_movie_id", "candidate_title", "candidate_genres", "candidate_overview", "candidate_text_source",
                  "relevance_grade_0_3", "reviewer_note"]
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for key in sorted(review_candidates):
            writer.writerow(review_candidates[key])
    missing_targets = sum(not row["target_overview"].strip() for row in review_candidates.values())
    missing_candidates = sum(not row["candidate_overview"].strip() for row in review_candidates.values())
    print(f"[OK] Human-review queue (chưa có nhãn): {review_path}")
    print(f"[COVERAGE] Review evidence: {len(review_candidates)} pairs; "
          f"target missing={missing_targets}, candidate missing={missing_candidates}")
    if missing_targets or missing_candidates:
        print("[WARN] Review queue còn thiếu nội dung; cần bổ sung tài liệu trước khi chấm mức liên quan.")

    # In chi tiết 3 case tiêu biểu
    print("\n" + "=" * 80)
    print("  ĐÁNH GIÁ ĐỊNH TÍNH (QUALITATIVE EVALUATION) CÁC CASE TIÊU BIỂU")
    print("=" * 80)
    for mid in [1115, 3190, 895]:
        sample = qualitative_samples.get(mid)
        if sample is None:
            continue
        print(f"\nTarget: [{mid}] {sample['title']} ({sample['note']}) | Genres: {sample['genres']}")
        for m in ["off", "strict", "soft_0.3"]:
            res = sample["results"][m]
            print(f"  * Mode {m:<8} (Overlap: {res['overlap_at_10']}%, Div: {res['diversity_at_10']}):")
            for idx, film in enumerate(res["top3"], 1):
                print(f"      {idx}. [{film['id']}] {film['title'][:32]:<32} (score={film['score']}) -> {film['genres']}")

if __name__ == "__main__":
    run_benchmark()
