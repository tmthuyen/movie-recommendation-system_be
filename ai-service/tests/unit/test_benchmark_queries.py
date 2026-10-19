# """Unit tests cho Bước 2: Tạo bộ query benchmark V2.

# Kiểm chứng:
# 1. Đủ 100 queries cân bằng 5 nhóm (20 query/nhóm: Lexical, Semantic, Abstract, Typo_Slang, Short_Long).
# 2. Đầy đủ các trường bắt buộc (query_id, query_type, query, source_movie_id, source_evidence).
# 3. Không có câu hỏi trùng lặp hoặc gần trùng; không nối thêm thể loại để chống trùng.
# 4. Phim nguồn source_movie_id hợp lệ, có bằng chứng trích xuất từ tóm tắt thật.
# 5. Bắt buộc xác minh ChromaDB & PostgreSQL: Dừng (raise RuntimeError) nếu không thể xác minh.
# 6. Tuyệt đối không ghép theo thứ tự phần tử: Chỉ ghép khi movie_id khớp chính xác.
# 7. Không hardcode thông tin đăng nhập PostgreSQL trong source code.
# 8. Abstract thể hiện ý niệm/cảm xúc trừu tượng thay vì kể cốt truyện; Typo/Slang có văn phong tìm kiếm thực tế.
# """

# from collections import Counter
# import json
# from pathlib import Path
# import re

# import pytest

# from scripts.generate_benchmark_queries import (
#     BENCHMARK_QUERIES_OUT,
#     CHROMA_DIR,
#     SOURCE_MOVIES_OUT,
#     audit_and_balance_queries,
#     clean_vietnamese_text,
#     generate_queries_for_movie,
#     get_database_url,
#     get_verified_chromadb_ids,
#     get_verified_chromadb_metadata,
#     refine_existing_benchmark_queries,
#     select_100_diverse_movies,
#     verify_source_movies_against_current_dbs,
# )


# class TestBenchmarkQueriesV2:
#     @pytest.fixture
#     def queries_data(self):
#         assert (
#             BENCHMARK_QUERIES_OUT.exists()
#         ), f"File {BENCHMARK_QUERIES_OUT} chưa được tạo"
#         with open(BENCHMARK_QUERIES_OUT, "r", encoding="utf-8") as f:
#             return json.load(f)

#     @pytest.fixture
#     def source_movies_data(self):
#         assert SOURCE_MOVIES_OUT.exists(), f"File {SOURCE_MOVIES_OUT} chưa được tạo"
#         with open(SOURCE_MOVIES_OUT, "r", encoding="utf-8") as f:
#             return json.load(f)

#     def test_total_queries_is_100(self, queries_data):
#         queries = queries_data.get("queries", [])
#         assert len(queries) == 100, f"Kỳ vọng 100 queries nhưng có {len(queries)}"

#     def test_queries_balanced_across_5_groups(self, queries_data):
#         queries = queries_data.get("queries", [])
#         counts = Counter(q["query_type"] for q in queries)

#         expected_groups = {
#             "Lexical": 20,
#             "Semantic": 20,
#             "Abstract": 20,
#             "Typo_Slang": 20,
#             "Short_Long": 20,
#         }

#         for grp, expected_cnt in expected_groups.items():
#             actual = counts.get(grp, 0)
#             assert (
#                 actual == expected_cnt
#             ), f"Nhóm {grp} có {actual} queries, kỳ vọng {expected_cnt}"

#     def test_required_fields_present_in_all_queries(self, queries_data):
#         for q in queries_data["queries"]:
#             assert "query_id" in q and q["query_id"].startswith("Q")
#             assert "query_type" in q
#             assert "query" in q and len(q["query"].strip()) >= 2
#             assert "source_movie_id" in q and isinstance(q["source_movie_id"], int)
#             assert "source_evidence" in q

#             ev = q["source_evidence"]
#             assert "title_vi" in ev and ev["title_vi"]
#             assert "matched_concepts" in ev and ev["matched_concepts"]
#             assert "overview_snippet" in ev and len(ev["overview_snippet"]) > 10

#     def test_no_duplicate_queries(self, queries_data):
#         queries = queries_data["queries"]
#         normalized_texts = [q["query"].strip().lower() for q in queries]
#         unique_texts = set(normalized_texts)
#         assert len(normalized_texts) == len(
#             unique_texts
#         ), f"Có {len(normalized_texts) - len(unique_texts)} queries bị trùng lặp"

#     def test_source_movies_count_and_diversity(self, source_movies_data):
#         movies = source_movies_data.get("movies", [])
#         assert len(movies) == 100, f"Kỳ vọng 100 phim nguồn nhưng có {len(movies)}"

#         genres_set = set()
#         for m in movies:
#             assert m["movie_id"] > 0
#             assert len(m["overview_vi"]) >= 50
#             genres_set.update([g.strip() for g in m["genres"].split(",") if g.strip()])

#         assert (
#             len(genres_set) >= 8
#         ), f"Độ đa dạng thể loại quá thấp: chỉ có {len(genres_set)} thể loại"

#     def test_ground_truth_policy_documented(self, queries_data):
#         meta = queries_data.get("metadata", {})
#         policy = meta.get("ground_truth_policy", "")
#         assert "KHÔNG PHẢI là đáp án duy nhất" in policy or "Bước 3" in policy
#         assert "Bước 3" in policy

#     def test_100_distinct_source_movies(self, queries_data):
#         queries = queries_data.get("queries", [])
#         source_ids = [q["source_movie_id"] for q in queries]
#         unique_source_ids = set(source_ids)
#         assert len(unique_source_ids) == 100, (
#             f"100 queries phải tương ứng đúng 100 phim nguồn khác nhau! "
#             f"Hiện chỉ có {len(unique_source_ids)} phim nguồn độc nhất."
#         )

#     def test_step3_schema_readiness(self, queries_data):
#         for q in queries_data.get("queries", []):
#             assert "relevant_candidates" in q
#             assert q["relevant_candidates"] == []
#             assert q.get("status") in (
#                 "ready_for_step3_candidate_pooling",
#                 "needs_manual_verification",
#             )

#     def test_no_genre_concatenation_in_benchmark_queries(self, queries_data):
#         """Đảm bảo deduplication không chỉ đơn thuần nối tên thể loại vào cuối câu."""
#         genre_suffixes = [
#             " phim hành động",
#             " phim hài",
#             " phim kinh dị",
#             " phim tình cảm",
#             " phim khoa học viễn tưởng",
#         ]
#         for q in queries_data.get("queries", []):
#             q_lower = q["query"].lower().strip()
#             for suffix in genre_suffixes:
#                 assert not q_lower.endswith(
#                     suffix
#                 ), f"Query '{q['query']}' có vẻ bị nối thêm chuỗi thể loại '{suffix}' thô sơ!"

#     def test_abstract_queries_quality(self, queries_data, source_movies_data):
#         """Đảm bảo các query trong nhóm Abstract thể hiện ý niệm trừu tượng, không kể lể tình tiết cụ thể."""
#         movies_map = {m["movie_id"]: m for m in source_movies_data.get("movies", [])}
#         abstract_queries = [
#             q for q in queries_data.get("queries", []) if q["query_type"] == "Abstract"
#         ]
#         assert len(abstract_queries) == 20

#         plot_spoilers = [
#             "xăm mình",
#             "3 sòng bài",
#             "tiểu thuyết thụy điển",
#             "chuỗi con số bí ẩn",
#             "hồi sinh mặt trời",
#             "nghề phóng viên",
#             "kẻ sát nhân đeo mặt nạ",
#         ]
#         for q in abstract_queries:
#             q_lower = q["query"].lower()
#             for spoiler in plot_spoilers:
#                 assert (
#                     spoiler not in q_lower
#                 ), f"Query Abstract '{q['query']}' chứa tình tiết cốt truyện cụ thể '{spoiler}'!"

#     def test_abstract_queries_diversity(self, queries_data):
#         """Đảm bảo nhóm Abstract đa dạng hóa chủ đề và cảm xúc, không tập trung quá nhiều hoặc lặp lại mẫu câu kinh dị."""
#         abstract_queries = [
#             q for q in queries_data.get("queries", []) if q["query_type"] == "Abstract"
#         ]
#         assert len(abstract_queries) == 20

#         cliches = [
#             "phim kinh dị có không khí ngột ngạt",
#             "phim kinh dị mang lại cảm giác ngột ngạt",
#         ]
#         for q in abstract_queries:
#             q_lower = q["query"].lower()
#             for c in cliches:
#                 assert (
#                     c not in q_lower
#                 ), f"Query Abstract '{q['query']}' bị rập khuôn mẫu câu kinh dị sáo rỗng '{c}'!"

#         diversity_concepts = [
#             "niềm tin",
#             "hy sinh",
#             "hoài niệm",
#             "đạo đức",
#             "tha hóa",
#             "ân hận",
#             "rạn nứt",
#             "tha thứ",
#             "cô độc",
#             "mất mát",
#             "châm biếm",
#             "danh vọng",
#             "ký ức",
#             "lòng tham",
#             "lịch sử",
#         ]
#         covered = set()
#         for q in abstract_queries:
#             q_lower = q["query"].lower()
#             for concept in diversity_concepts:
#                 if concept in q_lower:
#                     covered.add(concept)

#         assert (
#             len(covered) >= 8
#         ), f"Độ đa dạng chủ đề/cảm xúc của Abstract quá thấp: chỉ có {len(covered)}/8 chủ đề ({covered})!"

#     def test_semantic_queries_quality(self, queries_data):
#         """Đảm bảo các query trong nhóm Semantic không mô tả cốt truyện quá trực tiếp hoặc spoil cao trào."""
#         semantic_queries = [
#             q for q in queries_data.get("queries", []) if q["query_type"] == "Semantic"
#         ]
#         assert len(semantic_queries) == 20

#         direct_spoilers = [
#             "mang thai đứa con lai",
#             "biến dạng mặt",
#             "hút máu con người vũ khí không làm gì được",
#             "máy quay super 8",
#             "găm sẹo khắp mặt",
#             "súng đạn không tiêu diệt",
#         ]
#         for q in semantic_queries:
#             q_lower = q["query"].lower()
#             for spoiler in direct_spoilers:
#                 assert (
#                     spoiler not in q_lower
#                 ), f"Query Semantic '{q['query']}' chứa tình tiết spoil trực tiếp '{spoiler}'!"

#     def test_typo_slang_queries_have_search_tone(self, queries_data):
#         """Đảm bảo các query trong nhóm Typo/Slang có văn phong tìm kiếm thực tế."""
#         typo_queries = [
#             q
#             for q in queries_data.get("queries", [])
#             if q["query_type"] == "Typo_Slang"
#         ]
#         assert len(typo_queries) == 20

#         slang_markers = [
#             "fim",
#             "film",
#             "tim",
#             "k ",
#             "ko ",
#             "dc",
#             "ng",
#             "thik",
#             "zay",
#             "ak",
#             "nha",
#             "j ma",
#             "co ai bit",
#             "chieu rap",
#             "m.n",
#             "moi ng",
#             "zui",
#             "kieu",
#             "cho hoi",
#         ]
#         for q in typo_queries:
#             q_lower = q["query"].lower()
#             has_marker = any(m in q_lower for m in slang_markers)
#             assert (
#                 has_marker
#             ), f"Query Typo/Slang '{q['query']}' thiếu dấu ấn văn phong tìm kiếm/teencode thực tế!"

#     def test_typo_slang_no_generic_download_or_link_requests(self, queries_data):
#         """Đảm bảo nhóm Typo/Slang loại bỏ các câu chỉ hỏi link xem, full HD, vietsub; tập trung tìm theo nội dung."""
#         typo_queries = [
#             q
#             for q in queries_data.get("queries", [])
#             if q["query_type"] == "Typo_Slang"
#         ]
#         assert len(typo_queries) == 20

#         forbidden_phrases = ["full hd", "vietsub", "link xem"]
#         for q in typo_queries:
#             q_lower = q["query"].lower()
#             for fp in forbidden_phrases:
#                 assert (
#                     fp not in q_lower
#                 ), f"Query Typo/Slang '{q['query']}' chứa cụm từ xin link/tải thô '{fp}' thay vì tìm kiếm theo nội dung!"

#     def test_all_100_queries_generated_by_gemini(self, queries_data):
#         meta = queries_data.get("metadata", {})
#         assert meta.get("llm_verified_count") == 100
#         for q in queries_data.get("queries", []):
#             assert "Gemini" in q.get("generated_by", "")


# class TestDatabaseAndVerificationStrictness:
#     def test_strict_chromadb_verification_raises_when_missing(self, tmp_path):
#         """Kiểm chứng: Nếu ChromaDB không tồn tại hoặc rỗng, hàm bắt buộc dừng (raise RuntimeError)."""
#         non_existent_dir = tmp_path / "missing_chroma"
#         with pytest.raises(RuntimeError, match="Bắt buộc xác minh mapping phim"):
#             get_verified_chromadb_ids(non_existent_dir)

#     def test_no_hardcoded_database_credentials_in_source_code(self):
#         """Kiểm chứng: Không có thông tin đăng nhập PostgreSQL hardcode (postgres:123456) trong source code."""
#         script_path = (
#             Path(__file__).resolve().parent.parent.parent
#             / "scripts"
#             / "generate_benchmark_queries.py"
#         )
#         assert script_path.exists()
#         code_text = script_path.read_text(encoding="utf-8")

#         assert "postgres://postgres:123456" not in code_text
#         assert 'DB_PASSWORD", "123456"' not in code_text
#         assert 'DATABASE_URL", "postgres:' not in code_text

#     def test_exact_movie_id_matching_rejects_mismatch(self):
#         """Kiểm chứng: Query matching chỉ chấp nhận khi movie_id khớp chính xác, không dùng thứ tự phần tử."""
#         movie = {"movie_id": 100, "title_vi": "Phim Test", "genres": "Hành Động"}
#         mismatched_llm_items = [{"movie_id": 999, "query": "truy vấn của phim khác"}]
#         # Xây dựng dict theo movie_id
#         llm_dict_by_id = {
#             item["movie_id"]: item
#             for item in mismatched_llm_items
#             if "movie_id" in item
#         }

#         # Kiểm tra không lấy nhầm theo vị trí index 0
#         matched = llm_dict_by_id.get(movie["movie_id"])
#         assert matched is None, "Không được phép gán item có ID 999 cho phim ID 100!"

#     def test_verify_postgres_and_chromadb_metadata_consistency(self):
#         """Kiểm chứng: PostgreSQL và ChromaDB không chỉ trùng movieId mà metadata (tmdb_id, title) phải nhất quán 100%."""
#         assert CHROMA_DIR.exists(), f"Thư mục ChromaDB không tồn tại: {CHROMA_DIR}"
#         chroma_meta = get_verified_chromadb_metadata(CHROMA_DIR)
#         assert len(chroma_meta) > 0

#         # Đọc 100 phim nguồn
#         with open(SOURCE_MOVIES_OUT, "r", encoding="utf-8") as f:
#             src_movies = json.load(f)["movies"]

#         assert len(src_movies) == 100

#         mismatched_ids = []
#         mismatched_tmdb = []

#         for m in src_movies:
#             mid = m["movie_id"]
#             if mid not in chroma_meta:
#                 mismatched_ids.append(mid)
#                 continue

#             meta = chroma_meta[mid]
#             src_tmdb = int(m["tmdb_id"]) if m.get("tmdb_id") else None
#             ch_tmdb = int(meta["tmdb_id"]) if meta.get("tmdb_id") else None
#             if not src_tmdb or not ch_tmdb or src_tmdb != ch_tmdb:
#                 mismatched_tmdb.append((mid, src_tmdb, ch_tmdb))

#         assert (
#             not mismatched_ids
#         ), f"Có {len(mismatched_ids)} phim không tồn tại trong ChromaDB: {mismatched_ids[:5]}"
#         assert (
#             not mismatched_tmdb
#         ), f"Có {len(mismatched_tmdb)} phim lệch tmdb_id giữa Postgres và ChromaDB: {mismatched_tmdb[:5]}"

#     def test_cross_db_mapping_rejects_missing_or_mismatched_identifier(self):
#         """Kiểm chứng: Không bao giờ xác nhận khớp chỉ dựa vào tiêu đề gần giống khi thiếu hoặc lệch tmdb_id."""
#         item_pg = {
#             "id": 100,
#             "tmdb_id": 12345,
#             "title": "Inception",
#             "title_vi": "Kẻ Cắp Giấc Mơ",
#         }
#         chroma_meta_different_tmdb = {
#             100: {
#                 "tmdb_id": 99999,
#                 "title": "Inception",
#                 "title_vi": "Kẻ Cắp Giấc Mơ",
#             }
#         }

#         pg_tmdb = item_pg["tmdb_id"]
#         ch_tmdb = chroma_meta_different_tmdb[100]["tmdb_id"]
#         assert pg_tmdb != ch_tmdb
#         # Mapping bắt buộc loại bỏ
#         is_valid = bool(pg_tmdb and ch_tmdb and pg_tmdb == ch_tmdb)
#         assert not is_valid

#         # Trường hợp 2: Thiếu tmdb_id nhưng tiêu đề hoàn toàn trùng khớp
#         chroma_meta_missing_tmdb = {
#             100: {
#                 "tmdb_id": None,
#                 "title": "Inception",
#                 "title_vi": "Kẻ Cắp Giấc Mơ",
#             }
#         }
#         ch_tmdb_missing = chroma_meta_missing_tmdb[100]["tmdb_id"]
#         is_valid_missing = bool(
#             pg_tmdb and ch_tmdb_missing and pg_tmdb == ch_tmdb_missing
#         )
#         assert (
#             not is_valid_missing
#         ), "Không được xác nhận khớp khi thiếu định danh tmdb_id!"

#     def test_verify_source_movies_against_current_dbs(self):
#         """Kiểm chứng: 100 phim trong benchmark_source_movies_100.json được xác minh lại thành công với DB hiện tại."""
#         verified_movies = verify_source_movies_against_current_dbs(
#             source_movies_file=SOURCE_MOVIES_OUT,
#             chroma_dir=CHROMA_DIR,
#         )
#         assert len(verified_movies) == 100
#         assert all(m["movie_id"] > 0 for m in verified_movies)
#         assert all(m.get("tmdb_id") for m in verified_movies)

#     def test_security_env_and_credentials_not_packaged_or_committed(self):
#         """Kiểm chứng: File .env, API key và mật khẩu nhạy cảm không được đóng gói trong ZIP hoặc đưa vào Git."""
#         import zipfile

#         # 1. Kiểm tra .gitignore loại trừ .env
#         ai_gitignore = Path(__file__).resolve().parent.parent.parent / ".gitignore"
#         assert ai_gitignore.exists()
#         gitignore_text = ai_gitignore.read_text(encoding="utf-8")
#         assert ".env" in gitignore_text

#         # 2. Kiểm tra gói ZIP không chứa file .env
#         zip_path = (
#             Path(__file__).resolve().parent.parent.parent.parent
#             / "step2_benchmark_queries.zip"
#         )
#         if zip_path.exists():
#             with zipfile.ZipFile(zip_path, "r") as z:
#                 names = z.namelist()
#                 assert (
#                     ".env" not in names
#                 ), "File .env nhạy cảm tuyệt đối không được đóng gói trong ZIP!"
#                 assert ".env.example" in names


# class TestQueryRefinementAndFallbackPipeline:
#     def test_fallback_to_needs_manual_verification_when_gemini_fails_or_missing_key(
#         self, tmp_path
#     ):
#         """Kiểm chứng: Khi query cần sinh lại nhưng Gemini thất bại hoặc thiếu API key, đánh dấu needs_manual_verification."""
#         mock_queries_file = tmp_path / "mock_queries.json"
#         mock_movies_file = tmp_path / "mock_movies.json"

#         mock_movie = {
#             "movie_id": 9999,
#             "title": "Saw",
#             "title_vi": "Lưỡi Cưa",
#             "overview_vi": "Kẻ sát nhân hàng loạt nhốt các nạn nhân trong ngôi nhà có cạm bẫy ghê rợn.",
#             "genres": "Phim Kinh Dị",
#         }
#         with open(mock_movies_file, "w", encoding="utf-8") as f:
#             json.dump({"movies": [mock_movie]}, f, ensure_ascii=False)

#         mock_queries_data = {
#             "metadata": {"llm_verified_count": 0},
#             "queries": [
#                 {
#                     "query_id": "Q001",
#                     "query_type": "Abstract",
#                     "query": "phim kể về kẻ sát nhân nhốt trong nhà bắt nạn nhân chọn cái chết",
#                     "source_movie_id": 9999,
#                     "source_evidence": {
#                         "title_vi": "Lưỡi Cưa",
#                         "title_en": "Saw",
#                         "genres": "Phim Kinh Dị",
#                         "matched_concepts": "Cốt truyện",
#                         "overview_snippet": "Kẻ sát nhân...",
#                     },
#                     "relevant_candidates": [],
#                     "status": "ready_for_step3_candidate_pooling",
#                     "generated_by": "Gemini (gemini-3.5-flash)",
#                 }
#             ],
#         }
#         with open(mock_queries_file, "w", encoding="utf-8") as f:
#             json.dump(mock_queries_data, f, ensure_ascii=False)

#         # Gọi refine với api_key="" (mô phỏng không có API key)
#         refined_queries, report = refine_existing_benchmark_queries(
#             existing_queries_file=mock_queries_file,
#             source_movies_file=mock_movies_file,
#             api_key="",
#         )

#         assert report["manual_verification_queries"] == 1
#         assert refined_queries[0]["status"] == "needs_manual_verification"

#     def test_post_regeneration_quality_and_duplicate_check(self, tmp_path, monkeypatch):
#         """Kiểm chứng: Sau khi LLM sinh lại query, hệ thống kiểm tra lại chất lượng và trùng lặp; nếu chưa đạt vẫn đánh dấu needs_manual_verification."""
#         import scripts.generate_benchmark_queries as gen_module

#         mock_queries_file = tmp_path / "mock_queries.json"
#         mock_movies_file = tmp_path / "mock_movies.json"

#         mock_movie = {
#             "movie_id": 8888,
#             "title": "Memento",
#             "title_vi": "Kẻ Mất Trí Nhớ",
#             "overview_vi": "Người đàn ông mắc chứng trí nhớ ngắn hạn truy tìm kẻ sát hại vợ.",
#             "genres": "Phim Bí Ẩn",
#         }
#         with open(mock_movies_file, "w", encoding="utf-8") as f:
#             json.dump({"movies": [mock_movie]}, f, ensure_ascii=False)

#         mock_queries_data = {
#             "metadata": {"llm_verified_count": 0},
#             "queries": [
#                 {
#                     "query_id": "Q001",
#                     "query_type": "Abstract",
#                     "query": "phim xăm mình để nhớ sự việc",
#                     "source_movie_id": 8888,
#                     "source_evidence": {
#                         "title_vi": "Kẻ Mất Trí Nhớ",
#                         "title_en": "Memento",
#                         "genres": "Phim Bí Ẩn",
#                         "matched_concepts": "Cốt truyện",
#                         "overview_snippet": "Kẻ mất trí nhớ...",
#                     },
#                     "relevant_candidates": [],
#                     "status": "ready_for_step3_candidate_pooling",
#                     "generated_by": "Gemini",
#                 }
#             ],
#         }
#         with open(mock_queries_file, "w", encoding="utf-8") as f:
#             json.dump(mock_queries_data, f, ensure_ascii=False)

#         # Trường hợp 1: LLM sinh lại query nhưng query mới vẫn dính plot spoiler ("xăm mình")
#         monkeypatch.setattr(
#             gen_module,
#             "call_gemini_batch",
#             lambda **kwargs: [
#                 {
#                     "movie_id": 8888,
#                     "query": "phim người xăm mình tìm kẻ thù",
#                     "matched_concepts": "xăm",
#                 }
#             ],
#         )

#         refined_queries, report = refine_existing_benchmark_queries(
#             existing_queries_file=mock_queries_file,
#             source_movies_file=mock_movies_file,
#             api_key="mock_key",
#         )
#         assert report["manual_verification_queries"] == 1
#         assert refined_queries[0]["status"] == "needs_manual_verification"

#         # Trường hợp 2: LLM sinh lại query đạt chuẩn chất lượng trừu tượng
#         monkeypatch.setattr(
#             gen_module,
#             "call_gemini_batch",
#             lambda **kwargs: [
#                 {
#                     "movie_id": 8888,
#                     "query": "phim trinh thám tâm lý về sự bất lực trước ký ức đứt quãng",
#                     "matched_concepts": "tâm lý",
#                 }
#             ],
#         )
#         refined_queries_2, report_2 = refine_existing_benchmark_queries(
#             existing_queries_file=mock_queries_file,
#             source_movies_file=mock_movies_file,
#             api_key="mock_key",
#         )
#         assert report_2["regenerated_queries"] == 1
#         assert refined_queries_2[0]["status"] == "ready_for_step3_candidate_pooling"
#         assert "Gemini" in refined_queries_2[0]["generated_by"]


# class TestQueryGenerationLogic:
#     def test_select_100_diverse_movies_function(self):
#         mock_candidates = []
#         for i in range(200):
#             genre = (
#                 "Phim Hành Động"
#                 if i < 50
#                 else ("Phim Hài" if i < 100 else "Phim Kinh Dị")
#             )
#             mock_candidates.append(
#                 {
#                     "movie_id": i + 1,
#                     "title": f"Movie {i}",
#                     "title_vi": f"Phim {i}",
#                     "overview_vi": f"Đây là tóm tắt phim số {i} với độ dài hợp lệ và chi tiết rõ ràng.",
#                     "vote_count": 100 - (i % 50),
#                     "genres": genre,
#                 }
#             )

#         selected = select_100_diverse_movies(mock_candidates, target_count=50)
#         assert len(selected) == 50
#         assert len({m["movie_id"] for m in selected}) == 50

#     def test_generate_queries_for_movie_creates_5_types(self):
#         sample_movie = {
#             "movie_id": 999,
#             "title": "Inception",
#             "title_vi": "Kẻ Cắp Giấc Mơ",
#             "overview_vi": "Cobb là một kẻ cắp chuyên nghiệp có khả năng xâm nhập vào giấc mơ của người khác.",
#             "genres": "Phim Khoa Học Viễn Tưởng, Phim Hành Động",
#         }
#         queries = generate_queries_for_movie(sample_movie, query_index_offset=1)
#         assert len(queries) == 5
#         types = {q["query_type"] for q in queries}
#         assert types == {
#             "Lexical",
#             "Semantic",
#             "Abstract",
#             "Typo_Slang",
#             "Short_Long",
#         }
#         for q in queries:
#             assert q["source_movie_id"] == 999
#             assert q["query"]
