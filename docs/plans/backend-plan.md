# Kế hoạch phát triển — BACKEND (NestJS)

> File con của [README.md](./README.md). Tài liệu hiện trạng chi tiết: [docs/BACKEND.md](../BACKEND.md).

## 1. Vai trò của backend

Web phim hoàn chỉnh: hiển thị phim (data gốc từ TMDB lưu trong DB), **CRUD phim mới**, **tương tác user** (đánh giá, yêu thích, xem), và **làm cầu nối** tới ai-service (tìm kiếm ngữ nghĩa + gợi ý).

## 2. Hiện trạng (tóm tắt)

- ✅ Auth JWT + RBAC, Users, Roles, Permissions (stub), Health check, Swagger.
- ✅ TypeORM + PostgreSQL, audit fields, OpenTelemetry, Winston, CLS, interceptors chung.
- ❌ Chưa có Movie/Genre/Interaction domain.
- ❌ Chưa kết nối Redis / RabbitMQ / ai-service.
- ⚠️ `typeorm` khai báo `^1.1.0` bất thường — nên về `0.3.x`.

## 3. Thiết kế DB bổ sung (module mới)

```
users (đã có)                    movies                        genres
+ id                            + id (PK)                     + id
+ email, full_name, ...         + tmdb_id (unique)            + code (unique)
                                + title                        + name
  │ 1                          + overview
  │                            + release_date                  movie_genres (join N-N)
  │ N                          + poster_path                    + movie_id
────────────────────────────   + backdrop_path                  + genre_id
interactions                    + runtime
+ id                            + vote_average / vote_count
+ user_id (FK)                  + popularity
+ movie_id (FK)                 + is_active
+ action (ENUM:                + source (TMDB / MANUAL)
    WATCH, LIKE,                + created_at / updated_at
    RATE, FAVORITE)
+ rating_value (0–5, chỉ khi RATE)
+ created_at
```

- **Bảng join:** `movie_genres` (Movie ↔ Genre, N-N), `user_roles` (đã có).
- **`interactions`** là nguồn dữ liệu cho collaborative filtering khi tích hợp; ràng buộc unique `(user_id, movie_id, action)` để tránh trùng.
- Dùng `synchronize: true` (như hiện tại) khi dev; **chuyển sang migrations** ở giai đoạn P5.

## 4. API dự kiến (thêm mới, giữ prefix `/api`)

### Movies (public)
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/movies` | Danh sách phim: phân trang, lọc genre, sort theo rating/phổ biến/năm, search cơ bản theo title |
| GET | `/api/movies/:id` | Chi tiết phim (kèm genres) |
| GET | `/api/movies/:id/similar` | Proxy → ai-service (similar/related) |
| GET | `/api/search?q=` | Semantic search; ưu tiên gọi ai-service, fallback search cơ bản |

### Movies (admin, role ADMIN/MANAGER)
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/movies` | Tạo phim mới (manual) |
| PATCH | `/api/movies/:id` | Cập nhật phim |
| DELETE | `/api/movies/:id` | Xóa phim |
| POST | `/api/movies/sync-tmdb` | Kéo phim từ TMDB API (theo hot/trending hoặc theo text) vào DB |

> Sau mỗi thao tác tạo/sửa/xóa phim: **publish** `movie.created/updated/deleted`.

### Genres
| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/genres` | Danh sách thể loại (dùng được ở frontend) |
| POST/PATCH/DELETE | `/api/genres` | Admin CRUD |

### Interactions (cần đăng nhập)
| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/interactions` | Ghi tương tác `{ movieId, action, ratingValue? }` |
| GET | `/api/me/history` | Lịch sử xem (action = WATCH) |
| GET | `/api/me/favorites` | Danh sách yêu thích (action = FAVORITE) |
| GET | `/api/me/ratings` | Danh sách đánh giá (action = RATE) |
| GET | `/api/me/recommendations` | Gợi ý = proxy → ai-service `GET /recommendations/:userId` |

> Sau mỗi `POST /interactions`**: publish** `interaction.tracked`.

---

## 5. Các giai đoạn triển khai

### B1 — Movie domain + CRUD + TMDB Sync *(kế hoạch chính)*
- [ ] Tạo module `movies`, `genres` (entity, dto, service, controller).
- [ ] Genres seed cơ bản (lấy từ TMDB).
- [ ] CRUD phim đầy đủ (public list/detail + admin write) + guard RBAC.
- [ ] **TMDB Sync Service**: gọi TMDB API (`/movie/popular`, `/search/movie`, `/movie/:id`) với `language=vi-VN`, upsert vào DB, lưu `tmdb_id`.
- [ ] Validate + test đơn vị (`*.spec.ts`).

### B2 — Tương tác user + event tracking *(sau B1)*
- [ ] Entity `interactions` + module.
- [ ] `POST /api/interactions` (rate/like/watch/favorite), tránh trùng (upsert).
- [ ] API `me/history`, `me/favorites`, `me/ratings`.
- [ ] **Bắt đầu publish event** `interaction.tracked` (tạo RabbitMQ publisher stub, ghi log nếu broker chưa chạy).

### B3 — Kết nối ai-service (HTTP) *(sau B2, chờ AI P3-P4)*
- [ ] Module `AiClient`: gọi HTTP sang ai-service (base URL `http://localhost:8082`) với timeout + retry, dùng axios (đã có).
- [ ] `GET /api/search?q=` → ai-service `/search` (semantic), fallback local search (title ILIKE / full-text).
- [ ] `GET /api/movies/:id/similar` + `GET /api/me/recommendations` → proxy.

### B4 — RabbitMQ publisher hoàn chỉnh *(sau B3)*
- [ ] Cài `amqplib` hoặc `@golevelup/nestjs-rabbitmq`.
- [ ] Publish đủ event: `movie.created`, `movie.updated`, `movie.deleted`, `interaction.tracked`.
- [ ] Circuit breaker: nếu broker off → log + retry/queue nội bộ (đơn giản là drop + log ở MVP).
- [ ] **Test E2E**: thêm phim → event nhận được ở script test (hoặc RabbitMQ Console).

### B5 — Hoàn thiện *(cuối cùng)*
- [ ] Redis cache: cache list/detail movies, search, recommendations (TTL).
- [ ] Chuyển `synchronize: true` → **migrations**.
- [ ] Fix `typeorm` version, thêm pagination/filter chuẩn, audit fields.
- [ ] Bổ sung test e2e cho luồng: auth → xem phim → rate → thêm phim (admin) → gợi ý.

---

## 6. Ghi chú về event contract

Message gửi lên exchange `movie.events` (JSON):

```jsonc
// movie.created / movie.updated
{
  "event": "movie.created",
  "movieId": 123,            // ID backend
  "tmdbId": 603,
  "title": "The Matrix",
  "overview": "…(tiếng Việt)…",
  "genres": ["Hành động", "Khoa học viễn tưởng"],
  "posterPath": "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
  "releaseDate": "1999-03-30"
}

// interaction.tracked
{
  "event": "interaction.tracked",
  "userId": 1,
  "movieId": 123,
  "action": "RATE",          // WATCH | LIKE | RATE | FAVORITE
  "ratingValue": 4.5
}
```

> Contract này phải đồng bộ với ai-service-plan.md (mục RabbitMQ) dưới đây.