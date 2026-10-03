#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
build_ground_truth.py
=====================
Script phụ trợ để hỗ trợ xây dựng tập Ground Truth thủ công.

Chức năng:
  - Tìm kiếm phim ứng viên (candidates) trong database cho một query cho trước
  - Hiển thị thông tin phim (tên, thể loại, mô tả) để tác giả đánh giá
  - Giúp tác giả xác định movieId hợp lệ trước khi thêm vào ground_truth.json

Cách dùng:
    python scripts/build_ground_truth.py --query "robot sát thủ tương lai" --top_k 20
    python scripts/build_ground_truth.py --query "phim tình yêu bi kịch" --genre "Lãng Mạn"
    python scripts/build_ground_truth.py --list_genres
    python scripts/build_ground_truth.py --validate  (kiểm tra tất cả movieId trong ground_truth.json)
"""

from __future__ import annotations

import argparse
import ast
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# ─── Thiết lập encoding UTF-8 ────────────────────────────────────────────────
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

CURRENT_DIR    = Path(__file__).resolve().parent
AI_SERVICE_DIR = CURRENT_DIR.parent
PROJECT_ROOT   = AI_SERVICE_DIR.parent

CSV_PATH = PROJECT_ROOT / "all_movies_fully_translated.csv"
GT_PATH  = AI_SERVICE_DIR / "experiments" / "ground_truth" / "ground_truth.json"


def load_df() -> pd.DataFrame:
    """Nạp và tiền xử lý DataFrame phim."""
    df = pd.read_csv(CSV_PATH, low_memory=False)
    df = df.dropna(subset=["movieId"]).drop_duplicates(subset=["movieId"]).copy()
    df["movieId"]    = df["movieId"].astype(int)
    df["title_vi"]   = df["title_vi"].fillna("")
    df["overview_vi"]= df["overview_vi"].fillna("")
    df["overview"]   = df["overview"].fillna("")
    df["genres"]     = df["genres"].fillna("")
    df["title"]      = df["title"].fillna("")
    df["search_text"]= (
        df["title_vi"] + " " + df["title"] + " " + df["genres"] + " " +
        df["overview_vi"] + " " + df["overview"]
    ).str.strip()
    return df[df["search_text"].str.len() > 10].reset_index(drop=True)


def get_genre_names(genres_str: str) -> list[str]:
    """Trích xuất danh sách tên thể loại từ chuỗi JSON."""
    try:
        genres = ast.literal_eval(str(genres_str))
        return [g.get("name", "") for g in genres if g.get("name")]
    except Exception:
        return []


def search_candidates(query: str, df: pd.DataFrame, top_k: int = 20, genre_filter: str = "") -> pd.DataFrame:
    """Tìm kiếm ứng viên bằng TF-IDF để hỗ trợ annotation."""
    # Lọc theo thể loại nếu có
    if genre_filter:
        mask = df["genres"].str.contains(genre_filter, case=False, na=False)
        df_search = df[mask].reset_index(drop=True)
        if len(df_search) < 5:
            print(f"  [WARN] Chỉ có {len(df_search)} phim thuộc thể loại '{genre_filter}', mở rộng tìm kiếm.")
            df_search = df
    else:
        df_search = df

    # TF-IDF search
    vec = TfidfVectorizer(max_features=15_000, ngram_range=(1, 2))
    matrix = vec.fit_transform(df_search["search_text"])
    q_vec = vec.transform([query])
    scores = cosine_similarity(q_vec, matrix).flatten()
    top_idx = scores.argsort()[::-1][:top_k]

    result_rows = []
    for rank, idx in enumerate(top_idx, start=1):
        row = df_search.iloc[idx]
        sc = float(scores[idx])
        genres_list = get_genre_names(row["genres"])
        result_rows.append({
            "rank":         rank,
            "movie_id":     int(row["movieId"]),
            "title_vi":     row["title_vi"] if row["title_vi"] else row["title"],
            "title_en":     row["title"],
            "vote_average": float(row.get("vote_average", 0)),
            "release_date": str(row.get("release_date", ""))[:4],
            "genres":       ", ".join(genres_list),
            "tfidf_score":  round(sc, 4),
            "overview_snippet": str(row["overview_vi"])[:120] + "..." if row["overview_vi"] else str(row["overview"])[:120] + "...",
        })
    return pd.DataFrame(result_rows)


def validate_ground_truth(df: pd.DataFrame) -> None:
    """Kiểm tra tất cả movieId trong ground_truth.json có tồn tại trong DB không."""
    if not GT_PATH.exists():
        print(f"[ERROR] Không tìm thấy {GT_PATH}")
        return

    with GT_PATH.open(encoding="utf-8") as f:
        gt_data = json.load(f)

    valid_ids = set(df["movieId"].tolist())
    total_ok = 0
    total_err = 0

    print(f"\n{'='*70}")
    print(f"KIỂM TRA GROUND TRUTH: {GT_PATH.name}")
    print(f"{'='*70}")

    for q in gt_data["queries"]:
        qid   = q["query_id"]
        query = q["query"]
        errs  = []
        for rel in q["relevant_movies"]:
            mid = rel["movie_id"]
            if mid not in valid_ids:
                errs.append(mid)
                total_err += 1
            else:
                total_ok += 1

        status = "✅" if not errs else "❌"
        print(f"  {status} {qid}: {query[:60]}")
        if errs:
            print(f"      [ERROR] movieId không tồn tại: {errs}")
            # Gợi ý phim gần nhất
            for bad_id in errs:
                row = df[df["movieId"] == bad_id]
                if row.empty:
                    print(f"      → movieId={bad_id} KHÔNG TỒN TẠI trong DB!")

    print(f"\n{'='*70}")
    print(f"Kết quả: {total_ok} OK, {total_err} LỖI (movieId không tồn tại)")
    print(f"{'='*70}\n")


def list_genres(df: pd.DataFrame) -> None:
    """Hiển thị danh sách thể loại có trong dữ liệu."""
    genre_counts: dict[str, int] = {}
    for genres_str in df["genres"]:
        for g in get_genre_names(genres_str):
            genre_counts[g] = genre_counts.get(g, 0) + 1
    sorted_genres = sorted(genre_counts.items(), key=lambda x: -x[1])
    print("\n=== DANH SÁCH THỂ LOẠI ===")
    for name, cnt in sorted_genres:
        print(f"  {cnt:>6,}  {name}")


def print_candidates(cand_df: pd.DataFrame, query: str) -> None:
    """In danh sách ứng viên đẹp."""
    print(f"\n{'='*80}")
    print(f"  KẾT QUẢ TÌM KIẾM ỨNG VIÊN CHO QUERY: \"{query}\"")
    print(f"{'='*80}")
    print(f"{'Rank':>4} {'movieId':>8} {'Score':>7} {'⭐':>5} {'Năm':>4} | {'Tên phim':<40} {'Thể loại'}")
    print("-" * 80)
    for _, row in cand_df.iterrows():
        name_truncated = str(row["title_vi"])[:38]
        genres_short   = str(row["genres"])[:30]
        print(
            f"{int(row['rank']):>4}  "
            f"{int(row['movie_id']):>8}  "
            f"{float(row['tfidf_score']):>6.4f}  "
            f"{float(row['vote_average']):>4.1f}  "
            f"{str(row['release_date'])[:4]:>4} | "
            f"{name_truncated:<40}  {genres_short}"
        )
    print(f"\n  → Copy movieId vào ground_truth.json → relevant_movies[]")
    print(f"     Grade: 3=Rất liên quan | 2=Liên quan | 1=Một phần liên quan")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Công cụ hỗ trợ xây dựng Ground Truth cho đánh giá mô hình IR"
    )
    parser.add_argument("--query",        type=str, default="", help="Câu truy vấn tìm kiếm")
    parser.add_argument("--top_k",        type=int, default=20,  help="Số kết quả trả về (mặc định: 20)")
    parser.add_argument("--genre",        type=str, default="",  help="Lọc theo thể loại (vd: 'Kinh Dị', 'Lãng Mạn')")
    parser.add_argument("--list_genres",  action="store_true",   help="Hiển thị danh sách thể loại")
    parser.add_argument("--validate",     action="store_true",   help="Kiểm tra tính hợp lệ của ground_truth.json")
    args = parser.parse_args()

    print("⏳ Đang nạp dữ liệu phim ...")
    df = load_df()
    print(f"✅ {len(df):,} phim hợp lệ.\n")

    if args.list_genres:
        list_genres(df)
        return

    if args.validate:
        validate_ground_truth(df)
        return

    if not args.query:
        print("[INFO] Không có query. Dùng --query \"...\" hoặc --validate hoặc --list_genres")
        print("Ví dụ:")
        print("  python scripts/build_ground_truth.py --query \"robot sát thủ tương lai\" --top_k 20")
        print("  python scripts/build_ground_truth.py --validate")
        print("  python scripts/build_ground_truth.py --list_genres")
        return

    cand_df = search_candidates(args.query, df, top_k=args.top_k, genre_filter=args.genre)
    print_candidates(cand_df, args.query)

    # In snippet mô tả cho từng ứng viên
    print("=== TÓM TẮT NỘI DUNG PHIM ===\n")
    for _, row in cand_df.head(10).iterrows():
        print(f"[{int(row['movie_id'])}] {row['title_vi']}")
        print(f"  {row['overview_snippet']}")
        print()


if __name__ == "__main__":
    main()
