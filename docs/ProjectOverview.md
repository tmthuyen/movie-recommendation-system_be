# Kế hoạch đồ án — Movie App & Recommendation System

> ⚠ **Tài liệu lịch sử**: nội dung chính dưới đây là **kế hoạch/ảnh chụp giai đoạn đầu** của dự án. Hiện trạng đã thay đổi đáng kể — xem mục **2.1 Hiện trạng xác minh 2026-11-04** và các tài liệu hiện trạng:
>
> - [BACKEND.md](./BACKEND.md) — backend NestJS
> - [AI-SERVICE.md](./AI-SERVICE.md) — ai-service FastAPI
> - [FRONTEND.md](./FRONTEND.md) — frontend Next.js
> - [DATABASE-DESIGN.md](./DATABASE-DESIGN.md) — thiết kế DB thực tế
>
> **Ngày xác minh phần hiện trạng: 2026-11-04.**

> Chi tiết triển khai từng service ở các file riêng:
>
> - [plans/V1_backend_development-plan.md](./plans/V1_backend_development-plan.md) — Kế hoạch phát triển **backend** (NestJS)
> - [plans/V7_ai-service-architecture.md](./plans/V7_ai-service-architecture.md) — Kiến trúc **ai-service** (Python/FastAPI)

---

## 1. Tóm tắt dự án

Ứng dụng **web phim** với hệ thống **gợi ý phim thông minh**, gồm 3 phần:

| Phần           | Công nghệ           | Vai trò                                                                                        |
| -------------- | ------------------- | ---------------------------------------------------------------------------------------------- |
| **backend**    | NestJS + PostgreSQL | Web phim: auth/RBAC, CRUD phim, xem phim, tương tác user (đánh giá, yêu thích, xem), data lấy từ **TMDB** |
| **ai-service** | Python + FastAPI    | Gợi ý phim: **semantic search tiếng Việt** + **collaborative filtering**                       |
| **frontend**   | Next.js + Tailwind + shadcn/ui | Giao diện user/admin, gọi backend qua HTTP                                            |

Hai service backend ↔ ai-service **giao tiếp bất đồng bộ qua RabbitMQ** và **gọi HTTP** khi cần kết quả tức thời (module recommendations của backend).

---

## 2. Hiện trạng (lịch sử — giai đoạn đầu, không còn đúng)

> Phần này giữ lại để tham khảo lịch sử. **Không dùng làm hiện trạng** — xem mục 2.1.

### backend — đã có nền, còn thiếu phần lõi

- ✅ Scaffold NestJS: auth JWT, RBAC (users/roles/permissions), health check, Swagger.
- ✅ Observability: OpenTelemetry, Winston, CLS.
- ❌ Chưa có **module Movie / Genre / tương tác user**.
- ❌ Chưa kết nối Redis, RabbitMQ, và **chưa gọi ai-service**.

### ai-service — data gần xong, đang dịch sang tiếng Việt

- ✅ Fetch MovieLens (movies, ratings, links) + **metadata TMDB tiếng Việt** (~10.6k phim, JSONL theo batch).
- ✅ Toolkit làm sạch văn bản tiếng Việt (`src/utils/`).
- ✅ **Baseline lexical search** (TF-IDF/BM25) ở mức notebook, artifact `catalog_vi.parquet`.
- 🔄 **Đang dịch** dữ liệu sang tiếng Việt (`notebooks/translation.ipynb`, Anh → Việt).
- ❌ Chưa có API FastAPI thật (`src/api/server.py` chỉ là stub), chưa embedding + vector DB, chưa collaborative filtering, chưa RabbitMQ; Dockerfile còn lỗi.

> ⚠️ **Chốt quan trọng theo chủ dự án:** các bước _format data khớp DB của app_, _lưu vector search_, _kết nối giao tiếp 2 service_ chỉ tiến hành **sau khi dịch xong sang tiếng Việt**.

### 2.1 Hiện trạng xác minh 2026-11-04

**backend (NestJS `:8081`, global prefix `api`)**
- ✅ Đầy đủ module: `auth` (JWT + refresh cookie + Redis session + Google OAuth), `users`, `roles`, `movies`, `genres`, `countries`, `peoples`, `ratings`, `comments`, `interactions`, `files`, `failed-events`, `health`, `recommendations`.
- ✅ Redis (session/blacklist/rate-limit), RabbitMQ producer (`movie.exchange`, `user.exchange`, `interaction.exchange`) + consumer DLQ ghi `failed_events`, Socket.IO realtime, cron `training.batch`.
- ✅ `GET /api/movies/search` (search nâng cao) hoạt động; `GET /api/recommendations/similar/:id` proxy HTTP sang ai-service; `semantic-search`/`hybrid-search` còn **stub**.
- ⚠ `permissions` vẫn là module stub; `@Roles` chỉ được enforce ở `/api/roles` (RolesGuard chỉ gắn ở RolesController). Chi tiết: [BACKEND.md](./BACKEND.md).

**ai-service (FastAPI `:8082`, prefix `/api/recommendations`)**
- ✅ FastAPI thật với các route health/tracing/auth, semantic-search, similar, search, hybrid-search; embedding Sentence-Transformers + ChromaDB; ALS (implicit); RabbitMQ consumer (`recommendation.queue`, `interaction.queue`); Redis; OpenTelemetry; TrainingScheduler; bộ test `tests/unit/`.
- ⚠ `/search` nhiều khả năng lỗi 500 (route đọc `pageSize` trong khi schema là `page_size`); CORS mặc định thiếu `:3002`; Dockerfile comment toàn bộ. Chi tiết: [AI-SERVICE.md](./AI-SERVICE.md).

**frontend (Next.js `:3002`)**
- ✅ App Router với các trang user/admin thật (auth, profile, movies, my-history/favorites, dashboard, CRUD admin).
- ✅ Dùng `GET /api/movies/search` cho home (latest/top-rated/most-viewed) và `/api/recommendations/similar/:id` cho “Phim tương tự”; onboarding sở thích V15 đã mount.
- ⚠ Trang `/movies` vẫn lọc/sắp xếp client-side; lệch shape `country` vs `countries`. Chi tiết: [FRONTEND.md](./FRONTEND.md).

**Hạ tầng**
- PostgreSQL (TypeORM `synchronize: true`, không migration), Redis, RabbitMQ (DLQ), ChromaDB, Kong gateway (`:8000`), Prometheus/OpenTelemetry. Dockerfile ai-service chưa dùng được.

---

## 3. Kiến trúc mục tiêu (lịch sử)

> Sơ đồ dưới là kiến trúc **mục tiêu ban đầu**. Hiện trạng đã gần đạt; khác biệt chính: ai-service dùng **ChromaDB** (không phải Qdrant bắt buộc), CF dùng **ALS (implicit)**, backend có thêm module recommendations proxy HTTP.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                             Frontend (web)                              │
│                    (xem phim, CRUD phim, tương tác)                      │
└──────────────────────────────────────┬──────────────────────────────────┘
                                       │ HTTP
┌──────────────────────────────────────▼──────────────────────────────────┐
│                            backend (NestJS :8081)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────────────────┐ │
│  │ Auth/RBAC   │  │ Movie/Genre  │  │ Interaction (rate/like/watch)    │ │
│  └─────────────┘  └──────────────┘  └──────────────────────────────────┘ │
│  ┌───────────────────────┐  ┌─────────────────────────────────────────┐  │
│  │ TMDB Sync Service     │  │ Recommendation Proxy (HTTP → ai-service)│  │
│  └───────────────────────┘  └─────────────────────────────────────────┘  │
│  ┌───────────────────────┐                                              │
│  │ Event Publisher        ─────────────┐                                 │
│  └─────────────────────────────────────┘                                 │
└───────────────────────────────────────────┬─────────────────────────────┘
                                            │ RabbitMQ (bất đồng bộ)
┌──────────────────────────────────────────▼─────────────────────────────┐
│                          ai-service (FastAPI :8082)                      │
│  ┌──────────────────┐  ┌──────────────────────┐  ┌───────────────────┐   │
│  │ Semantic Search  │  │ Collaborative Filter │  │ Event Consumer    │   │
│  │ (embedding + DB) │  │ (SVD / similarity)   │  │ (movie.* ,        │   │
│  └──────────────────┘  └──────────────────────┘  │  interaction.*)   │   │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ Embedding pipeline (phoBERT / SBERT tiếng Việt) → Vector DB      │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────┬───────────────────────────────────────┘
                                   │ HTTP (pull dữ liệu huấn luyện khi cần)
                    ┌──────────────▼──────────────┐
                    │  backend DB (PostgreSQL)     │
                    │  (movie, interaction, user)  │
                    └─────────────────────────────┘
```

### Hạ tầng dùng chung (hiện trạng 2026-11-04)

| Thành phần    | Trạng thái      | Ghi chú                                              |
| ------------- | --------------- | ---------------------------------------------------- |
| PostgreSQL    | ✅ dùng         | DB chính của backend (TypeORM `synchronize: true`)   |
| RabbitMQ      | ✅ dùng         | `movie.exchange`, `user.exchange`, `interaction.exchange` + DLQ |
| Redis         | ✅ dùng         | backend: session/blacklist/rate-limit; ai-service: `RedisStore` |
| Vector DB     | ✅ ChromaDB     | ai-service persist `./data/chroma_db`; hỗ trợ qdrant/redis/memory qua env |
| Gateway       | ✅ Kong `:8000` | `/api` → `:8081`, `/api/recommendations` → `:8082`   |
| Observability | ✅ OpenTelemetry + Prometheus | backend Winston/OTel; ai-service `/api/metrics` |
| Docker        | ⚠ một phần      | `ai-service/Dockerfile` đang comment toàn bộ — chưa build được |

---

## 4. Giao tiếp giữa 2 service

### 4.1 Ứng dụng quy chiếu ID — quan trọng nhất cho việc format data

Cần thống nhất **khóa định danh** giữa 3 nguồn:

| Nguồn                                                  | Khóa                                                   |
| ------------------------------------------------------ | ------------------------------------------------------ |
| **DB backend** (`movies.id`)                           | ID nội bộ của app, mọi API/event đều dùng ID này       |
| **TMDB** (`tmdb_id`)                                   | Khóa join với dữ liệu ai-service (metadata tiếng Việt) |
| **MovieLens** (`movie_id` + `tmdb_id` qua `links.csv`) | Dữ liệu rating gốc cho collaborative filtering         |

Mapping bắt buộc: `movies.tmdb_id` (backend) ↔ `tmdb_id` (ai-service index) thông qua bảng `links.csv` để nối rating MovieLens → phim của app.

### 4.2 RabbitMQ (bất đồng bộ) — thiết kế ban đầu (lịch sử)

> Routing key/exchange dưới đây là **thiết kế ban đầu**; hiện trạng dùng tên khác — xem mục 4.3.

- **Exchange:** `movie.events` (kiểu `topic`)
- **Routing keys / Message:**

| Event          | Routing key           | Nội dung                                              | AI service làm gì                                                                      |
| -------------- | --------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Thêm phim mới  | `movie.created`       | toàn bộ metadata phim                                 | **upsert vector + catalog** (lưu embedding để search)                                  |
| Sửa phim       | `movie.updated`       | metadata mới                                          | cập nhật vector + catalog                                                              |
| Xóa phim       | `movie.deleted`       | `{ movieId, tmdbId }`                                 | xóa vector + catalog khỏi index                                                        |
| User tương tác | `interaction.tracked` | `{ userId, movieId, action, ratingValue, timestamp }` | gom vào **dữ liệu huấn luyện collaborative filtering** (train định kỳ / online update) |

**Luồng cụ thể:**

1. Admin thêm/sửa phim hoặc TMDB Sync import phim mới → backend **publish** `movie.created/updated/deleted`.
2. User đánh giá/thích/xem → backend **publish** `interaction.tracked`.
3. AI service **consume** các event → cập nhật vector DB + dữ liệu train collab **mà không cần hỏi lại backend từng record**.
4. Khi frontend cần **kết quả tức thời** (tìm kiếm, gợi ý) → backend **gọi HTTP** đến ai-service.

### 4.3 Kênh giao tiếp thực tế (xác minh 2026-11-04)

- **RabbitMQ** (backend producer; ai-service consumer):
  - `movie.exchange` — routing key `movie.created` / `movie.updated` / `movie.deleted`.
  - `user.exchange` — `user.created` / `user.updated` / `user.deleted` / `user.email_verification.requested` / `user.email_verified`.
  - `interaction.exchange` — `interaction.event` (`eventType=interaction.created`) và `training.batch`.
  - DLQ: `recommendation.queue.dlq` + `interaction.queue.dlq` → backend consumer ghi bảng `failed_events`.
- **HTTP**:
  - backend → ai-service: `GET {AI_SERVICE_URL}/similar/:id` (module recommendations; mặc định `http://localhost:8082/api/recommendations`).
  - frontend → backend: `http://localhost:8081/api` (axiosClient), chưa dùng Kong gateway.
- Chi tiết đầy đủ ở [BACKEND.md](./BACKEND.md) mục RabbitMQ và [AI-SERVICE.md](./AI-SERVICE.md).

---

## 5. Roadmap tổng thể (lịch sử — đã hoàn thành phần lớn)

> Bảng dưới là roadmap ban đầu. Tính đến 2026-11-04: P0–P4 đã triển khai (backend + ai-service + frontend + kênh giao tiếp); P5 còn một số việc (Dockerfile ai-service, test/coverage, hoàn thiện semantic/hybrid phía backend).

> Kế hoạch triển khai **theo từng phần**, mỗi phần có thể code + kiểm thử độc lập trước khi sang phần sau.

| Giai đoạn | Nội dung                                                                                              | Service    | Phụ thuộc               |
| --------- | ----------------------------------------------------------------------------------------------------- | ---------- | ----------------------- |
| **P0**    | Dịch xong dữ liệu tiếng Việt (metadata/overview/title)                                                | ai-service | đang chạy               |
| **P1**    | Movie domain + CRUD + TMDB sync                                                                       | backend    | –                       |
| **P2**    | Tương tác user (rate/like/watch/favorite)                                                             | backend    | P1                      |
| **P3**    | Hoàn thiện AI pipeline: format data khớp DB, embedding + vector search, collab filtering, API FastAPI | ai-service | **P0** (điều kiện chốt) |
| **P4**    | Giao tiếp 2 service: RabbitMQ events + HTTP proxy, đồng bộ vector search khi thêm phim                | cả 2       | P2, P3                  |
| **P5**    | Cache, tổng hợp, test E2E, hoàn thiện hạ tầng (Docker, observability)                                 | cả 2       | P4                      |

### Ước lượng thời gian (tham khảo)

| Giai đoạn                        | Ước lượng                 |
| -------------------------------- | ------------------------- |
| P0 — Dịch tiếng Việt (đang chạy) | 1–2 tuần (notebook/Colab) |
| P1 — Movie CRUD + TMDB sync      | 1 tuần                    |
| P2 — Interaction + event         | 3–5 ngày                  |
| P3 — AI pipeline + API           | 2–3 tuần                  |
| P4 — Kết nối 2 service           | 1 tuần                    |
| P5 — Hoàn thiện + test           | 1 tuần                    |

**Tổng:** ~5–6 tuần (sau khi P0 xong).

---

## 6. Đi sâu từng service

|                                           | File                                       |
| ----------------------------------------- | ------------------------------------------ |
| Chi tiết hiện trạng backend               | [BACKEND.md](./BACKEND.md)                 |
| Chi tiết hiện trạng ai-service            | [AI-SERVICE.md](./AI-SERVICE.md)           |
| Chi tiết hiện trạng frontend              | [FRONTEND.md](./FRONTEND.md)               |
| Thiết kế DB thực tế                       | [DATABASE-DESIGN.md](./DATABASE-DESIGN.md) |
| Kế hoạch backend (lịch sử)                | [plans/V1_backend_development-plan.md](./plans/V1_backend_development-plan.md) |
| Kiến trúc ai-service (lịch sử)            | [plans/V7_ai-service-architecture.md](./plans/V7_ai-service-architecture.md) |
