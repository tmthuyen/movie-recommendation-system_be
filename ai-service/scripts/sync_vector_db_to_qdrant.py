#!/usr/bin/env python
"""
sync_vector_db_to_qdrant.py
===========================
Nạp movie vectors (384-dim SBERT) lên Qdrant.

Cách chạy:
    # 1. Nạp nhanh từ ChromaDB đã có sẵn:
    python scripts/sync_vector_db_to_qdrant.py

    # 2. Hoặc nạp lên Qdrant Cloud:
    python scripts/sync_vector_db_to_qdrant.py --qdrant-url https://xxxx.qdrant.io:6333 --api-key xxxx

    # 3. Kiểm tra collection sau khi nạp:
    python scripts/sync_vector_db_to_qdrant.py --verify-only
    python scripts/sync_vector_db_to_qdrant.py --collection user_long_term_vectors --verify-only
    python scripts/sync_vector_db_to_qdrant.py --collection user_long_term_vectors --recreate

    user_long_term_vectors,
    user_short_term_vectors,
    user_search_vectors,
    user_profile_vectors,
    user_genre_vectors
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

# Thiết lập encoding UTF-8 cho Windows console
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

import chromadb
from qdrant_client import QdrantClient, models

# Cho phép import từ src/
_THIS_DIR = Path(__file__).resolve().parent
_AI_SRC = _THIS_DIR.parent / "src"
if str(_AI_SRC) not in sys.path:
    sys.path.insert(0, str(_AI_SRC))

from core.config import get_settings


def parse_args():
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Sync movie vectors to Qdrant")
    parser.add_argument(
        "--qdrant-url",
        type=str,
        default=settings.vector_db_url or "http://127.0.0.1:6333",
        help="Qdrant server / cloud URL",
    )
    parser.add_argument(
        "--api-key",
        type=str,
        default=settings.vector_db_api_key or None,
        help="Qdrant API Key (cho Cloud)",
    )
    parser.add_argument(
        "--collection",
        type=str,
        default=settings.vector_collection or "movies",
        help="Collection name",
    )
    parser.add_argument(
        "--chroma-dir",
        type=Path,
        default=_THIS_DIR.parent / "data" / "chroma_db",
        help="Thư mục ChromaDB nguồn",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=500,
        help="Số lượng points upload mỗi batch",
    )
    parser.add_argument(
        "--recreate",
        action="store_true",
        help="Xoá và tạo lại collection nếu đã tồn tại",
    )
    parser.add_argument(
        "--verify-only",
        action="store_true",
        help="Chỉ kiểm tra số lượng và tìm kiếm thử, không nạp lại",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    qdrant_url = args.qdrant_url
    api_key = args.api_key
    collection_name = args.collection
    chroma_dir = args.chroma_dir
    batch_size = args.batch_size

    print("=" * 65)
    print("  Qdrant Vector DB Sync")
    print("=" * 65)
    print(f"  Qdrant URL    : {qdrant_url}")
    print(f"  API Key       : {'***' if api_key else '(None - local)'}")
    print(f"  Collection    : {collection_name}")
    print(f"  Source Chroma : {chroma_dir}")
    print(f"  Batch size    : {batch_size}")
    print("=" * 65)

    client = QdrantClient(url=qdrant_url, api_key=api_key)

    if args.verify_only:
        if not client.collection_exists(collection_name):
            print(f"[ERROR] Collection '{collection_name}' không tồn tại trên Qdrant.")
            return 1
        info = client.get_collection(collection_name)
        count_res = client.count(collection_name, exact=True)
        print(f"[OK] Collection '{collection_name}' tồn tại:")
        print(f"     - Số lượng vector: {count_res.count:,} phim")
        print(f"     - Vector size: {info.config.params.vectors.size}")
        print(f"     - Distance: {info.config.params.vectors.distance}")
        return 0

    # 1. Đọc dữ liệu từ ChromaDB
    if not chroma_dir.exists():
        print(f"[ERROR] Không tìm thấy thư mục ChromaDB tại: {chroma_dir}")
        return 1

    print(f"Đang kết nối ChromaDB tại {chroma_dir}...")
    chroma_client = chromadb.PersistentClient(path=str(chroma_dir))
    chroma_col = chroma_client.get_collection(name=collection_name)
    total_chroma = chroma_col.count()
    print(f"ChromaDB có tổng cộng {total_chroma:,} dòng.")

    # 2. Khởi tạo / cấu hình collection trên Qdrant
    if args.recreate and client.collection_exists(collection_name):
        print(f"Xoá collection cũ '{collection_name}'...")
        client.delete_collection(collection_name)

    if not client.collection_exists(collection_name):
        print(f"Tạo collection '{collection_name}' trên Qdrant (384-dim, Cosine)...")
        client.create_collection(
            collection_name=collection_name,
            vectors_config=models.VectorParams(
                size=384,
                distance=models.Distance.COSINE,
            ),
        )
    else:
        print(f"Collection '{collection_name}' đã tồn tại trên Qdrant.")

    # 3. Đọc dữ liệu và upload theo batch
    print(f"Bắt đầu chuyển dữ liệu sang Qdrant theo batch {batch_size}...")
    t0 = time.time()
    offset = 0
    total_uploaded = 0

    while offset < total_chroma:
        # Lấy batch từ ChromaDB
        data = chroma_col.get(
            limit=batch_size,
            offset=offset,
            include=["embeddings", "metadatas"],
        )
        ids = data.get("ids", [])
        embeddings = data.get("embeddings", [])
        metadatas = data.get("metadatas", [])

        print(embeddings)

        # neu la user genre vector thi cho [0.0] * 384
        if collection_name == "user_genre_vectors":
            print(
                f"[INFO] Collection '{collection_name}' là user_genre_ve, nạp vector mặc định [0.0]*384."
            )
            embeddings = [[0.0] * 384 for _ in range(len(ids))]

        if not ids:
            print(f"[WARNING] Không còn dữ liệu để nạp, offset={offset}.")
            break

        points = []
        for str_id, emb, meta in zip(ids, embeddings, metadatas):
            try:
                # mid = int(str_id)
                # neeus la int thi int neu la str thi str
                if isinstance(str_id, str) and str_id.isdigit():
                    id = int(str_id)
                else:
                    id = str_id

            except (ValueError, TypeError):
                continue

            # Đảm bảo format metadata chuẩn
            meta_clean = dict(meta) if meta else {}
            meta_clean["id"] = id

            points.append(
                models.PointStruct(
                    id=id,
                    vector=emb.tolist() if hasattr(emb, "tolist") else emb,
                    payload=meta_clean,
                )
            )

        if points:
            client.upsert(collection_name=collection_name, points=points)
            total_uploaded += len(points)

        offset += len(ids)
        percent = (offset / total_chroma) * 100
        print(f"  Đã upload: {offset:,}/{total_chroma:,} ({percent:.1f}%)", end="\r")

    print()
    elapsed = time.time() - t0
    final_count = client.count(collection_name, exact=True).count
    print(
        f"Hoàn thành! Đã nạp {final_count:,} phim vào Qdrant '{collection_name}' trong {elapsed:.1f}s."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
