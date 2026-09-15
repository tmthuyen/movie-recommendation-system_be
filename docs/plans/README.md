# Kế hoạch đồ án — Movie App & Recommendation System

> Đây là kế hoạch tổng thể để phát triển trọn vẹn **2 service** (backend + ai-service) theo từng giai đoạn.
> Chi tiết triển khai từng service ở các file riêng:
> - [V2_backend-plan.md](./V2_backend-plan.md) — Kế hoạch phát triển **backend** (NestJS)
> - [ai-service-plan.md](./ai-service-plan.md) — Kế hoạch phát triển **ai-service** (Python/FastAPI)

---

## 1. Tóm tắt dự án

Ứng dụng **web phim** với hệ thống **gợi ý phim thông minh**, gồm 2 phần:

| Phần | Công nghệ | Vai trò |
|---|---|---|
| **backend** | NestJS + PostgreSQL | Web phim: CRUD phim, xem phim, tương tác user (đánh giá, yêu thích, xem), data lấy từ **TMDB** |
| **ai-service** | Python + FastAPI | Gợi ý phim: **semantic search tiếng Việt** + **collaborative filtering** |

Hai service **giao tiếp bất đồng bộ qua RabbitMQ** và **gọi HTTP** khi cần kết quả tức thời.

---

## 2. Hiện trạng

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

> ⚠️ **Chốt quan trọng theo chủ dự án:** các bước *format data khớp DB của app*, *lưu vector search*, *kết nối giao tiếp 2 service* chỉ tiến hành **sau khi dịch xong sang tiếng Việt**.

---

## 3. Kiến trúc mục tiêu

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

### Hạ tầng dùng chung (docker-compose)

| Thành phần | Trạng thái | Ghi chú |
|---|---|---|
| PostgreSQL | cần thêm | db chính của backend (auth đã dùng) |
| RabbitMQ | ✅ có (compose) | message broker giữa 2 service |
| Redis | ✅ có (compose) | cache backend + job queue ai-service |
| Vector DB | ❌ chưa có | đề xuất **Qdrant** (đơn giản, nhẹ, có client Python) |
| Observability | ✅ có (compose) | Jaeger/Prometheus/Logstash |

---

## 4. Giao tiếp giữa 2 service

### 4.1 Ứng dụng quy chiếu ID — quan trọng nhất cho việc format data

Cần thống nhất **khóa định danh** giữa 3 nguồn:

| Nguồn | Khóa |
|---|---|
| **DB backend** (`movies.id`) | ID nội bộ của app, mọi API/event đều dùng ID này |
| **TMDB** (`tmdb_id`) | Khóa join với dữ liệu ai-service (metadata tiếng Việt) |
| **MovieLens** (`movie_id` + `tmdb_id` qua `links.csv`) | Dữ liệu rating gốc cho collaborative filtering |

Mapping bắt buộc: `movies.tmdb_id` (backend) ↔ `tmdb_id` (ai-service index) thông qua bảng `links.csv` để nối rating MovieLens → phim của app.

### 4.2 RabbitMQ (bất đồng bộ)

- **Exchange:** `movie.events` (kiểu `topic`)
- **Routing keys / Message:**

| Event | Routing key | Nội dung | AI service làm gì |
|---|---|---|---|
| Thêm phim mới | `movie.created` | toàn bộ metadata phim | **upsert vector + catalog** (lưu embedding để search) |
| Sửa phim | `movie.updated` | metadata mới | cập nhật vector + catalog |
| Xóa phim | `movie.deleted` | `{ movieId, tmdbId }` | xóa vector + catalog khỏi index |
| User tương tác | `interaction.tracked` | `{ userId, movieId, action, ratingValue, timestamp }` | gom vào **dữ liệu huấn luyện collaborative filtering** (train định kỳ / online update) |

**Luồng cụ thể:**
1. Admin thêm/sửa phim hoặc TMDB Sync import phim mới → backend **publish** `movie.created/updated/deleted`.
2. User đánh giá/thích/xem → backend **publish** `interaction.tracked`.
3. AI service **consume** các event → cập nhật vector DB + dữ liệu train collab **mà không cần hỏi lại backend từng record**.
4. Khi frontend cần **kết quả tức thời** (tìm kiếm, gợi ý) → backend **gọi HTTP** đến ai-service.

---

## 5. Roadmap tổng thể

> Kế hoạch triển khai **theo từng phần**, mỗi phần có thể code + kiểm thử độc lập trước khi sang phần sau.

| Giai đoạn | Nội dung | Service | Phụ thuộc |
|---|---|---|---|
| **P0** | Dịch xong dữ liệu tiếng Việt (metadata/overview/title) | ai-service | đang chạy |
| **P1** | Movie domain + CRUD + TMDB sync | backend | – |
| **P2** | Tương tác user (rate/like/watch/favorite) | backend | P1 |
| **P3** | Hoàn thiện AI pipeline: format data khớp DB, embedding + vector search, collab filtering, API FastAPI | ai-service | **P0** (điều kiện chốt) |
| **P4** | Giao tiếp 2 service: RabbitMQ events + HTTP proxy, đồng bộ vector search khi thêm phim | cả 2 | P2, P3 |
| **P5** | Cache, tổng hợp, test E2E, hoàn thiện hạ tầng (Docker, observability) | cả 2 | P4 |

### Ước lượng thời gian (tham khảo)

| Giai đoạn | Ước lượng |
|---|---|
| P0 — Dịch tiếng Việt (đang chạy) | 1–2 tuần (notebook/Colab) |
| P1 — Movie CRUD + TMDB sync | 1 tuần |
| P2 — Interaction + event | 3–5 ngày |
| P3 — AI pipeline + API | 2–3 tuần |
| P4 — Kết nối 2 service | 1 tuần |
| P5 — Hoàn thiện + test | 1 tuần |

**Tổng:** ~5–6 tuần (sau khi P0 xong).

---

## 6. Đi sâu từng service

| | File |
|---|---|
| Chi tiết hiện trạng + kế hoạch backend | [V2_backend-plan.md](./V2_backend-plan.md) |
| Chi tiết hiện trạng + kế hoạch ai-service | [ai-service-plan.md](./ai-service-plan.md) |