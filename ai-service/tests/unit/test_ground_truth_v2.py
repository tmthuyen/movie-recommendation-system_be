# #!/usr/bin/env python
# # -*- coding: utf-8 -*-
# """Unit tests cho Bước 3: Xây dựng Ground Truth V2 bằng Candidate Pooling.

# Kiểm tra:
# 1. Đủ 100 queries, giữ nguyên 5 nhóm cân bằng (20 query/nhóm).
# 2. Kiểm chứng source_movie_id và mapping phim hợp lệ với Corpus (14.815 phim) & ChromaDB.
# 3. Candidate Pooling từ TF-IDF, BM25 và SBERT:
#    - Mỗi query có nhiều ứng viên (trung bình > 15 phim/query).
#    - Provenance ghi nhận đầy đủ mô hình đã pool (pooled_by) và thứ hạng (model_ranks).
# 4. Phân biệt rõ ràng giữa null (chưa đánh giá) và grade 0 (con người xác nhận không liên quan).
# 5. Không tự coi phim nguồn là đáp án duy nhất; không tự động đánh dấu nhãn LLM là human-verified (verified_by_human = False).
# 6. Kiểm tra không trùng lặp movie_id trong cùng một query; 100% ID hợp lệ.
# 7. Ngưỡng nhị phân binary_relevance_threshold = 2; NDCG dùng thang điểm 0-3.
# 8. Hàng đợi đánh giá annotation_queue_v2.json đầy đủ thông tin, đồng bộ với Ground Truth V2.
# 9. Giữ nguyên Ground Truth V1 (ground_truth.json) và các Run cũ.
# """

# from collections import Counter
# import json
# from pathlib import Path
# import pytest

# CURRENT_DIR = Path(__file__).resolve().parent
# AI_SERVICE_DIR = CURRENT_DIR.parent.parent
# PROJECT_ROOT = AI_SERVICE_DIR.parent
# GT_DIR = AI_SERVICE_DIR / "experiments" / "ground_truth"

# GT_V1_FILE = GT_DIR / "ground_truth.json"
# GT_V2_FILE = GT_DIR / "ground_truth_v2.json"
# ANNOTATION_QUEUE_FILE = GT_DIR / "annotation_queue_v2.json"
# BENCHMARK_QUERIES_FILE = GT_DIR / "benchmark_queries_v2.json"
# SOURCE_MOVIES_FILE = GT_DIR / "benchmark_source_movies_100.json"
# CSV_PATH = PROJECT_ROOT / "all_movies_fully_translated.csv"


# class TestGroundTruthV2:
#     @pytest.fixture(scope="module")
#     def gt_v2_data(self):
#         assert GT_V2_FILE.exists(), f"File {GT_V2_FILE} chưa được tạo"
#         with open(GT_V2_FILE, "r", encoding="utf-8") as f:
#             return json.load(f)

#     @pytest.fixture(scope="module")
#     def queue_data(self):
#         assert ANNOTATION_QUEUE_FILE.exists(), f"File {ANNOTATION_QUEUE_FILE} chưa được tạo"
#         with open(ANNOTATION_QUEUE_FILE, "r", encoding="utf-8") as f:
#             return json.load(f)

#     @pytest.fixture(scope="module")
#     def benchmark_queries(self):
#         with open(BENCHMARK_QUERIES_FILE, "r", encoding="utf-8") as f:
#             return json.load(f)

#     @pytest.fixture(scope="module")
#     def source_movies_map(self):
#         with open(SOURCE_MOVIES_FILE, "r", encoding="utf-8") as f:
#             data = json.load(f)
#             return {m["movie_id"]: m for m in data.get("movies", [])}

#     # ── 1. Kiểm tra cấu trúc 100 queries và 5 nhóm ───────────────────────────

#     def test_total_queries_is_100(self, gt_v2_data):
#         queries = gt_v2_data.get("queries", [])
#         assert len(queries) == 100, f"Kỳ vọng 100 queries nhưng có {len(queries)}"

#     def test_queries_balanced_across_5_groups(self, gt_v2_data):
#         queries = gt_v2_data.get("queries", [])
#         counts = Counter(q["query_type"] for q in queries)
#         expected = {
#             "Lexical": 20,
#             "Semantic": 20,
#             "Abstract": 20,
#             "Typo_Slang": 20,
#             "Short_Long": 20,
#         }
#         for grp, exp_count in expected.items():
#             assert (
#                 counts.get(grp, 0) == exp_count
#             ), f"Nhóm {grp} có {counts.get(grp, 0)} queries, kỳ vọng {exp_count}"

#     # ── 2. Kiểm tra tính toàn vẹn ID và không trùng lặp ─────────────────────

#     def test_no_duplicate_candidate_movie_ids_per_query(self, gt_v2_data):
#         for q in gt_v2_data.get("queries", []):
#             qid = q["query_id"]
#             candidates = q.get("candidates", [])
#             movie_ids = [c["movie_id"] for c in candidates]
#             assert len(movie_ids) == len(
#                 set(movie_ids)
#             ), f"Query {qid} có movie_id bị trùng lặp trong candidates!"

#     def test_all_source_movie_ids_match_step2_and_exist_in_candidates(
#         self, gt_v2_data, benchmark_queries, source_movies_map
#     ):
#         step2_src_map = {
#             q["query_id"]: q["source_movie_id"]
#             for q in benchmark_queries.get("queries", [])
#         }
#         for q in gt_v2_data.get("queries", []):
#             qid = q["query_id"]
#             sid = q["source_movie_id"]
#             assert (
#                 sid == step2_src_map[qid]
#             ), f"Query {qid} có source_movie_id {sid} lệch với Bước 2 ({step2_src_map[qid]})"
#             assert (
#                 sid in source_movies_map
#             ), f"source_movie_id {sid} không tồn tại trong benchmark_source_movies_100.json"

#             # Phim nguồn phải có mặt trong danh sách candidates
#             cand_ids = [c["movie_id"] for c in q.get("candidates", [])]
#             assert (
#                 sid in cand_ids
#             ), f"Query {qid}: source_movie_id {sid} không có mặt trong danh sách candidates!"

#             src_cand = next(c for c in q.get("candidates", []) if c["movie_id"] == sid)
#             assert src_cand.get("is_source_movie") is True

#     # ── 3. Candidate Pooling từ TF-IDF, BM25, SBERT ──────────────────────────

#     def test_candidate_pooling_coverage_and_provenance(self, gt_v2_data):
#         total_candidates = 0
#         all_pooled_models = set()

#         for q in gt_v2_data.get("queries", []):
#             candidates = q.get("candidates", [])
#             total_candidates += len(candidates)
#             assert (
#                 len(candidates) >= 10
#             ), f"Query {q['query_id']} chỉ có {len(candidates)} ứng viên (quá ít sau pooling)!"

#             for c in candidates:
#                 assert "movie_id" in c and isinstance(c["movie_id"], int)
#                 assert "title_vi" in c and len(c["title_vi"]) > 0
#                 assert "pooled_by" in c and isinstance(c["pooled_by"], list)
#                 assert len(c["pooled_by"]) > 0
#                 for m in c["pooled_by"]:
#                     all_pooled_models.add(m)

#         # Cả 3 mô hình IR chính phải tham gia đóng góp
#         assert "TF-IDF" in all_pooled_models
#         assert "BM25" in all_pooled_models
#         assert "SBERT" in all_pooled_models

#         avg_cands = total_candidates / 100
#         assert (
#             avg_cands >= 15.0
#         ), f"Trung bình ứng viên/query {avg_cands} thấp hơn kỳ vọng (>= 15.0)"

#     # ── 4. Nguyên tắc Ground Truth, Graded Relevance & Phân biệt Null vs 0 ──

#     def test_not_source_only_and_initial_unverified_status(self, gt_v2_data):
#         """Đảm bảo không tự coi phim nguồn là đáp án duy nhất và không tự đánh dấu verified_by_human."""
#         meta = gt_v2_data.get("metadata", {})
#         status = meta.get("annotation_status", {})
#         assert (
#             status.get("verified_by_human_count") == 0
#         ), "Ban đầu số nhãn verified_by_human_count phải bằng 0!"

#         for q in gt_v2_data.get("queries", []):
#             assert (
#                 len(q.get("candidates", [])) > 1
#             ), f"Query {q['query_id']} chỉ có 1 phim! Vi phạm quy tắc nhiều phim liên quan."

#             for c in q.get("candidates", []):
#                 assert (
#                     c.get("verified_by_human") is False
#                 ), f"Ứng viên {c['movie_id']} trong {q['query_id']} bị tự động đánh dấu verified_by_human=True!"

#     def test_distinction_between_unassessed_and_grade_zero(self, gt_v2_data):
#         """Phân biệt rõ ràng: phim chưa đánh giá (grade: null, status: unassessed) với grade 0 (không liên quan)."""
#         unassessed_found = False
#         for q in gt_v2_data.get("queries", []):
#             for c in q.get("candidates", []):
#                 assert (
#                     c.get("relevance_grade") is None
#                 ), f"Ứng viên {c['movie_id']} chưa đánh giá phải có relevance_grade = null"
#                 assert c.get("status") == "unassessed"
#                 unassessed_found = True
#         assert unassessed_found, "Không tìm thấy ứng viên unassessed nào!"

#     def test_source_movies_not_preassigned_grade_3(self, gt_v2_data):
#         """Yêu cầu 1: Tuyệt đối không gán sẵn relevance_grade 3 cho phim nguồn; để null cho đến khi được người đánh giá xác nhận."""
#         source_count = 0
#         for q in gt_v2_data.get("queries", []):
#             sid = q["source_movie_id"]
#             src_cands = [c for c in q.get("candidates", []) if c["movie_id"] == sid]
#             assert len(src_cands) == 1, f"Query {q['query_id']} phải có đúng 1 phim nguồn trong pool"
#             src_cand = src_cands[0]
#             source_count += 1

#             assert src_cand.get("is_source_movie") is True
#             assert (
#                 src_cand.get("relevance_grade") is None
#             ), f"Phim nguồn {sid} của query {q['query_id']} bị gán sẵn grade={src_cand.get('relevance_grade')}!"
#             assert src_cand.get("status") == "unassessed"
#             assert src_cand.get("verified_by_human") is False
#         assert source_count == 100, f"Kỳ vọng 100 phim nguồn nhưng tìm thấy {source_count}"

#     def test_evaluation_standards_documented(self, gt_v2_data):
#         meta = gt_v2_data.get("metadata", {})
#         eval_std = meta.get("evaluation_standards", {})
#         assert eval_std.get("binary_relevance_threshold") == 2
#         scale = meta.get("relevance_scale", {})
#         assert set(scale.keys()) == {"0", "1", "2", "3"}

#     # ── 5. Đánh giá Mù (Double-Blind) & Xáo trộn có thể tái lập ──────────────

#     def test_reproducible_shuffling_candidates(self, gt_v2_data):
#         """Yêu cầu 2: Xáo trộn danh sách ứng viên có thể tái lập (deterministic) với seed cố định."""
#         from scripts.annotate_ground_truth_v2 import (
#             SHUFFLE_SEED,
#             get_reproducible_shuffled_candidates,
#         )

#         q = gt_v2_data["queries"][0]
#         cands = q["candidates"]

#         shuffled_1 = get_reproducible_shuffled_candidates(q["query_id"], cands, seed=SHUFFLE_SEED)
#         shuffled_2 = get_reproducible_shuffled_candidates(q["query_id"], cands, seed=SHUFFLE_SEED)

#         # Tái lập 100% qua các lần gọi độc lập
#         assert [c["movie_id"] for c in shuffled_1] == [c["movie_id"] for c in shuffled_2]
#         # Giữ nguyên số lượng và tập hợp các movie_id
#         assert set(c["movie_id"] for c in shuffled_1) == set(c["movie_id"] for c in cands)
#         assert len(shuffled_1) == len(cands)
#         # Khác seed cho ra thứ tự khác
#         shuffled_diff = get_reproducible_shuffled_candidates(q["query_id"], cands, seed=9999)
#         assert [c["movie_id"] for c in shuffled_1] != [c["movie_id"] for c in shuffled_diff]

#     def test_double_blind_annotation_hides_provenance(self):
#         """Yêu cầu 2: Khi human annotation, ẩn tên model, thứ hạng truy xuất, điểm gợi ý và thông tin phim nguồn."""
#         import inspect
#         from scripts import annotate_ground_truth_v2

#         func_source = inspect.getsource(annotate_ground_truth_v2.run_interactive_annotation)
#         # Xác nhận giao diện hiển thị không để lộ metadata thiên lệch
#         assert "cand['pooled_by']" not in func_source
#         assert 'cand["pooled_by"]' not in func_source
#         assert "cand['model_ranks']" not in func_source
#         assert 'cand["model_ranks"]' not in func_source
#         assert "cand['retrieval_scores']" not in func_source
#         assert 'cand["retrieval_scores"]' not in func_source
#         assert "cand['is_source_movie']" not in func_source
#         assert 'cand["is_source_movie"]' not in func_source

#     # ── 6. Sửa lỗi genres bị tách thành từng ký tự ───────────────────────────

#     def test_genres_formatting_not_split_characters_in_gt_and_queue(
#         self, gt_v2_data, queue_data
#     ):
#         """Yêu cầu 3: genres không bị tách thành từng ký tự đơn lẻ trong Ground Truth V2 và queue."""
#         from scripts.build_ground_truth_v2 import format_genres_clean

#         # Kiểm tra logic hàm format_genres_clean
#         ast_case = "[{'id': 28, 'name': 'Phim Hành Động'}, {'id': 12, 'name': 'Phim Phiêu Lưu'}]"
#         assert format_genres_clean(ast_case) == "Phim Hành Động, Phim Phiêu Lưu"

#         char_split_case = "P, h, i, m,  , H, à, n, h,  , Đ, ộ, n, g"
#         assert format_genres_clean(char_split_case) == "Phim Hành Động"

#         clean_case = "Phim Hành Động, Phim Viễn Tưởng"
#         assert format_genres_clean(clean_case) == "Phim Hành Động, Phim Viễn Tưởng"
#         assert format_genres_clean("") == ""
#         assert format_genres_clean(None) == ""

#         # Kiểm tra dữ liệu thực tế trong ground_truth_v2.json
#         for q in gt_v2_data.get("queries", []):
#             for c in q.get("candidates", []):
#                 g = c.get("genres", "")
#                 if g:
#                     parts = [p.strip() for p in g.split(",")]
#                     if len(parts) > 5:
#                         single_chars = sum(1 for p in parts if len(p) <= 2)
#                         assert single_chars / len(parts) < 0.5, (
#                             f"Candidate {c['movie_id']} trong {q['query_id']} bị lỗi split genres: '{g}'"
#                         )

#         # Kiểm tra dữ liệu thực tế trong annotation_queue_v2.json
#         for item in queue_data.get("queue", []):
#             g = item.get("genres", "")
#             if g:
#                 parts = [p.strip() for p in g.split(",")]
#                 if len(parts) > 5:
#                     single_chars = sum(1 for p in parts if len(p) <= 2)
#                     assert single_chars / len(parts) < 0.5, (
#                         f"Item {item['queue_id']} bị lỗi split genres: '{g}'"
#                     )

#     # ── 7. Tái sử dụng xác thực fingerprint & cache Bước 1 ───────────────────

#     def test_step1_corpus_fingerprint_and_cache_validation(self):
#         """Yêu cầu 4: Tái sử dụng cơ chế xác thực fingerprint/tokenizer cache của Bước 1."""
#         from core.tokenizer import UndertheseaTokenizer
#         from data.data_loader import compute_corpus_fingerprint
#         from build_vector_db import get_manifest_path, verify_vector_db
#         import chromadb

#         # 1. Corpus fingerprint xác định và nhất quán
#         sample_corpus = ["Phim hành động giả tưởng hay", "Phim hoạt hình thiếu nhi"]
#         sample_ids = [101, 102]
#         fp1 = compute_corpus_fingerprint(sample_corpus, sample_ids)
#         fp2 = compute_corpus_fingerprint(sample_corpus, sample_ids)
#         assert fp1 == fp2
#         assert len(fp1) == 64

#         # 2. Tokenizer hash
#         tok = UndertheseaTokenizer()
#         tok_hash = tok.get_config_hash()
#         assert len(tok_hash) == 64

#         # 3. ChromaDB Manifest & Verify Vector DB Bước 1
#         chroma_dir = AI_SERVICE_DIR / "data" / "chroma_db"
#         if chroma_dir.exists():
#             client = chromadb.PersistentClient(path=str(chroma_dir))
#             col = client.get_collection("movies")
#             manifest_path = get_manifest_path(chroma_dir, "movies")
#             assert manifest_path.exists(), "Manifest Bước 1 phải tồn tại"
#             with open(manifest_path, "r", encoding="utf-8") as f:
#                 manifest_data = json.load(f)
#             assert manifest_data.get("corpus_fingerprint") is not None
#             assert manifest_data.get("collection_name") == "movies"

#     # ── 8. Đồng bộ Ground Truth V2 & Queue, Bảo toàn nhãn khi resume ─────────

#     def test_ground_truth_and_annotation_queue_strict_synchronization(
#         self, gt_v2_data, queue_data
#     ):
#         """Yêu cầu 5: Ground Truth V2 và annotation queue luôn đồng bộ 100%."""
#         total_gt_candidates = sum(
#             len(q.get("candidates", [])) for q in gt_v2_data.get("queries", [])
#         )
#         queue_items = queue_data.get("queue", [])
#         assert len(queue_items) == total_gt_candidates

#         queue_by_id = {item["queue_id"]: item for item in queue_items}
#         for q in gt_v2_data.get("queries", []):
#             qid = q["query_id"]
#             for c in q.get("candidates", []):
#                 queue_id = f"{qid}_{c['movie_id']}"
#                 assert queue_id in queue_by_id, f"Thiếu {queue_id} trong annotation queue"
#                 q_item = queue_by_id[queue_id]

#                 assert q_item["relevance_grade"] == c["relevance_grade"]
#                 assert q_item["verified_by_human"] == c["verified_by_human"]
#                 assert q_item["status"] == c["status"]
#                 assert q_item["title_vi"] == c["title_vi"]
#                 assert q_item["genres"] == c["genres"]

#     def test_preservation_of_human_verified_labels_on_resume(self):
#         """Yêu cầu 5: Bảo toàn các nhãn đã xác minh khi tiếp tục công việc hoặc pooling lại."""
#         from scripts.annotate_ground_truth_v2 import annotate_candidate

#         # Dữ liệu giả lập
#         mock_gt = {
#             "metadata": {
#                 "version": "2.0-test",
#                 "annotation_status": {"verified_by_human_count": 0},
#             },
#             "queries": [
#                 {
#                     "query_id": "Q_TEST",
#                     "query_type": "Lexical",
#                     "query": "người máy tương lai",
#                     "source_movie_id": 501,
#                     "candidates": [
#                         {
#                             "movie_id": 501,
#                             "title_vi": "Kẻ Hủy Diệt",
#                             "is_source_movie": True,
#                             "relevance_grade": None,
#                             "verified_by_human": False,
#                             "status": "unassessed",
#                         },
#                         {
#                             "movie_id": 502,
#                             "title_vi": "Ma Trận",
#                             "is_source_movie": False,
#                             "relevance_grade": None,
#                             "verified_by_human": False,
#                             "status": "unassessed",
#                         },
#                     ],
#                 }
#             ],
#         }

#         # 1. Gán nhãn cho phim nguồn (Grade 3) và phim ứng viên (Grade 2)
#         annotate_candidate(
#             mock_gt, "Q_TEST", 501, relevance_grade=3, annotator="Auditor Alpha", notes="Rất liên quan", save_to_file=False
#         )
#         annotate_candidate(
#             mock_gt, "Q_TEST", 502, relevance_grade=2, annotator="Auditor Beta", notes="Liên quan một phần", save_to_file=False
#         )

#         # 2. Xây dựng bản đồ nhãn đã xác minh
#         existing_verified_map = {}
#         for q in mock_gt["queries"]:
#             qid = q["query_id"]
#             for c in q["candidates"]:
#                 if c.get("verified_by_human"):
#                     existing_verified_map[(qid, c["movie_id"])] = c

#         assert ("Q_TEST", 501) in existing_verified_map
#         assert existing_verified_map[("Q_TEST", 501)]["relevance_grade"] == 3
#         assert existing_verified_map[("Q_TEST", 501)]["annotated_by"] == "Auditor Alpha"
#         assert existing_verified_map[("Q_TEST", 502)]["relevance_grade"] == 2

#         # 3. Khi chạy lại logic gán pool với existing_verified_map, nhãn được bảo toàn
#         cand_501 = {
#             "movie_id": 501,
#             "relevance_grade": existing_verified_map[("Q_TEST", 501)]["relevance_grade"],
#             "verified_by_human": existing_verified_map[("Q_TEST", 501)]["verified_by_human"],
#             "status": existing_verified_map[("Q_TEST", 501)]["status"],
#             "annotated_by": existing_verified_map[("Q_TEST", 501)]["annotated_by"],
#         }
#         assert cand_501["relevance_grade"] == 3
#         assert cand_501["verified_by_human"] is True
#         assert cand_501["status"] == "verified"
#         assert cand_501["annotated_by"] == "Auditor Alpha"

#     def test_programmatic_annotation_flow(self, gt_v2_data):
#         from scripts.annotate_ground_truth_v2 import (
#             annotate_candidate,
#             get_annotation_statistics,
#         )

#         # Clone data trong bộ nhớ để test logic gán nhãn
#         data_copy = json.loads(json.dumps(gt_v2_data))
#         target_q = data_copy["queries"][0]
#         qid = target_q["query_id"]
#         non_src_cand = next(
#             c for c in target_q["candidates"] if not c["is_source_movie"]
#         )
#         mid = non_src_cand["movie_id"]

#         # Gán nhãn Grade 0 (xác nhận không liên quan) - không ghi đè file đĩa
#         success = annotate_candidate(
#             gt_data=data_copy,
#             query_id=qid,
#             movie_id=mid,
#             relevance_grade=0,
#             annotator="Test Auditor",
#             notes="Không liên quan về thể loại",
#             save_to_file=False,
#         )
#         assert success is True

#         updated_cand = next(
#             c for c in target_q["candidates"] if c["movie_id"] == mid
#         )
#         assert updated_cand["relevance_grade"] == 0
#         assert updated_cand["verified_by_human"] is True
#         assert updated_cand["status"] == "verified"
#         assert updated_cand["annotated_by"] == "Test Auditor"

#         stats = get_annotation_statistics(data_copy)
#         assert stats["verified_by_human_count"] == 1
#         assert stats["grade_distribution"].get("0") == 1

#     # ── 9. Giữ nguyên Ground Truth V1 và bảo toàn dữ liệu cũ ─────────────────

#     def test_ground_truth_v1_remains_intact(self):
#         assert GT_V1_FILE.exists(), "Ground Truth V1 (ground_truth.json) bị thiếu!"
#         with open(GT_V1_FILE, "r", encoding="utf-8") as f:
#             v1_data = json.load(f)
#         queries = v1_data.get("queries", [])
#         assert len(queries) == 20, "Ground Truth V1 phải giữ nguyên đúng 20 queries!"
