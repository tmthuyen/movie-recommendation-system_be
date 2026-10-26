# AI-SERVICE — Movie Recommendation AI Service (Python)

> Tài liệu mô tả service `ai-service/` trong dự án **Movie App - Recommendation System**.

## 1. Tổng quan / Mục tiêu của service

`ai-service/` là **microservice AI bằng Python** trong hệ thống gợi ý phim. Theo thiết kế (README), service này đảm nhiệm hai chức năng lõi:

1. **Semantic Search tiếng Việt**: tìm kiếm phim theo ngữ nghĩa trên dữ liệu metadata tiếng Việt (fetch từ TMDB với `language=vi-VN`), dùng embedding (BERT/phoBERT/sentence-transformers) lưu trong Vector Database, kèm baseline lexical search bằng TF-IDF/BM25.
2. **Collaborative Filtering (Lọc cộng tác)**: gợi ý phim dựa trên dữ liệu rating của người dùng (MovieLens), không dùng thuật toán phụ thuộc nội dung phim.

Service dự kiến chạy trên **port 8082** (AI APIs: `http://localhost:8082/api`), dùng **FastAPI**, giao tiếp với backend NestJS qua **RabbitMQ**, và có OpenTelemetry cho quan sát.

> ⚠️ **Trạng thái thực tế (cập nhật 2026-10-26)**:
> - ✅ **Đã có**: FastAPI `src/api/server.py` (port 8082, prefix `/api/recommendations`), embedding + Chroma vector DB, ALS collaborative filtering, RabbitMQ consumer (`recommendation.queue` + `interaction.queue`), Redis, OpenTelemetry, TrainingScheduler.
> - ⚠️ **Còn tồn tại**: một số route semantic (`/search`, `/hybrid`) còn lỗi 500; CORS chưa có `http://localhost:3002`; Dockerfile đang comment toàn bộ. Xem mục 7.

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

### Tín hiệu tương tác realtime (band 5)
- Backend publish **`eventType=interaction.created`** (routing key `interaction.event`) cho like/unlike, comment, rating và click lần đầu; cron 24h publish `training.batch`.
- `score` do backend tính sẵn theo **band 5** (`like=5`, `comment=4`, `click=1` tăng dần tối đa 5, `rating=1..5`; unlike `score=-5`, `removed=true`). Client **không gửi score**.
- `InteractionEventHandler` ưu tiên `payload.score`; fallback map band 5 nếu thiếu, rồi chuẩn hoá `score / 5.0` và clamp `[-1, 1]` cho EMA vector semantic + CF.
- `training.batch` gồm seed ratings + interactions app (`score` band 5); ALS dùng cột `rating` nếu có, nếu không dùng `score` (clip `0.1..5.0`).

## 6. Tích hợp hạ tầng (trạng thái)

| Thành phần | Trạng thái |
|---|---|
| RabbitMQ | ✅ Consumer `interaction.queue` (`interaction.event` + `training.batch`) và `recommendation.queue` (`movie.#`) qua `aio-pika`; có DLX/DLQ + retry queue |
| Redis | ✅ `RedisStore` (`REDIS_ENABLED=true`) |
| Vector DB | ✅ ChromaDB persist `./data/chroma_db` (`VECTOR_DB_PROVIDER=chroma`) |
| OpenTelemetry | ✅ `configure_tracing` (`OTEL_ENABLED=true`, endpoint `:4318`) |
| Scheduled jobs | ✅ `TrainingScheduler` (retrain ALS sau batch) |
| Dockerfile | ⚠️ Toàn bộ nội dung đang **comment** — chưa dùng để build image; chạy local bằng `uvicorn src.api.server:app` |

Env dự kiến cho service (theo docker-compose comment): `APP_PORT=8082`, `SERVICE_NAME=ai-service`, `VECTOR_DB_URL`, `RABBITMQ_URL=amqp://guest:guest@localhost:5672`, `OTEL_EXPORTER_URL=http://localhost:4317`.

## 7. Trạng thái triển khai & việc còn lại

**Đã có trong code**:
- FastAPI app `src/api/server.py`: health + recommendations routes, prefix `/api/recommendations`.
- Embedding + Chroma vector store (`services/embedding_service.py`, `core/integrations.py`).
- ALS collaborative filtering (`services/model_training_service.py`, notebooks `08_collaborative_filtering_V5/V6`).
- RabbitMQ: `recommendation.queue` (movie events) + `interaction.queue` (interaction/training), DLQ + retry.
- Redis (`RedisStore`), OpenTelemetry, `TrainingScheduler`, bộ `tests/`.
- Consumer cập nhật vector realtime từ `interaction.created` với score band 5.

**Việc còn lại / đã biết**:
1. `/search` và `/hybrid` còn lỗi 500 — cần kiểm tra embedding/collection khi có dữ liệu.
2. CORS chưa khai báo `http://localhost:3002` (frontend hiện tại) — thêm vào `CORS_ORIGINS` khi gọi trực tiếp.
3. Chưa có consumer cho preference data từ backend.
4. Dashboard cần aggregate/filter theo `createdAt`.
5. Dockerfile đang comment toàn bộ; hiện chạy local bằng `uvicorn src.api.server:app --host localhost --port 8082`.