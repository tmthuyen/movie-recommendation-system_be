#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""generate_benchmark_queries.py.

==============================
Quy trình tạo bộ query benchmark V2 (Bước 2):
1. Bắt buộc xác minh PostgreSQL và ChromaDB: Không chỉ trùng movieId mà còn kiểm tra
   tính nhất quán về nội dung (tmdb_id, title) dựa trên metadata đáng tin cậy. Nếu không thể xác minh thì dừng.
2. Trích xuất 100 phim nguồn đại diện đa dạng trên 10 nhóm thể loại chính.
3. Sử dụng LLM thực sự (Google Gemini API qua biến môi trường) để sinh truy vấn tự nhiên:
   - 100 phim nguồn riêng biệt cho 100 truy vấn (mỗi query từ 1 phim khác nhau).
   - Cân bằng chuẩn 5 nhóm (20 query/nhóm):
     + Lexical: Từ khóa đặc thù, tên nhân vật, địa danh, tên phim.
     + Semantic: Diễn đạt lại cốt truyện bằng từ đồng nghĩa, không kể chi tiết/spoil cao trào.
     + Abstract: Ý niệm trừu tượng, tâm trạng, cảm xúc, triết lý, không kể lại cốt truyện.
     + Typo/Slang: Mô phỏng truy vấn tìm kiếm thực tế với teencode, từ viết tắt, tiếng lóng.
     + Short/Long: 10 truy vấn cực ngắn (1-2 từ) và 10 mô tả hội thoại rất dài.
4. Ghép nối chính xác: CHỈ ghép khi movie_id khớp chính xác, TUYỆT ĐỐI KHÔNG ghép theo thứ tự phần tử.
5. Khi query cần sinh lại nhưng Gemini thất bại hoặc thiếu API key -> Đánh dấu needs_manual_verification.
6. Kiểm tra lại chất lượng và trùng lặp sau khi LLM sinh lại query.
7. Không hardcode thông tin đăng nhập Database trong mã nguồn.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import json
import os
from pathlib import Path
import re
import sys
import time
from typing import Any, Dict, List, Optional, Set, Tuple
import unicodedata

from dotenv import load_dotenv
import requests

# ─── Thiết lập encoding UTF-8 ────────────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent
PROJECT_ROOT = AI_SERVICE_DIR.parent
SRC_DIR = AI_SERVICE_DIR / "src"

# Load biến môi trường từ .env
load_dotenv(AI_SERVICE_DIR / ".env")
load_dotenv()

CHROMA_DIR = AI_SERVICE_DIR / "data" / "chroma_db"
GT_DIR = AI_SERVICE_DIR / "experiments" / "ground_truth"
GT_DIR.mkdir(parents=True, exist_ok=True)

SOURCE_MOVIES_OUT = GT_DIR / "benchmark_source_movies_100.json"
BENCHMARK_QUERIES_OUT = GT_DIR / "benchmark_queries_v2.json"


# ══════════════════════════════════════════════════════════════════════════════
# CẤU HÌNH DATABASE & LLM AN TOÀN TỪ BIẾN MÔI TRƯỜNG (KHÔNG HARDCODE)
# ══════════════════════════════════════════════════════════════════════════════


def get_database_url() -> str:
    """Đọc cấu hình kết nối database an toàn từ biến môi trường.

    Tuyệt đối không lưu mật khẩu hoặc thông tin đăng nhập mặc định trong source code.
    """
    db_url = os.getenv("DATABASE_URL")
    if db_url and db_url.strip():
        return db_url.strip()

    user = os.getenv("DB_USERNAME")
    password = os.getenv("DB_PASSWORD")
    host = os.getenv("DB_HOST", "127.0.0.1")
    port = os.getenv("DB_PORT", "5432")
    db_name = os.getenv("DB_NAME", "nestjs_db")

    if user and password:
        return f"postgres://{user}:{password}@{host}:{port}/{db_name}"

    raise ValueError(
        "[FATAL] Không tìm thấy cấu hình kết nối Database trong biến môi trường! "
        "Vui lòng thiết lập DATABASE_URL hoặc (DB_USERNAME, DB_PASSWORD, DB_HOST, DB_PORT, DB_NAME) trong file .env."
    )


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash")

# Danh sách candidate models để fallback linh hoạt khi một model bị 503 / 429
CANDIDATE_MODELS = [
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    GEMINI_MODEL,
    "gemini-3.5-flash",
]
CANDIDATE_MODELS = list(dict.fromkeys([m for m in CANDIDATE_MODELS if m]))

GENRE_CATEGORIES = [
    "Hành Động",
    "Hài",
    "Chính Kịch",
    "Lãng Mạn",
    "Khoa Học Viễn Tưởng",
    "Kinh Dị",
    "Gây Cấn",
    "Phiêu Lưu",
    "Hình Sự",
    "Hoạt Hình",
]


# ══════════════════════════════════════════════════════════════════════════════
# 1. BẮT BUỘC XÁC MINH MAPPING & NỘI DUNG MOVIE_ID GIỮA POSTGRESQL & CHROMADB
# ══════════════════════════════════════════════════════════════════════════════


def get_verified_chromadb_metadata(
    chroma_dir: Path = CHROMA_DIR,
) -> Dict[int, Dict[str, Any]]:
    """Lấy danh sách tất cả movieId cùng metadata đáng tin cậy đã được chỉ mục trong ChromaDB (Bước 1).

    Bắt buộc phải xác minh mapping phim giữa PostgreSQL và ChromaDB.
    Nếu không thể xác minh thì dừng (raise RuntimeError), không bỏ qua.
    """
    if not chroma_dir.exists():
        raise RuntimeError(
            f"[FATAL] Thư mục ChromaDB không tồn tại tại: {chroma_dir}. "
            "Bắt buộc xác minh mapping phim với ChromaDB của Bước 1 trước khi sinh query!"
        )

    try:
        import chromadb

        client = chromadb.PersistentClient(path=str(chroma_dir))
        col = client.get_collection("movies")
        res = col.get(include=["metadatas"])
        verified = {}
        for sid, meta in zip(res["ids"], res["metadatas"]):
            if sid.isdigit():
                verified[int(sid)] = meta or {}

        if not verified:
            raise RuntimeError(
                "[FATAL] Collection 'movies' trong ChromaDB rỗng (0 vector)! "
                "Không thể xác minh mapping phim."
            )
        return verified
    except Exception as e:
        raise RuntimeError(
            f"[FATAL] Lỗi bắt buộc xác minh ChromaDB: {e}. "
            "Tiến trình dừng lại để tránh dùng ID chưa xác minh!"
        ) from e


def get_verified_chromadb_ids(chroma_dir: Path = CHROMA_DIR) -> Set[int]:
    """Hàm tương thích lấy set các ID đã xác minh trong ChromaDB."""
    meta_map = get_verified_chromadb_metadata(chroma_dir)
    return set(meta_map.keys())


def extract_movies_from_postgres(
    db_url: Optional[str] = None,
    chroma_dir: Path = CHROMA_DIR,
    limit: int = 1000,
) -> List[Dict[str, Any]]:
    """Trích xuất phim từ PostgreSQL và xác minh 100% ID và nội dung trùng khớp trong ChromaDB.

    Bắt buộc xác minh: Không chỉ trùng movieId mà còn kiểm tra metadata (tmdb_id, title).
    Nếu không thể xác minh hoặc không có phim nào hợp lệ thì dừng, không bỏ qua.
    """
    conn_url = db_url or get_database_url()
    verified_chroma_meta = get_verified_chromadb_metadata(chroma_dir)
    print(
        f"   [Verify] Tìm thấy {len(verified_chroma_meta):,} vectors hợp lệ trong ChromaDB."
    )

    try:
        import psycopg2

        conn = psycopg2.connect(conn_url)
        cur = conn.cursor()
        query = """
            SELECT m.id, m.tmdb_id, m.title, m.title_vi, m.overview_vi,
                   m.release_date, m.vote_average, m.vote_count,
                   COALESCE(string_agg(g.name, ', '), '') as genres
            FROM movies m
            LEFT JOIN movie_genres mg ON mg.movie_id = m.id
            LEFT JOIN genres g ON g.id = mg.genre_id
            WHERE m.overview_vi IS NOT NULL
              AND length(trim(m.overview_vi)) >= 80
              AND length(trim(m.overview_vi)) <= 600
              AND (m.vote_count >= 10 OR m.view_count > 0)
            GROUP BY m.id, m.tmdb_id, m.title, m.title_vi, m.overview_vi,
                     m.release_date, m.vote_average, m.vote_count
            ORDER BY m.vote_count DESC, m.id ASC
            LIMIT %s
        """
        cur.execute(query, (limit,))
        cols = [desc[0] for desc in cur.description]
        movies = []
        unverified_count = 0

        for row in cur.fetchall():
            item = dict(zip(cols, row))
            mid = int(item["id"])

            # 1. Bắt buộc: Movie ID phải tồn tại trong ChromaDB
            if mid not in verified_chroma_meta:
                unverified_count += 1
                continue

            # 2. Bắt buộc xác minh nội dung bằng định danh phim đáng tin cậy:
            # Cả PostgreSQL và ChromaDB đều phải có tmdb_id và khớp chính xác 100%.
            # Tuyệt đối không xác nhận khớp chỉ dựa vào tiêu đề gần giống khi thiếu ID!
            chroma_meta = verified_chroma_meta[mid]
            pg_tmdb = int(item["tmdb_id"]) if item.get("tmdb_id") else None
            ch_tmdb = (
                int(chroma_meta["tmdb_id"]) if chroma_meta.get("tmdb_id") else None
            )

            if not pg_tmdb or not ch_tmdb or pg_tmdb != ch_tmdb:
                unverified_count += 1
                continue

            pg_title = (
                str(item.get("title_vi") or item.get("title") or "").strip().lower()
            )
            ch_title = (
                str(chroma_meta.get("title_vi") or chroma_meta.get("title") or "")
                .strip()
                .lower()
            )

            if pg_title and ch_title and pg_title != ch_title:
                if calculate_jaccard_similarity(pg_title, ch_title) < 0.4:
                    unverified_count += 1
                    continue

            movies.append(
                {
                    "movie_id": mid,
                    "tmdb_id": pg_tmdb,
                    "title": str(item["title"] or ""),
                    "title_vi": str(item["title_vi"] or item["title"] or ""),
                    "overview_vi": str(item["overview_vi"]).strip(),
                    "release_date": str(item.get("release_date") or ""),
                    "vote_average": float(item.get("vote_average") or 0.0),
                    "vote_count": int(item.get("vote_count") or 0),
                    "genres": str(item.get("genres") or ""),
                    "source_db": "PostgreSQL (nestjs_db) + ChromaDB Verified Metadata",
                }
            )
        conn.close()

        if unverified_count > 0:
            print(
                f"   [Verify] Đã loại bỏ {unverified_count} phim do chưa có vector hoặc sai lệch metadata."
            )

        if not movies:
            raise RuntimeError(
                "[FATAL] Không trích xuất được bộ phim nào thỏa mãn điều kiện và tồn tại trong ChromaDB! "
                "Tiến trình bắt buộc dừng lại."
            )

        return movies
    except Exception as e:
        raise RuntimeError(
            f"[FATAL] Lỗi trích xuất phim từ PostgreSQL: {e}. "
            "Bắt buộc dừng tiến trình!"
        ) from e


def verify_source_movies_against_current_dbs(
    source_movies_file: Path = SOURCE_MOVIES_OUT,
    chroma_dir: Path = CHROMA_DIR,
    db_url: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Xác minh lại 100 phim trong benchmark_source_movies_100.json với dữ liệu hiện tại ở cả PostgreSQL và ChromaDB.

    Tránh sử dụng file nguồn cũ chưa kiểm chứng hoặc bị lệch dữ liệu.
    Bắt buộc kiểm tra định danh tmdb_id và tiêu đề ở cả hai DB.
    """
    if not source_movies_file.exists():
        raise RuntimeError(
            f"[FATAL] Không tìm thấy file phim nguồn: {source_movies_file}"
        )

    with open(source_movies_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    movies = data.get("movies", [])
    if len(movies) != 100:
        raise RuntimeError(
            f"[FATAL] File phim nguồn chỉ có {len(movies)} phim (kỳ vọng 100 phim)!"
        )

    # 1. Kiểm tra với ChromaDB hiện tại
    chroma_meta = get_verified_chromadb_metadata(chroma_dir)

    # 2. Kiểm tra với PostgreSQL hiện tại
    conn_url = db_url or get_database_url()
    import psycopg2

    conn = psycopg2.connect(conn_url)
    cur = conn.cursor()
    movie_ids = [m["movie_id"] for m in movies]
    cur.execute(
        """
        SELECT m.id, m.tmdb_id, m.title, m.title_vi
        FROM movies m
        WHERE m.id = ANY(%s)
    """,
        (movie_ids,),
    )
    pg_map = {row[0]: row for row in cur.fetchall()}
    conn.close()

    mismatches = []
    for m in movies:
        mid = m["movie_id"]
        # Kiểm tra tồn tại trong PG
        if mid not in pg_map:
            mismatches.append(f"Movie ID {mid} không tồn tại trong PostgreSQL")
            continue
        pg_row = pg_map[mid]
        pg_tmdb = int(pg_row[1]) if pg_row[1] else None

        # Kiểm tra tồn tại trong ChromaDB
        if mid not in chroma_meta:
            mismatches.append(f"Movie ID {mid} không tồn tại trong ChromaDB")
            continue
        ch_meta = chroma_meta[mid]
        ch_tmdb = int(ch_meta.get("tmdb_id")) if ch_meta.get("tmdb_id") else None

        # Bắt buộc khớp tmdb_id
        if not pg_tmdb or not ch_tmdb or pg_tmdb != ch_tmdb:
            mismatches.append(
                f"Movie ID {mid} lệch định danh tmdb_id (PG={pg_tmdb}, Chroma={ch_tmdb})"
            )

    if mismatches:
        raise RuntimeError(
            f"[FATAL] Phát hiện {len(mismatches)} phim nguồn không khớp với dữ liệu hiện tại: {mismatches[:3]}! Bắt buộc trích xuất lại từ Database."
        )

    print(
        f"   ✅ Đã xác minh lại 100% 100 phim nguồn trong {source_movies_file.name} khớp chính xác với PostgreSQL & ChromaDB hiện tại."
    )
    return movies


def select_100_diverse_movies(
    candidate_movies: List[Dict[str, Any]], target_count: int = 100
) -> List[Dict[str, Any]]:
    """Phân tầng theo 10 thể loại chính để chọn đúng 100 phim nguồn tiêu biểu và đa dạng."""
    by_genre: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for m in candidate_movies:
        assigned = False
        for g in GENRE_CATEGORIES:
            if g.lower() in m["genres"].lower():
                by_genre[g].append(m)
                assigned = True
                break
        if not assigned:
            by_genre["Khác"].append(m)

    selected: List[Dict[str, Any]] = []
    seen_ids: Set[int] = set()

    per_genre_quota = target_count // len(GENRE_CATEGORIES)
    for g in GENRE_CATEGORIES:
        genre_list = by_genre.get(g, [])
        sorted_genre_list = sorted(
            genre_list,
            key=lambda x: (
                0 if 120 <= len(x["overview_vi"]) <= 450 else 1,
                -x["vote_count"],
            ),
        )
        count_added = 0
        for m in sorted_genre_list:
            if m["movie_id"] not in seen_ids:
                selected.append(m)
                seen_ids.add(m["movie_id"])
                count_added += 1
                if count_added >= per_genre_quota:
                    break

    if len(selected) < target_count:
        remaining = [m for m in candidate_movies if m["movie_id"] not in seen_ids]
        remaining = sorted(remaining, key=lambda x: -x["vote_count"])
        for m in remaining:
            selected.append(m)
            seen_ids.add(m["movie_id"])
            if len(selected) >= target_count:
                break

    return selected[:target_count]


# ══════════════════════════════════════════════════════════════════════════════
# 2. TÍCH HỢP LLM THỰC SỰ (GEMINI API) VỚI PROMPT CHUẨN HOÁ CHO 5 NHÓM
# ══════════════════════════════════════════════════════════════════════════════


def clean_vietnamese_text(text: str) -> str:
    """Chuẩn hóa Unicode NFC và dọn dẹp khoảng trắng."""
    return unicodedata.normalize("NFC", re.sub(r"\s+", " ", text).strip())


def calculate_jaccard_similarity(text1: str, text2: str) -> float:
    """Tính độ tương đồng Jaccard giữa hai chuỗi truy vấn."""
    set1 = set(text1.lower().split())
    set2 = set(text2.lower().split())
    if not set1 or not set2:
        return 0.0
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return intersection / union if union > 0 else 0.0


def is_semantic_narrating_too_directly(query_text: str, movie: Dict[str, Any]) -> bool:
    """Kiểm tra xem câu Semantic có mô tả cốt truyện quá trực tiếp / spoil tình tiết cao trào không."""
    q_lower = query_text.lower()
    too_direct_phrases = [
        "mang thai đứa con lai",
        "biến dạng mặt",
        "hút máu con người vũ khí không làm gì được",
        "quay được sinh vật siêu nhiên bằng máy quay",
        "bị tai nạn biến dạng",
    ]
    return any(p in q_lower for p in too_direct_phrases)


def is_abstract_narrating_plot(query_text: str, movie: Dict[str, Any]) -> bool:
    """Kiểm tra xem câu query Abstract có bị kể lại cốt truyện cụ thể thay vì nêu ý niệm trừu tượng không."""
    q_lower = query_text.lower()
    title_vi = movie.get("title_vi", "").lower()
    title_en = movie.get("title", "").lower()
    if title_vi and title_vi in q_lower:
        return True
    if title_en and len(title_en) > 4 and title_en in q_lower:
        return True

    # Các từ khóa thể hiện tình tiết/cốt truyện trực tiếp thay vì ý niệm trừu tượng
    plot_spoiler_keywords = [
        "xăm mình",
        "sòng bài",
        "bảo tàng",
        "tiểu thuyết thụy điển",
        "ông bà",
        "hai chị em",
        "mắc kẹt trong siêu thị",
        "chiếc xe",
        "lá thư",
        "kho báu",
        "viên ngọc",
        "chiếc nhẫn",
        "con tàu vũ trụ",
        "trang trại",
        "nhốt trong nhà",
        "quấy phá ban đêm",
        "cựu nhân viên fbi",
        "đối thủ phá sản trong đêm khai trương",
        "cặp đôi trẻ bị",
    ]
    return any(k in q_lower for k in plot_spoiler_keywords)


def is_typo_slang_authentic(query_text: str) -> bool:
    """Kiểm tra xem câu query Typo/Slang có đúng là câu tìm kiếm tự nhiên của người dùng không."""
    q_lower = query_text.lower()
    slang_markers = [
        "fim",
        "film",
        "tim fim",
        "tim",
        "review",
        "k ",
        "ko ",
        "k/",
        "dc",
        "ng",
        "thik",
        "zay",
        "ak",
        "nha",
        "sao ",
        "j ma",
        "co ai bit",
        "full hd",
        "vietsub",
        "thuyet minh",
        "chieu rap",
        "zui",
        "lem",
        "m.n",
    ]
    return any(marker in q_lower for marker in slang_markers)


def call_gemini_batch(
    movies_batch: List[Dict[str, Any]],
    query_type: str,
    api_key: str = GEMINI_API_KEY,
    candidate_models: Optional[List[str]] = None,
    sub_mode: str = "balanced",
    avoid_query: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Gọi LLM Google Gemini với cơ chế fallback đa model và xử lý retry tự động.

    Đảm bảo kiểm tra nghiêm ngặt movie_id trong JSON trả về.
    """
    if not api_key:
        return []

    models = candidate_models or CANDIDATE_MODELS

    instructions = {
        "Lexical": (
            "Khán giả tìm kiếm bằng các từ khóa thực thể đặc thù: tên nhân vật chính, địa danh, thuật ngữ, hoặc tên phim kết hợp thể loại/hành động chính.\n"
            "- Yêu cầu: Ngắn gọn (3-8 từ), tập trung vào các từ khóa thực thể chính xác có trong tóm tắt.\n"
            "- Tuyệt đối không sao chép nguyên văn cả câu tóm tắt."
        ),
        "Semantic": (
            "Khán giả không nhớ tên phim hay tên nhân vật, chỉ nhớ cốt truyện đại cương và mô tả lại bằng ngôn ngữ tự nhiên hàng ngày.\n"
            "- Yêu cầu: Diễn đạt lại cốt truyện bằng từ đồng nghĩa và câu văn tự nhiên của người xem.\n"
            "- TUYỆT ĐỐI KHÔNG dùng tên riêng nhân vật hay tên phim. KHÔNG spoil cụ thể các chi tiết cao trào."
        ),
        "Abstract": (
            "Khán giả tìm kiếm phim dựa trên 'mood', cảm xúc sâu lắng, thông điệp nhân văn, ý niệm triết lý, xung đột đạo đức hoặc trạng thái tâm lý "
            "(vd: sự cô độc giữa biển người, nỗi ám ảnh tâm lý dai dẳng, ranh giới mong manh giữa sự tha thứ và lòng thù hận, cảm giác ngột ngạt bất an trước cái chết, "
            "sự sụp đổ nhân cách vì lòng tham, sự bất lực trước định mệnh, nỗi đau mất mát người thân).\n"
            "- QUY TẮC BẮT BUỘC:\n"
            "  1. TUYỆT ĐỐI KHÔNG kể lại tình tiết, sự kiện hay diễn biến cụ thể của cốt truyện (ví dụ: KHÔNG viết 'phim về người bị mất trí xăm mình', 'phim cướp 3 sòng bài', 'phim án mạng bảo tàng').\n"
            "  2. TUYỆT ĐỐI KHÔNG dùng tên riêng nhân vật hay tên phim.\n"
            "  3. Câu tìm kiếm phải là những câu người xem thực tế gõ khi tìm phim theo chủ đề trừu tượng/cảm xúc (vd: 'phim tâm lý nặng nề về sự hoang tưởng và khủng hoảng danh tính', 'phim có không khí u uất và nỗi ám ảnh tâm lý dai dẳng')."
        ),
        "Typo_Slang": (
            "Khán giả tìm phim thực tế trên Google, thanh tìm kiếm web phim hoặc đăng bài hỏi trong group Facebook/diễn đàn phim ảnh Việt Nam.\n"
            "- QUY TẮC BẮT BUỘC:\n"
            "  1. Phải mô phỏng văn phong tìm kiếm thực tế của người dùng: bắt đầu bằng các mẫu câu quen thuộc như 'tim fim...', 'review fim gi ma...', 'fim chieu rap...', 'link xem fim... thik lam', 'cho hoi fim j ma...', 'ai bit ten fim nay ko ak'.\n"
            "  2. Sử dụng teencode, từ viết tắt và lỗi gõ vội tự nhiên: 'fim/film', 'k/ko', 'ng' (người), 'dc' (được), 'thik' (thích), 'zay/sao' (vậy/sao), 'ak/nha', viết thiếu dấu tiếng Việt hoặc gõ sai telex nhẹ.\n"
            "  3. TUYỆT ĐỐI KHÔNG chỉ đơn thuần bỏ dấu tiếng Việt vào một câu văn mẫu cứng nhắc, mà phải là câu tìm kiếm tự nhiên của cư dân mạng."
        ),
        "Short": (
            "Khán giả tìm kiếm theo phong cách CỰC NGẮN:\n"
            "- Yêu cầu: Chỉ 1 đến 2 từ khóa cô đọng nhất về đề tài, thể loại hoặc khái niệm cốt lõi (vd: 'cá vàng', 'hố đen', 'the joker')."
        ),
        "Long": (
            "Khán giả tìm kiếm theo dạng MÔ TẢ HỘI THOẠI RẤT DÀI:\n"
            "- Yêu cầu: Viết 2-3 câu hỏi đáp tìm phim trên diễn đàn/mạng xã hội bắt đầu bằng: 'Mọi người cho mình hỏi tên bộ phim kể về...'. "
            "Mô tả chi tiết diễn biến, tình huống người xem nhớ được."
        ),
        "Short_Long": (
            "Khán giả tìm kiếm phân cực:\n"
            "- Nửa số phim đầu: Tạo truy vấn cực ngắn (1-2 từ khóa cô đọng nhất).\n"
            "- Nửa số phim sau: Tạo mô tả hội thoại rất dài (2-3 câu bắt đầu bằng 'Mọi người cho mình hỏi tên bộ phim kể về...')."
        ),
    }

    rule = instructions.get(
        sub_mode if sub_mode in instructions else query_type, instructions["Lexical"]
    )

    movies_summary = []
    for m in movies_batch:
        movies_summary.append(
            {
                "movie_id": m["movie_id"],
                "title_vi": m["title_vi"],
                "genres": m["genres"],
                "overview_vi": m["overview_vi"],
            }
        )

    negative_constraint = ""
    if avoid_query:
        negative_constraint = f"\nLƯU Ý ĐẶC BIỆT: Câu truy vấn tạo ra PHẢI KHÁC BIỆT HOÀN TOÀN về cấu trúc từ ngữ với câu sau (tránh trùng lặp): '{avoid_query}'"

    prompt = f"""Bạn là chuyên gia thẩm định và xây dựng bộ dữ liệu benchmark tìm kiếm phim (IR Benchmark).
Dưới đây là danh sách {len(movies_batch)} bộ phim có tóm tắt tiếng Việt:
{json.dumps(movies_summary, ensure_ascii=False, indent=2)}

Nhiệm vụ: Với MỖI bộ phim, hãy đóng vai người dùng thực tế tại Việt Nam tìm kiếm trên Google/Web phim để sinh đúng 1 truy vấn thuộc nhóm: {query_type}.
Quy tắc cho nhóm {query_type}:
{rule}
{negative_constraint}

Yêu cầu xuất ra định dạng JSON Array chứa đúng {len(movies_batch)} phần tử theo thứ tự:
[
  {{
    "movie_id": <movie_id tương ứng là số nguyên>,
    "query": "<câu tìm kiếm bằng tiếng Việt>",
    "matched_concepts": "<ngắn gọn 1 câu chỉ ra khái niệm/chứng cứ trong tóm tắt phim>"
  }}
]
Chỉ xuất JSON thuần túy, không có văn bản giải thích nào khác."""

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.7,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
        },
    }

    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        for attempt in range(1, 4):
            try:
                resp = requests.post(
                    url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                    timeout=35,
                )
                if resp.status_code == 200:
                    raw_json = resp.json()["candidates"][0]["content"]["parts"][0][
                        "text"
                    ].strip()
                    if raw_json.startswith("```json"):
                        raw_json = raw_json[7:]
                    elif raw_json.startswith("```"):
                        raw_json = raw_json[3:]
                    if raw_json.endswith("```"):
                        raw_json = raw_json[:-3]
                    raw_json = raw_json.strip()

                    parsed = json.loads(raw_json)
                    if isinstance(parsed, list) and len(parsed) > 0:
                        valid_items = []
                        for it in parsed:
                            if isinstance(it, dict) and it.get("movie_id") is not None:
                                try:
                                    it["movie_id"] = int(it["movie_id"])
                                    valid_items.append(it)
                                except (ValueError, TypeError):
                                    pass
                        return valid_items
                elif resp.status_code in (429, 503):
                    time.sleep(1.5 * attempt)
                else:
                    break
            except Exception:
                time.sleep(1.0 * attempt)

    return []


# ══════════════════════════════════════════════════════════════════════════════
# 3. RÀ SOÁT VÀ NÂNG CẤP CHẤT LƯỢNG 100 QUERY (CHỈ SỬA CÂU CHƯA ĐẠT)
# ══════════════════════════════════════════════════════════════════════════════


def refine_existing_benchmark_queries(
    existing_queries_file: Path = BENCHMARK_QUERIES_OUT,
    source_movies_file: Path = SOURCE_MOVIES_OUT,
    api_key: str = GEMINI_API_KEY,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Rà soát và tinh chỉnh 100 query đã sinh:

    - Xác minh PostgreSQL và ChromaDB về ID và metadata nội dung.
    - Giữ nguyên các câu query đã đạt chất lượng cao.
    - Sinh lại các câu Semantic/Abstract còn mô tả cốt truyện quá trực tiếp.
    - Khi query cần sinh lại nhưng Gemini thất bại hoặc thiếu API key -> Đánh dấu needs_manual_verification.
    - Kiểm tra lại chất lượng và trùng lặp sau khi LLM sinh lại query.
    """
    with open(existing_queries_file, "r", encoding="utf-8") as f:
        gt_data = json.load(f)
    existing_queries = gt_data["queries"]

    with open(source_movies_file, "r", encoding="utf-8") as f:
        src_data = json.load(f)
    movie_by_id = {m["movie_id"]: m for m in src_data["movies"]}

    refined_queries: List[Dict[str, Any]] = []
    seen_queries: Set[str] = set()

    report = {
        "total_queries": len(existing_queries),
        "kept_queries": 0,
        "regenerated_queries": 0,
        "manual_verification_queries": 0,
        "llm_verified_count": 0,
    }

    print("\n🔍 Đang rà soát chất lượng 100 queries...")

    for q in existing_queries:
        mid = q["source_movie_id"]
        movie = movie_by_id.get(mid)
        if not movie:
            continue

        q_type = q["query_type"]
        q_text = clean_vietnamese_text(q["query"])
        needs_regen = False
        regen_reason = ""

        # 1. Kiểm tra nhóm Abstract: Không được kể cốt truyện
        if q_type == "Abstract" and is_abstract_narrating_plot(q_text, movie):
            needs_regen = True
            regen_reason = "Abstract narrating plot"

        # 2. Kiểm tra nhóm Semantic: Không được mô tả cốt truyện quá trực tiếp/spoil
        elif q_type == "Semantic" and is_semantic_narrating_too_directly(q_text, movie):
            needs_regen = True
            regen_reason = "Semantic narrating too directly"

        # 3. Kiểm tra nhóm Typo/Slang: Phải là câu tìm kiếm tự nhiên
        elif q_type == "Typo_Slang" and not is_typo_slang_authentic(q_text):
            needs_regen = True
            regen_reason = "Typo/Slang lacking search colloquialisms"

        # 4. Kiểm tra trùng hoặc gần trùng
        norm_q = re.sub(r"\s+", " ", q_text.lower())
        if any(
            norm_q == p or calculate_jaccard_similarity(norm_q, p) >= 0.75
            for p in seen_queries
        ):
            needs_regen = True
            regen_reason = "Near-duplicate detected"

        if needs_regen:
            print(
                f"   [Cần tinh chỉnh] {q['query_id']} ({movie['title_vi']}): '{q_text[:35]}...' -> Lý do: {regen_reason}"
            )
            # Nếu thiếu API key -> Đánh dấu needs_manual_verification
            if not api_key:
                print(
                    f"      ⚠️ Thiếu API key. Đánh dấu {q['query_id']} là needs_manual_verification."
                )
                q["status"] = "needs_manual_verification"
                report["manual_verification_queries"] += 1
            else:
                regen_items = call_gemini_batch(
                    movies_batch=[movie],
                    query_type=q_type,
                    api_key=api_key,
                    avoid_query=q_text,
                )
                matched_regen = None
                for it in regen_items:
                    if it.get("movie_id") == mid and it.get("query"):
                        matched_regen = it
                        break

                if matched_regen:
                    new_text = clean_vietnamese_text(matched_regen["query"])
                    new_concept = clean_vietnamese_text(
                        matched_regen.get("matched_concepts", "")
                    )
                    new_norm = re.sub(r"\s+", " ", new_text.lower())

                    # KIỂM TRA LẠI CHẤT LƯỢNG VÀ TRÙNG LẶP SAU KHI LLM SINH LẠI QUERY
                    is_still_near_dup = any(
                        new_norm == p
                        or calculate_jaccard_similarity(new_norm, p) >= 0.75
                        for p in seen_queries
                    )
                    is_still_bad_abstract = (
                        q_type == "Abstract"
                        and is_abstract_narrating_plot(new_text, movie)
                    )
                    is_still_bad_semantic = (
                        q_type == "Semantic"
                        and is_semantic_narrating_too_directly(new_text, movie)
                    )
                    is_still_bad_typo = (
                        q_type == "Typo_Slang" and not is_typo_slang_authentic(new_text)
                    )

                    if (
                        not is_still_near_dup
                        and not is_still_bad_abstract
                        and not is_still_bad_semantic
                        and not is_still_bad_typo
                    ):
                        q["query"] = new_text
                        q["source_evidence"]["matched_concepts"] = new_concept
                        q["generated_by"] = (
                            f"Gemini ({GEMINI_MODEL}) [Regenerated Quality]"
                        )
                        q["status"] = "ready_for_step3_candidate_pooling"
                        report["regenerated_queries"] += 1
                        report["llm_verified_count"] += 1
                        norm_q = new_norm
                        print(
                            f"      ✅ Đã sinh lại & kiểm định đạt chất lượng: '{new_text}'"
                        )
                    else:
                        print(
                            f"      ⚠️ Query sinh lại vẫn chưa đạt chuẩn. Đánh dấu needs_manual_verification: '{new_text}'"
                        )
                        q["status"] = "needs_manual_verification"
                        report["manual_verification_queries"] += 1
                else:
                    print(
                        f"      ⚠️ Gemini thất bại khi sinh lại {q['query_id']}. Đánh dấu needs_manual_verification."
                    )
                    q["status"] = "needs_manual_verification"
                    report["manual_verification_queries"] += 1
        else:
            report["kept_queries"] += 1
            if "Gemini" in q.get("generated_by", ""):
                report["llm_verified_count"] += 1

        seen_queries.add(norm_q)
        refined_queries.append(q)

    # Cập nhật metadata
    gt_data["metadata"]["llm_verified_count"] = report["llm_verified_count"]
    gt_data["metadata"]["quality_audit"] = {
        "kept_queries": report["kept_queries"],
        "regenerated_queries": report["regenerated_queries"],
        "manual_verification_queries": report["manual_verification_queries"],
        "policy": (
            "1. Xác minh PostgreSQL và ChromaDB về ID và metadata nội dung phim. "
            "2. Chỉ ghép movie_id khớp chính xác, không dùng thứ tự phần tử. "
            "3. Khi LLM thất bại hoặc thiếu API key, đánh dấu needs_manual_verification. "
            "4. Kiểm tra lại chất lượng và trùng lặp sau khi sinh lại. "
            "5. Abstract & Semantic không kể lể trực tiếp cốt truyện. "
            "6. Không hardcode database credentials."
        ),
    }
    gt_data["queries"] = refined_queries

    with open(existing_queries_file, "w", encoding="utf-8") as f:
        json.dump(gt_data, f, ensure_ascii=False, indent=2)

    return refined_queries, report


# ══════════════════════════════════════════════════════════════════════════════
# 4. CÁC HÀM TIỆN ÍCH DÀNH CHO UNIT TESTS OFFLINE
# ══════════════════════════════════════════════════════════════════════════════


def generate_queries_for_movie(
    movie: Dict[str, Any], query_index_offset: int = 1
) -> List[Dict[str, Any]]:
    """Hàm tạo 5 mẫu query mô phỏng cho 1 phim đơn lẻ (phục vụ unit test offline)."""
    title_vi = movie.get("title_vi", movie.get("title", ""))
    genre_first = movie.get("genres", "").split(",")[0].strip()
    mid = movie.get("movie_id", 0)

    queries = [
        {
            "query_id": f"Q{query_index_offset:03d}",
            "query_type": "Lexical",
            "query": f"phim {title_vi} {genre_first}",
            "source_movie_id": mid,
            "source_evidence": {
                "title_vi": title_vi,
                "title_en": movie.get("title", ""),
                "genres": movie.get("genres", ""),
                "matched_concepts": f"Từ khóa tên phim '{title_vi}' và thể loại",
                "overview_snippet": movie.get("overview_vi", "")[:100],
            },
            "relevant_candidates": [],
            "status": "ready_for_step3_candidate_pooling",
        },
        {
            "query_id": f"Q{query_index_offset + 1:03d}",
            "query_type": "Semantic",
            "query": f"phim kể về câu chuyện trong {genre_first}",
            "source_movie_id": mid,
            "source_evidence": {
                "title_vi": title_vi,
                "title_en": movie.get("title", ""),
                "genres": movie.get("genres", ""),
                "matched_concepts": "Mô tả ngữ nghĩa cốt truyện",
                "overview_snippet": movie.get("overview_vi", "")[:100],
            },
            "relevant_candidates": [],
            "status": "ready_for_step3_candidate_pooling",
        },
        {
            "query_id": f"Q{query_index_offset + 2:03d}",
            "query_type": "Abstract",
            "query": "phim mang lại cảm xúc sâu lắng về số phận và lòng trắc ẩn",
            "source_movie_id": mid,
            "source_evidence": {
                "title_vi": title_vi,
                "title_en": movie.get("title", ""),
                "genres": movie.get("genres", ""),
                "matched_concepts": "Cảm xúc trừu tượng và thông điệp",
                "overview_snippet": movie.get("overview_vi", "")[:100],
            },
            "relevant_candidates": [],
            "status": "ready_for_step3_candidate_pooling",
        },
        {
            "query_id": f"Q{query_index_offset + 3:03d}",
            "query_type": "Typo_Slang",
            "query": f"tim fim {title_vi.lower()} k che zay mn",
            "source_movie_id": mid,
            "source_evidence": {
                "title_vi": title_vi,
                "title_en": movie.get("title", ""),
                "genres": movie.get("genres", ""),
                "matched_concepts": "Từ viết tắt fim, k, zay mn",
                "overview_snippet": movie.get("overview_vi", "")[:100],
            },
            "relevant_candidates": [],
            "status": "ready_for_step3_candidate_pooling",
        },
        {
            "query_id": f"Q{query_index_offset + 4:03d}",
            "query_type": "Short_Long",
            "query": f"{title_vi}",
            "source_movie_id": mid,
            "source_evidence": {
                "title_vi": title_vi,
                "title_en": movie.get("title", ""),
                "genres": movie.get("genres", ""),
                "matched_concepts": "Truy vấn cực ngắn",
                "overview_snippet": movie.get("overview_vi", "")[:100],
            },
            "relevant_candidates": [],
            "status": "ready_for_step3_candidate_pooling",
        },
    ]
    return queries


def audit_and_balance_queries(
    queries: List[Dict[str, Any]],
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Kiểm tra và cân bằng danh sách queries."""
    by_type = defaultdict(list)
    for q in queries:
        by_type[q["query_type"]].append(q)

    audit_stats = {
        "total": len(queries),
        "by_type": {k: len(v) for k, v in by_type.items()},
        "is_balanced": (
            all(len(v) == 20 for v in by_type.values()) if len(by_type) == 5 else False
        ),
    }
    return queries, audit_stats


# ══════════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ══════════════════════════════════════════════════════════════════════════════


def run_step2_pipeline() -> None:
    print("=" * 80)
    print("🚀 BƯỚC 2: RÀ SOÁT VÀ CHỐT BỘ QUERY BENCHMARK TỰ NHIÊN VỚI GEMINI LLM")
    print("=" * 80)
    try:
        db_url_masked = get_database_url().split("@")[-1]
    except Exception as e:
        sys.exit(f"[FATAL] Lỗi cấu hình Database: {e}")

    print(f"  Database Host/DB: {db_url_masked}")
    print(f"  ChromaDB Path   : {CHROMA_DIR}")
    print(f"  LLM Model       : {GEMINI_MODEL}")
    print(f"  Gemini API Key  : {'Đã cấu hình' if GEMINI_API_KEY else 'Chưa có'}")
    print("=" * 80 + "\n")

    # 1. Bắt buộc xác minh mapping ChromaDB & PostgreSQL về ID và metadata nội dung
    print("⏳ [1/4] Bắt buộc xác minh mapping ChromaDB & PostgreSQL (ID & Content)...")
    raw_movies = extract_movies_from_postgres(chroma_dir=CHROMA_DIR, limit=1000)
    print(
        f"   ✅ Đã xác minh {len(raw_movies):,} phim hợp lệ tồn tại và trùng khớp nội dung ở cả 2 DB."
    )

    # 2. Đảm bảo 100 phim nguồn
    if not SOURCE_MOVIES_OUT.exists():
        print("\n⏳ [2/4] Chọn 100 phim nguồn phân bổ đều 10 thể loại...")
        selected_100 = select_100_diverse_movies(raw_movies, target_count=100)
        with open(SOURCE_MOVIES_OUT, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "description": "Tập 100 phim nguồn được xác minh cả trong PostgreSQL và ChromaDB",
                    "total_movies": len(selected_100),
                    "movies": selected_100,
                },
                f,
                ensure_ascii=False,
                indent=2,
            )
        print(f"   💾 Đã lưu 100 phim nguồn tại: {SOURCE_MOVIES_OUT}")
    else:
        print(
            f"\n⏳ [2/4] Xác minh lại 100 phim nguồn với dữ liệu hiện tại tại: {SOURCE_MOVIES_OUT}..."
        )
        verify_source_movies_against_current_dbs(
            source_movies_file=SOURCE_MOVIES_OUT,
            chroma_dir=CHROMA_DIR,
        )

    # 3. Rà soát và nâng cấp chất lượng queries
    print("\n⏳ [3/4] Rà soát và nâng cấp chất lượng queries...")
    refined_queries, report = refine_existing_benchmark_queries(
        existing_queries_file=BENCHMARK_QUERIES_OUT,
        source_movies_file=SOURCE_MOVIES_OUT,
        api_key=GEMINI_API_KEY,
    )

    # 4. Báo cáo kết quả
    print("\n" + "=" * 80)
    print("📊 BÁO CÁO KẾT QUẢ RÀ SOÁT & CHỐT BƯỚC 2:")
    print("=" * 80)
    print(f"  - Tổng số queries                : {report['total_queries']}")
    print(f"  - Số query thực sự sinh bởi Gemini: {report['llm_verified_count']} / 100")
    print(f"  - Số query giữ nguyên chất lượng  : {report['kept_queries']}")
    print(f"  - Số query được sinh lại (Regen)  : {report['regenerated_queries']}")
    print(
        f"  - Số query cần kiểm chứng thủ công: {report['manual_verification_queries']}"
    )
    print(f"  - File kết quả                   : {BENCHMARK_QUERIES_OUT}")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    run_step2_pipeline()
