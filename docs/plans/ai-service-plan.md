# Kế hoạch phát triển — AI-SERVICE (Python/FastAPI)

> File con của [README.md](./README.md). Tài liệu hiện trạng chi tiết: [docs/AI-SERVICE.md](../AI-SERVICE.md).

## 1. Vai trò của ai-service

Cung cấp **2 khả năng gợi ý** cho ứng dụng web phim:

1. **Semantic Search tiếng Việt** — tìm phim theo ngữ nghĩa (title/overview/genre), embedding + vector DB, kèm baseline lexical (TF-IDF/BM25).
2. **Collaborative Filtering** — gợi ý theo hành vi user (rating), không cần nội dung phim.

Dữ liệu: từ backend DB (qua HTTP/RabbitMQ) + MovieLens/TMDB đã tải.

## 2. Hiện trạng (tóm tắt)

| Hạng mục | Trạng thái |
|---|---|
| Fetch MovieLens (movies/ratings/links) + **metadata TMDB vi-VN** (~10.6k phim JSONL) | ✅ |
| Toolkit làm sạch tiếng Việt (`clean_text_utils`, `teencode_dict`) | ✅ |
| Baseline lexical search TF-IDF/BM25 (notebook + `catalog_vi.parquet`) | ✅ (mức notebook) |
| **Dịch Anh → Việt** (`translation.ipynb`, Helsinki-NLP) | 🔄 đang chạy |
| API FastAPI | ❌ `src/api/server.py` là stub |
| Embedding + vector DB | ❌ |
| Collaborative filtering | ❌ |
| RabbitMQ consumer | ❌ |
| Dockerfile | ❌ lỗi CMD (`src.api.web_app:app` không tồn tại) |

> ⚠️ **Điều kiện chốt của chủ dự án:** các bước **format data**, **lưu vector search**, **kết nối 2 service** chỉ bắt đầu **sau khi dịch xong sang tiếng Việt**.

---

## 3. Dữ liệu

| Nguồn | File/Đường dẫn | Dung lượng | Mục đích |
|---|---|---|---|
| MovieLens | `data/movielens/{movies,ratings,links,tags,genome_*}.csv` | ~1.1 GB | ratings cho collaborative filtering; `links` để map `tmdbId` |
| TMDB metadata vi-VN | `data/tmdb/movies_vietnamese_metadata_*.jsonl` | ~16 MB | text + metadata cho semantic search |
| Dịch tiếng Việt (P0) | output từ `translation.ipynb` | – | chuẩn hóa `title`, `overview` tiếng Việt |
| Backend DB (P4) | qua HTTP / RabbitMQ | – | phim + tương tác realtime của app |

**Quy chiếu ID** (đã nêu ở README mục 4.1): dùng `tmdb_id` làm khóa clone; `links.csv` (movieId MovieLens ↔ tmdbId) là bảng tra để nối rating MovieLens với phim backend.

---

## 4. Các giai đoạn triển khai

### A1 — Format data chuẩn (sau khi dịch xong — bắt buộc trước A2)
- [ ] Gộp & chuẩn hóa các batch JSONL → 1 catalog chung `data/catalog/movies_vi.parquet` (hoặc `.jsonl`).
- [ ] Đè mapping các trường khớp DB backend:
  `tmdb_id, title_vi, overview_vi, genres[vi], tagline, poster_path, release_date, vote_average, vote_count, popularity, original_title`.
- [ ] Làm sạch văn bản bằng `clean_text_utils` (NFC, bỏ emoji/teencode, normalize).
- [ ] Lọc phim không hợp lệ (thiếu title/overview), ghi file mapping `tmdb_id ↔ movie_id(backend)` (ban đầu null, điền khi backend sync).
- [ ] Tạo module đọc catalog thống nhất (thay hết phần load trong notebook).

### A2 — Vector search (semantic search)
- [ ] Chọn vector DB: **Qdrant** (khuyến nghị — docker nhẹ, client `qdrant-client`); thêm service vào docker-compose + volume.
- [ ] Chọn embedding model tiếng Việt:
  - `keepitreal/vietnamese-sbert` (phoBERT, 768d) hoặc
  - `dangvantuan/vietnamese-document-embedding`, hoặc
  - fallback `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`.
- [ ] Pipeline embedding: làm sạch → encode `title + overview + genres` → **upsert collection `movies_vi`** (payload kèm `movie_id`, `tmdb_id`, `title`, `poster_path`).
- [ ] Viết hàm `semantic_search(query, k)`: encode query → `qdrant.search`.
- [ ] Baseline lexical giữ lại để so sánh + fallback: chuyển notebook → module `src/retrieval/lexical.py`.

### A3 — Collaborative filtering
- [ ] Chuẩn bị dữ liệu train: `ratings.csv` MovieLens (map sang `tmdb_id`/`movie_id` qua `links.csv`).
- [ ] Huấn luyện model cơ bản: **SVD (surprise)** hoặc ma trận similarity (cosine user-item).
- [ ] Lưu artifact: `data/artifacts/collab/` (model, mappings user/movie).
- [ ] Hàm `recommend_for_user(user_id, k)`; user chưa có rating → fallback popular/top-rated.
- [ ] Test bằng metric offline (RMSE / precision@k) trên split train/test.

### A4 — API FastAPI (hoàn chỉnh)
- [ ] Sửa Dockerfile (`CMD uvicorn src.api.web_app:app` + tạo file hoặc đổi thành `src.api.server:app`).
- [ ] Implement `src/api/web_app.py` (sạch hơn) với:
  - `GET /api/health`
  - `GET /api/search?q=&limit=` → semantic search + fallback lexical
  - `GET /api/recommendations/:userId?limit=` → collaborative filtering
  - `GET /api/movies/:movieId/similar?limit=` → semantic "phim tương tự"
  - `GET /api/catalog/stats` → số phim index, model version (cho việc debug)
- [ ] Swagger UI tại `/docs` (FastAPI mặc định) + mount tại `/api`.
- [ ] Load model/index **một lần lúc khởi động** (lazy singleton) để search nhanh.

### A5 — RabbitMQ consumer (đồng bộ async với backend)
- [ ] Cài `pika`; connect `amqp://guest:guest@localhost:5672`, declare exchange `movie.events`.
- [ ] Consumer các routing key:
  - `movie.created` / `movie.updated` → **upsert embedding** vào Qdrant + cập nhật catalog.
  - `movie.deleted` → xóa vector khỏi Qdrant + catalog.
  - `interaction.tracked` → ghi vào `data/ratings/app_interactions.csv` (buffer) để train collab.
- [ ] Retry/DLQ tối giản (đơn giản: ack sau khi xử lý xong, log lỗi).
- [ ] Script `scripts/sync_from_backend.py`: **kéo toàn bộ dữ liệu từ backend qua API** (`GET /api/movies`) để tái đồng bộ index (chạy thủ công / định kỳ).

### A6 — Training collab định kỳ (+ incremental)
- [ ] Job (APScheduler hoặc cron) chạy lại huấn luyện collab khi buffer đạt mốc (VD 10k interaction mới) hoặc hằng ngày.
- [ ] Gộp dữ liệu: MovieLens + interactions từ app (backend) → train lại, refresh mapping `user_id`.

### A7 — Hoàn thiện
- [ ] Tests (`tests/`): unit cho clean text, search, recommend, consumer.
- [ ] Dockerfile đúng + khai báo trong docker-compose (env: `VECTOR_DB_URL`, `RABBITMQ_URL`, `OTEL_EXPORTER_URL`).
- [ ] Bổ sung deps vào `pyproject.toml`: `fastapi, uvicorn, qdrant-client, sentence-transformers, pika, scikit-learn, pyyaml, torch, surprise`.
- [ ] (Tùy chọn) OpenTelemetry cho ai-service như backend.

---

## 5. API contract giữa backend ↔ ai-service

| Backend (calls) | ai-service |
|---|---|
| `GET /api/search?q=&limit=` proxy | `GET /api/search?q&limit` → `{ items: [{movieId, tmdbId, title, posters, score}] }` |
| `GET /api/movies/:id/similar` proxy | `GET /api/movies/{movieId}/similar` → `[{movieId, ...}]` |
| `GET /api/me/recommendations` (userId) | `GET /api/recommendations/{userId}?limit` → `[{movieId, ...reason}]` |
| Không gọi | `GET /api/health`, `GET /api/catalog/stats` |

> **movieId trên toàn bộ API/event = ID trong DB backend** (để frontend không phải map). ai-service luôn trả về/tiêu thụ `movieId` này.

## 6. Ảnh xạ giai đoạn với roadmap tổng

| Roadmap | Giai đoạn AI |
|---|---|
| P0 | A1 (format sau dịch) |
| P3 | A1 → A4 |
| P4 | A5 + A6 (kết nối) |
| P5 | A7 |