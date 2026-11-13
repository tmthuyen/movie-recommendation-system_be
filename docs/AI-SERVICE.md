# AI-SERVICE — Movie Recommendation AI Service (Python)

> Tài liệu mô tả service `ai-service/` trong dự án **Ứng dụng mô hình ngôn ngữ vào hệ thống gợi ý phim**.
>
> **Ngày xác minh: 2026-11-04.** Nội dung được đối chiếu trực tiếp với code `ai-service/src/`, `Dockerfile`, `pyproject.toml`, `tests/` và tài liệu `ai-service/docs/` (file:line ghi kèm khi cần). Phần chưa chạy runtime ghi rõ “cần xác minh”.

## 1. Tổng quan

`ai-service/` là **microservice AI bằng Python (FastAPI)**, chạy **port 8082**, prefix API **`/api/recommendations`**. Service đảm nhiệm:

1. **Semantic Search tiếng Việt**: embedding metadata phim (title, overview, genres…) bằng Sentence-Transformers, lưu trong vector DB (mặc định ChromaDB).
2. **Collaborative Filtering / Hybrid**: ALS (implicit) + vector CF/user-profile, kết hợp semantic để trả gợi ý theo user.
3. **Đồng bộ dữ liệu qua RabbitMQ**: consume `movie.exchange` (`movie.#`) và `interaction.exchange` (`interaction.event`, `training.batch`); cập nhật vector realtime + retrain ALS theo batch.
4. **Hạ tầng quan sát**: OpenTelemetry tracing, Prometheus metrics, Redis, health check.

> Trạng thái 2026-11-04: code service **đã triển khai thật** (không còn là stub). Một số điểm còn lệch/bug được liệt kê ở mục 7.

## 2. Công nghệ (theo `pyproject.toml`)

| Thành phần | Công nghệ / ghi chú |
|---|---|
| Framework API | FastAPI + Uvicorn (`pyproject.toml:18-19`) |
| Data / ML | NumPy, Pandas, scikit-learn, PyArrow (`:11-13,62`) |
| Embedding | `sentence-transformers` (model mặc định `paraphrase-multilingual-MiniLM-L12-v2`, 384 chiều — `core/config.py:63-73`) |
| TF-IDF / BM25 | `scikit-learn`, `rank-bm25`, `underthesea` (`:13,38-39`) |
| Collaborative Filtering | `implicit` (ALS) (`:60`) |
| Vector DB | `chromadb` (mặc định), hỗ trợ `qdrant-client` (`:52-53`; provider cấu hình `core/config.py:52-56`) |
| Message queue | `aio-pika` (`:46`) |
| Cache / session | `redis` (`:49`) |
| Auth | `python-jose[cryptography]` — verify JWT Bearer (`:57`; middleware `api/middleware.py:105-138`) |
| Tracing / metrics | OpenTelemetry (`:22-27`), Prometheus (`:33-35`) |
| Cron | `apscheduler` (`:30`) |
| Storage | `boto3` (R2/S3 — mapping/model) (`:61`) |
| Dev / test | `pytest`, `pytest-cov`, `pre-commit`, `black`, `isort` (`:65-74`) |

Python yêu cầu: `>=3.10` (`pyproject.toml:6`). Đóng gói bằng `pip install -e .` / `pip install -e .[dev]`.

## 3. Cấu trúc thư mục (hiện trạng)

```
ai-service/
├── .env / .env.example          # cấu hình runtime (JWT, DB, RabbitMQ, Redis, R2…)
├── Dockerfile                   # ⚠ toàn bộ nội dung đang comment (13 dòng)
├── pyproject.toml               # dependencies + pytest config
├── README.md
├── docs/                        # INITITAL_DATA.md, KHOI_DONG_FASTAPI.md, models/CF_Model_Report.md
├── config/config.yaml           # leftover config loader (không phải cấu hình chính)
├── data/                        # (gitignored) movielens/, tmdb/, chroma_db/, training/models/
├── experiments/                 # notebook, benchmark, ground-truth, figure, metrics CF
├── scripts/                     # build_vector_db, train_baseline, benchmark/evaluate, ground-truth…
├── notebooks/                   # fetch_data.ipynb
├── src/
│   ├── api/
│   │   ├── server.py            # FastAPI app + lifespan khởi tạo toàn bộ service
│   │   ├── middleware.py        # logging request-id + auth JWT middleware
│   │   ├── response.py          # success() / paginated() / failure()
│   │   ├── schemas.py           # Pydantic request/response + event schema
│   │   ├── dependencies/auth.py # get_current_user (đọc request.state.user)
│   │   └── routes/
│   │       ├── health.py        # /health, /tracing, /test-auth
│   │       └── recommendations.py # semantic-search, similar, search, hybrid-search, hybrid/no-auth
│   ├── core/
│   │   ├── config.py            # Settings (pydantic-settings) + allowed_origins
│   │   ├── integrations.py      # VectorStore (Chroma/Qdrant/Redis/memory) + TrainingScheduler
│   │   ├── message_queue.py     # RabbitMQ consumer movie.exchange
│   │   ├── interaction_queue.py # RabbitMQ consumer interaction.exchange
│   │   ├── redis_service.py     # RedisStore
│   │   ├── monitoring.py        # check_infra + Prometheus system metrics
│   │   ├── telemetry.py         # OpenTelemetry
│   │   └── tokenizer.py         # tokenizer tiếng Việt
│   ├── models/                  # base_model.py, tfidf_search.py, bm25_search.py
│   ├── services/                # embedding, recommend, movie/interaction handler, training, mapping, storage
│   └── utils/                   # clean_text_utils, teencode_dict, logger, config_loader, stopwords…
└── tests/
    ├── conftest.py               # env JWT trước import src.*, FakeChroma/FakeModel, stub boto3 (test-only)
    ├── unit/                     # 1 file test / 1 module src (24 file, 655 test) — xem bảng dưới
    │   ├── api/                  # response, schemas, middleware, server, dependencies/auth, routes/{health,recommendations}
    │   ├── core/                 # base_model, config, integrations, interaction_queue, message_queue,
    │   │                         # monitoring, redis_service, telemetry, tokenizer
    │   ├── data/                 # data_loader
    │   ├── models/               # tfidf_search, bm25_search
    │   ├── services/             # embedding, interaction_event_handler, mapping, model_training,
    │   │                         # movie_event_handler, recommend, storage
    │   └── utils/                # checkpoint_manager, clean_text_utils, config_loader, experiment_tracker,
    │                             # logger, teencode_dict
    └── scripts/                  # 4 file test cho scripts/benchmark_* + evaluation/ground-truth (không thuộc src/)
```

**Quy ước test**: `src/<pkg>/<file>.py` ⇔ `tests/unit/<pkg>/test_<file>.py`; trong mỗi file, mỗi public class/def có một `Test<Class>`/`Test<Func>` với happy path + error path. Chi tiết mapping + bug: `docs/plans/V21_testing_ai-service-test-structure.md`.

Ghi chú: các thư mục `src/core/`, `src/models/`, `src/services/` **đã tồn tại** (khác với mô tả cũ trong tài liệu trước). `Dockerfile` hiện **không dùng được** để build image (xem mục 7).

## 4. Luồng khởi động (`src/api/server.py:29-102`)

`lifespan` của FastAPI khởi tạo theo thứ tự:

1. Thread `update_metrics` (Prometheus system metrics) — `:31-40`.
2. `VectorStore(settings)` + `await start()` (ChromaDB/Qdrant…) — `:42-44`.
3. `RecommendService(vector_store, embedding_service)` — `:46-50`.
4. `MovieEventHandler(recommend_service)` — dispatcher `movie.created/updated/deleted` — `:52-53`.
5. `TrainingScheduler(settings, app_state)` + `start()` — `:55-57`.
6. `InteractionEventHandler(vector_store, training_scheduler)` — `:59-62`.
7. `MessageQueue` consume `movie.exchange` — `:64-67`.
8. `InteractionQueue` consume `interaction.exchange` — `:69-72`.
9. `RedisStore` — `:74-76`.
10. Load mapping `models/mappings.json` từ R2 về `data/training/models/mappings.json` — `:78-82`.

Tắt service theo thứ tự ngược lại (`:94-101`).

## 5. API hiện có

Base URL: `http://localhost:8082/api/recommendations`. Swagger: `/docs`.

| Method | Path | Auth | Request | Response | Trạng thái |
|---|---|---|---|---|---|
| GET | `/health` | Public | — | `{success, statusCode, message, result: {status, infrastructure}}` | ✅ Dùng `check_infra()` (`routes/health.py:17-29`). |
| GET | `/tracing` | Public | — | envelope, `result` = JSON từ `GET http://localhost:8081/api/health` | ✅ Test tracing; phụ thuộc backend đang chạy (`health.py:32-41`). |
| GET | `/test-auth` | JWT | Bearer token | envelope, `result` = `CurrentUser {sub,email,fullName,scopes,jti}` | ✅ (`health.py:45-54`). |
| GET | `/semantic-search` | Public | `keyword` (bắt buộc, 1–500), `topK` (1–100, mặc định 10) | envelope + `pagination`; `result` = `SimilarMoviesResponse[]` (`id, similarityScore, score, rank, title, titleVi, overview, overviewVi`) | ✅ (`routes/recommendations.py:46-65`; schema `api/schemas.py:59-67`). |
| GET | `/similar/{movie_id}` | Public | path `movie_id` (int), `topK` (1–50, mặc định 10) | envelope + `pagination` | ✅ Gọi `RecommendService.similar_movies`; `ValueError` → 404 (`recommendations.py:74-94`). |
| GET | `/search` | Public | query `query` (1–500), `model` (mặc định `tfidf`), `page` (≥1), `page_size` (1–100, mặc định 10) | envelope + `pagination` | ⚠ **Nhiều khả năng lỗi 500**: route đọc `request.pageSize` nhưng schema chỉ có `page_size` (`recommendations.py:102,107,114` vs `schemas.py:60-64`). Cần xác minh runtime. |
| GET | `/hybrid` | **JWT** (Bearer) | `topK` (1–1000, mặc định 100); `userId` lấy từ JWT, không nhận từ query | envelope + `pagination`; `result` = dict kèm `movie_id/fused_rank/rrf_score` (legacy) **và** `id/rank/score` (canonical cho backend) | ✅ (`recommendations.py:204-230`; `HybridRequest` `schemas.py:88-89`). |
| GET | `/hybrid/no-auth` | Public (debug) | `userId`, `topK` (mặc định 10) | envelope + `pagination` | ⚠ API debug không auth — **không dùng production** (`recommendations.py:166-190`). |
| GET | `/api/metrics` | Public | — | Prometheus text | ✅ (`server.py:147-149`). |

### Envelope & lỗi

- Thành công: `{success: true, statusCode, message, result, pagination?}` (`api/response.py:10-30`). `pagination` dùng key **`totalItems/totalPages/currentPage/pageSize`** (`schemas.py:22-26`) — khác backend NestJS (`total/page/limit/totalPages`); backend phải map lại.
- Lỗi validation 422: `{statusCode: 422, message, errorCode: "VALIDATION_ERROR", errors[]}` (`server.py:111-123`).
- Lỗi HTTP: `{statusCode, message, errorCode: "HTTP_<code>"}` (`server.py:126-135`).
- Lỗi auth middleware (401): `{statusCode, message, data: null, errorCode}` (`middleware.py:78-162`).
- `failure()` trong `response.py:33-41` có tồn tại nhưng **không thấy route nào dùng**.

## 6. Dữ liệu & xử lý văn bản

### 6.1 Thu thập dữ liệu (`notebooks/fetch_data.ipynb`)

- Tải **MovieLens Latest Full** từ kagglehub (`grouplens/movielens-latest-full`) → `data/movielens/`.
- Lọc phim "watchable": `rating_count >= 10` và `rating_mean >= 3.0` → join `links` lấy `tmdbId` (16.645 phim).
- Fetch metadata tiếng Việt từ TMDB (`language=vi-VN`), throttle `time.sleep(0.05)`, lưu JSONL theo batch 1000 → tổng **7.912 phim**.
- Metadata: `title_vi`, `overview_vi`, `genres` (tên tiếng Việt), `tagline`, `poster_path`, ngày phát hành…

### 6.2 Làm sạch văn bản (`src/utils/`)

- `clean_text_utils.clean_text(text, type=...)`: chuẩn hoá **Unicode NFC**, tách HTML/entity, URL/email → token, emoji → token, teencode → tiếng Việt chuẩn, số/ngày/phần trăm → token, dấu câu → `TOKENEOS`, dọn khoảng trắng.
- `is_valid_sentence()` / `is_valid_article()`: lọc câu/văn bản quá ngắn, chỉ số, hoặc không phải tiếng Việt.
- Bộ test: `tests/unit/test_clean_text_utils.py` (NFC, HTML, URL, email…).

### 6.3 Tín hiệu tương tác realtime (band 5)

- Backend publish `eventType=interaction.created` (routing key `interaction.event`) cho like/unlike, comment, rating, click; cron 24h publish `training.batch`.
- `score` do backend tính theo band 5 (`like=5`, `comment=4`, `click=1` tăng dần tối đa 5, `rating=1..5`; unlike `score=-5`, `removed=true`). Client không gửi score.
- `InteractionEventHandler` ưu tiên `payload.score`, fallback map band 5, chuẩn hoá `score/5.0`, clamp `[-1,1]` cho EMA vector semantic + CF.
- `training.batch`: ALS dùng cột `rating` nếu có, nếu không dùng `score` (clip `0.1..5.0`).

## 7. Tích hợp hạ tầng & trạng thái

| Thành phần | Trạng thái |
|---|---|
| RabbitMQ | ✅ `aio-pika`; consumer `recommendation.queue` (`movie.#`) và `interaction.queue` (`interaction.event` + `training.batch`); có DLX/DLQ + retry (`core/config.py:20-46`). |
| Redis | ✅ `RedisStore` (`REDIS_ENABLED=true`, mặc định `redis://localhost:6379/0`) (`config.py:48-50`). |
| Vector DB | ✅ Mặc định **ChromaDB** persist `./data/chroma_db`; hỗ trợ `qdrant`, `redis`, `memory` (`config.py:52-70`). |
| Embedding | ✅ Sentence-Transformers, model `paraphrase-multilingual-MiniLM-L12-v2`, 384 chiều (`config.py:63-73`). |
| ALS / Hybrid | ✅ `implicit` + vector CF/user-profile (`config.py:58-65`; `services/recommend_service.py:133-242`). |
| OpenTelemetry | ✅ `configure_tracing` (`OTEL_ENABLED=true`, endpoint `:4318`) (`config.py:16-18`; `server.py:108`). |
| Prometheus | ✅ `/api/metrics` + system metrics thread (`server.py:31-40,147-149`). |
| Cron | ✅ `TrainingScheduler`; cron mặc định `0 3 * * 0`, `MODEL_TRAIN_ENABLED=false` (`config.py:75-76`). |
| Test | ✅ `tests/` có **28 file** (24 unit theo module + 4 scripts), **659 passed / 4 skipped**, coverage **94%** (V21, 2026-11-04). Chạy trong venv project: `.\.venv\Scripts\python -m pytest tests -q --cov=src`. |
| Dockerfile | ⚠ **Toàn bộ 13 dòng đang comment** (`ai-service/Dockerfile:1-13`) — chưa build image được; chạy local bằng uvicorn. |

### Cấu hình CORS

- Mặc định `CORS_ORIGINS="http://localhost:3000,http://localhost:5173"` (`core/config.py:11`) → **thiếu `http://localhost:3002`** (frontend hiện tại) nếu gọi trực tiếp ai-service mà không override env.
- `allowed_origins` tách theo dấu phẩy (`config.py:94-98`); middleware dùng `allow_credentials=True` (`server.py:138-144`).

## 8. Tích hợp với backend NestJS

- **HTTP**: backend `GET /api/recommendations/similar/:id` gọi `${AI_SERVICE_URL}/similar/{id}?topK=...` (mặc định `http://localhost:8082/api/recommendations`) rồi map với DB (`backend/src/modules/recommendations/recommendations.service.ts:15-16,41-107`).
- **RabbitMQ**: backend publish `movie.created/updated/deleted`, `user.*`, `interaction.event`, `training.batch`; ai-service consume và cập nhật vector/ALS (xem `docs/BACKEND.md` mục RabbitMQ).
- **Kong**: `/api/recommendations` → `:8082` (`gateway/kong.yml`); frontend hiện gọi thẳng backend `:8081`.

## 9. Chạy service & kiểm thử

```bash
# trong ai-service/
python -m venv .venv
.\.venv\Scripts\activate        # Windows PowerShell
pip install -e .[dev]

uvicorn src.api.server:app --host localhost --port 8082 --reload

# Test (dùng venv của project — không cần Python global)
.\.venv\Scripts\python.exe -m pytest tests -q --cov=src
# 659 passed / 4 skipped, coverage 94% (V21 — cây test 1-1 với src/)
```
```

Tham chiếu: `ai-service/docs/KHOI_DONG_FASTAPI.md`, `ai-service/README.md`, `ai-service/docs/INITITAL_DATA.md`.

## 10. Việc còn lại / đã biết (cần xác minh runtime)

1. **`/search` lỗi 500**: route dùng `request.pageSize`, schema định nghĩa `page_size` (`recommendations.py:102-115` vs `schemas.py:60-64`) — sửa thành `page_size` hoặc đổi schema.
2. **CORS thiếu `:3002`**: thêm vào `CORS_ORIGINS` khi frontend gọi trực tiếp `:8082`.
3. **Lệch query param semantic-search**: backend/FE đang gửi `query` (`frontend/src/apis/recommendation.api.ts:26-34`) nhưng ai-service yêu cầu `keyword` (`recommendations.py:49-51`).
4. **Dockerfile chưa dùng được** (comment toàn bộ); cần viết lại nếu muốn container hoá.
5. **`/hybrid-search` yêu cầu JWT + `userId` khớp `sub`**; `/hybrid/no-auth` là debug, không dùng production.
6. **Mapping/model storage** phụ thuộc R2 (`S3_*`); nếu thiếu cấu hình, startup có thể bỏ qua mapping (xem log) — cần xác minh.
7. Chưa có consumer cho preference data từ backend.
