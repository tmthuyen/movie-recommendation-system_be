# AI-SERVICE — Movie Recommendation AI Service (Python)

> Tài liệu mô tả service `ai-service/` trong dự án **Movie App - Recommendation System**.

## 1. Tổng quan / Mục tiêu của service

`ai-service/` là **microservice AI bằng Python** trong hệ thống gợi ý phim. Theo thiết kế (README), service này đảm nhiệm hai chức năng lõi:

1. **Semantic Search tiếng Việt**: tìm kiếm phim theo ngữ nghĩa trên dữ liệu metadata tiếng Việt (fetch từ TMDB với `language=vi-VN`), dùng embedding (BERT/phoBERT/sentence-transformers) lưu trong Vector Database, kèm baseline lexical search bằng TF-IDF/BM25.
2. **Collaborative Filtering (Lọc cộng tác)**: gợi ý phim dựa trên dữ liệu rating của người dùng (MovieLens), không dùng thuật toán phụ thuộc nội dung phim.

Service dự kiến chạy trên **port 8082** (AI APIs: `http://localhost:8082/api`), dùng **FastAPI**, giao tiếp với backend NestJS qua **RabbitMQ**, và có OpenTelemetry cho quan sát.

> ⚠️ **Trạng thái thực tế hiện tại**: Service đang ở **giai đoạn scaffold/khoi tạo dữ liệu**.
> - ✅ **Đã xong**: thu thập dữ liệu MovieLens + TMDB metadata tiếng Việt (~7.912 phim), bộ toolkit làm sạch văn bản tiếng Việt.
> - ❌ **Chưa có**: route API, embedding/vector DB, thuật toán collaborative filtering, RabbitMQ, và Dockerfile đang lỗi (CMD trỏ tới `src.api.web_app:app` nhưng file này **không tồn tại**, `src/api/server.py` còn là stub không import được `FastAPI`).

## 2. Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Framework API | FastAPI + Uvicorn |
| Data processing | NumPy, Pandas |
| Dự kiến (thiết kế) | sentence-transformers / phoBERT, TF-IDF / BM25, Vector DB (Milvus/Weaviate/Pinecone), RabbitMQ (pika), OpenTelemetry |
| Dependency quản lý | `pyproject.toml` (pip install -e .) |
| Container | Dockerfile (`python:3.11-slim`) |

Dev deps đã khai báo: `pytest`, `pytest-cov`, `pre-commit`.

> ⚠️ Dependencies khai báo trong `pyproject.toml` **chưa đầy đủ** so với code/thiết kế: thiếu `torch`, `pyyaml`, `sentence-transformers`, `pika`, `qdrant-client/pgvector`, ...

## 3. Cấu trúc thư mục

```
ai-service/
├── .env                        # TMDB_API_KEY (gitignored)
├── .dockerignore
├── .gitignore
├── Dockerfile                  # python:3.11-slim, EXPOSE 8082 — CMD uvicorn src.api.web_app:app (LỖI: file không tồn tại)
├── print_tree.py               # tiện ích in cây thư mục ra tree.txt
├── pyproject.toml              # deps: numpy, pandas, fastapi, uvicorn (+ dev)
├── README.md
├── config/
│   └── config.yaml             # (leftover từ project LM văn bản tiếng Việt — KHÔNG dùng cho movie)
├── data/                       # (gitignored, ~1.1 GB) — dataset đã tải về
│   ├── movielens/
│   │   ├── movies.csv          # 58.098 phim: movieId, title, genres
│   │   ├── ratings.csv         # (724 MB) userId, movieId, rating, timestamp
│   │   ├── tags.csv            # userId, movieId, tag, timestamp
│   │   ├── links.csv           # movieId, imdbId, tmdbId — khóa join sang TMDB
│   │   ├── genome_scores.csv   # (316 MB) movieId, tagId, relevance
│   │   └── genome_tags.csv     # tagId, tag
│   └── tmdb/
│       └── movies_vietnamese_metadata_{1-7912}.jsonl  # metadata vi-VN theo batch 1000
│   #  + movies_vietnamese_metadata.jsonl (gộp)
├── docs/
│   ├── script.md               # (leftover project LM cũ)
│   └── setup_project.md        # hướng dẫn venv + pip install -e .[dev]
├── notebooks/
│   └── fetch_data.ipynb        # pipeline tải dữ liệu (kagglehub MovieLens + TMDB vi-VN)
├── scripts/
│   └── __init__.py             # chưa có script chính thức
├── src/
│   ├── api/
│   │   ├── __init__.py
│   │   └── server.py           # STUB: `app = FastAPI(...)` không import FastAPI, không route
│   └── utils/
│       ├── __init__.py         # re-export config_loader, logger, teencode_dict
│       ├── clean_text_utils.py # pipeline làm sạch văn bản tiếng Việt (NFC, HTML, emoji, teencode)
│       ├── teencode_dict.py    # từ điển teencode/emoji/viết tắt -> tiếng Việt chuẩn
│       ├── config_loader.py    # load config/config.yaml (leftover)
│       ├── logger.py           # logger console + file xoay theo ngày
│       └── checkpoint_manager.py  # (leftover project LM — torch checkpoint)
└── tests/
    └── __init__.py             # chưa có test
```

*Bỏ qua `__pycache__/`, `.venv/`, `.env` (gitignored).* Các thư mục `src/core/`, `src/models/`, `src/services/` xuất hiện trong sơ đồ README **hiện không tồn tại**.

## 4. Các chức năng hiện có

### 4.1 Thu thập dữ liệu (đã hoàn thành)
`notebooks/fetch_data.ipynb`:
- Tải **MovieLens Latest Full** từ kagglehub (`grouplens/movielens-latest-full`) → `data/movielens/`.
- Lọc phim "watchable": `rating_count >= 10` và `rating_mean >= 3.0` → join với `links` lấy `tmdbId` (16.645 phim).
- Fetch **metadata tiếng Việt** từ TMDB API (`language=vi-VN`) với throttle `time.sleep(0.05)`, lưu thành JSONL theo batch 1000 (`movies_vietnamese_metadata_{start-end}.jsonl`) → tổng **7.912 phim**, gộp thành 1 file.
- Metadata gồm: `title_vi`, `overview_vi`, `genres` (tên thể loại tiếng Việt), `tagline`, `poster_path`, ngày phát hành...

### 4.2 Làm sạch văn bản tiếng Việt (`src/utils/`)
Nền tảng cho pipeline embedding trong tương lai:
- `clean_text_utils.clean_text(text, type=...)`: chuẩn hóa **Unicode NFC** (bắt buộc với dấu tiếng Việt), tách HTML/entity, chuyển URL/email → token, emoji/cảm xúc → token (VD `:))` → `TOKENSMILE`), **teencode → tiếng Việt chuẩn** (VD `k→không`, `ko→không`, `fim→phim`, `z→vậy`), số/ngày/phần trăm → token (`TOKENNUM`, `TOKENDATE`, `TOKENPERCENT`), dấu câu kết câu → `TOKENEOS`, dọn khoảng trắng.
- `is_valid_sentence()` / `is_valid_article()`: lọc câu/văn bản quá ngắn, chỉ số, hoặc không phải tiếng Việt (dựa trên tỷ lệ từ có dấu).

## 5. Kiến trúc dự kiến (chưa code)

### Semantic Search tiếng Việt
- Embedding: BERT / **phoBERT** / sentence-transformers trên văn bản tiếng Việt (title, overview, genres đã được làm sạch).
- Vector Database: Milvus / Weaviate / Pinecone (chưa chọn; docker-compose hiện cũng **chưa khai báo** service vector DB cụ thể).
- Baseline: TF-IDF / BM25.
- Chưa có tên collection, kích thước embedding, model nào được định nghĩa.

### Collaborative Filtering
- Dữ liệu có sẵn: `ratings.csv` (full MovieLens) — đầu vào cho ma trận user-item / SVD / similarity.
- Chưa có thuật toán, ma trận rating, hay tính toán similarity nào trong code.

## 6. Tích hợp hạ tầng (trạng thái)

| Thành phần | Trạng thái |
|---|---|
| RabbitMQ | ❌ Chưa có code producer/consumer. Chỉ có container `rabbitmq:3-management-alpine` trong docker-compose (port 5672/15672) |
| Redis | ❌ Container `redis:7-alpine` sẵn có, chưa được dùng |
| Vector DB | ❌ Chưa khai báo |
| OpenTelemetry | ❌ Chưa có code (biến môi trường `OTEL_EXPORTER_URL` đã được lên kế hoạch trong docker-compose comment) |
| Scheduled jobs | ❌ Không có (không có APScheduler/Celery) |
| Dockerfile | ❌ **Lỗi**: `CMD uvicorn src.api.web_app:app` nhưng `src/api/web_app.py` không tồn tại; bản thân `server.py` cũng không import được |

Env dự kiến cho service (theo docker-compose comment): `APP_PORT=8082`, `SERVICE_NAME=ai-service`, `VECTOR_DB_URL`, `RABBITMQ_URL=amqp://guest:guest@localhost:5672`, `OTEL_EXPORTER_URL=http://localhost:4317`.

## 7. Việc cần làm / Kế hoạch phát triển

1. **Tạo `src/api/web_app.py` (hoặc sửa Dockerfile)** — sửa lỗi khởi động.
2. **Implement endpoints FastAPI**: health check, semantic search, recommendations, sau đó mở Swagger tại `/api`.
3. **Embedding pipeline**: load model phoBERT/sentence-transformers, làm sạch + embedding metadata tiếng Việt, upsert vào vector DB (chọn Milvus/Weaviate/Pinecone hoặc pgvector), viết hàm query semantic search.
4. **Collaborative filtering**: xử lý `ratings.csv`, xây model (SVD/matrix factorization hoặc similarity-based), sinh gợi ý theo user.
5. **Tích hợp RabbitMQ**: consumer nhận yêu cầu gợi ý từ backend, producer trả kết quả.
6. **Bổ sung dependencies** đầy đủ vào `pyproject.toml` (torch, sentence-transformers, pika, vector-db client, pyyaml...).
7. **Xóa hoặc tách** các file leftover từ project LM trước đó (`config/config.yaml`, `checkpoint_manager.py`, `docs/script.md`) để tránh nhầm lẫn.
8. **Viết tests** trong `tests/`.