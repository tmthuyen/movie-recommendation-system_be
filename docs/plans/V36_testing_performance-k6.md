# V36 — Performance & Load Testing bằng k6

- **Trạng thái:** 🟡 Task 1 (Public API) — code xong, `k6 inspect` pass; smoke functional pass (64 request, 0 lỗi, checks 100%) nhưng **SLO threshold fail** (search p95 ~1065ms > 800ms). Các lần chạy sau bị 429 do rate limit môi trường. Task 2 (Private API) chưa triển khai.
- **Người thực hiện:** AI agent
- **Thời gian:** 2026-11-18
- **Scope:** `testing`
- **Module liên quan:** `performance/`, `docs/`; **không sửa backend**
- **File chính:** `performance/public-api.test.js`
- **File Task 2 (sau):** `performance/private-api.test.js`

## Mục tiêu

Xây bộ performance/load test bằng Grafana k6 cho hệ thống gợi ý phim, chia **2 task**:

| Task | Trạng thái | File | Auth | Nội dung |
|---|---|---|---|---|
| **Task 1 — Public API** | **Đang làm** | `performance/public-api.test.js` | Không | Search, detail, similar cursor, semantic cursor |
| Task 2 — Private API | Sau | `performance/private-api.test.js` | JWT | Auth, interaction, rating, comment, my-history/favorites, for-you cursor |

Mỗi task dùng **một file k6 tự chứa**, không multi-file framework. Task 1 chạy đủ 11 chiến lược trong một lần.

## Hiện trạng & phát hiện

- k6 có trên máy: `C:\Program Files\k6\k6.exe` (v2.4.0), chưa nằm trong PATH.
- Backend local: `http://localhost:8081`; AI service: `http://localhost:8082`.
- **`GET /api/movies` đang bị `JwtAuthGuard` + `@Roles`** dù docs/Swagger ghi Public → trả `401`.
  - Task 1 dùng `GET /api/movies/search` cho list/browse public.
- Global rate limit 100 request/phút/IP; người dùng tự xử lý khi chạy load/stress/spike. Test code **không sửa backend**.
- Recommendation public có cursor; Task 1 dùng cursor + `limit`, **không dùng `topK`**.
- Cursor contract:
  - Trang đầu bỏ trống `cursor`.
  - Trang kế dùng `pagination.nextCursor`; client không parse cursor.
  - `limit` mặc định 12, tối đa 50.

## Phạm vi Task 1 — Public API

File: `performance/public-api.test.js`

### Endpoint load test

| Method | Path | Query | Nhóm |
|---|---|---|---|
| GET | `/api/movies/search` | `page`, `limit`, `keyword?`, `sort?`, `genreIds?`, `countryIds?`, `releaseYearFrom?`, `releaseYearTo?` | Search |
| GET | `/api/movies/:id` | — | Detail |
| GET | `/api/recommendations/similar/:id/cursor` | `cursor?`, `limit=12` | Similar cursor |
| GET | `/api/recommendations/semantic-search/cursor` | `keyword`, `cursor?`, `limit=12` | Semantic cursor |

### Chỉ gọi trong `setup()`

- `GET /api/health` — health check 1 lần.
- `GET /api/genres?page=1&limit=50` — lấy `genreIds`.
- `GET /api/countries?page=1&limit=50` — lấy `countryIds`.
- `GET /api/movies/search?page=1&limit=20&sort=viewCount:DESC` — lấy movieIds + keyword.

### Không dùng trong Task 1

- `GET /api/movies` (401).
- `/api/recommendations/similar/:id` và `/api/recommendations/semantic-search` bản non-cursor.
- Mọi query `topK`.
- Metadata/interactions khác trong load mix.

## Workload mix

| Nhóm | Tỷ lệ iteration | Endpoint |
|---|---:|---|
| Search | 50% | `/api/movies/search` |
| Detail | 30% | `/api/movies/:id` |
| Similar cursor | 10% | `/api/recommendations/similar/:id/cursor` |
| Semantic cursor | 10% | `/api/recommendations/semantic-search/cursor` |

- Smoke chạy deterministic cả 4 endpoint: 5 VUs × 2 iterations.
- Recommendation gọi trang đầu; nếu `pagination.hasMore` và có `nextCursor`, gọi thêm trang kế (tối đa 1 lần). Tag `cursor_page=first|next`.
- Concurrency dùng hot movieId + hot keyword.
- Volume dùng `limit=50`, page sâu, keyword dài, filter genre/country.

## 11 chiến lược trong một file

Tất cả scenario nằm trong `performance/public-api.test.js`, chạy tuần tự bằng `startTime`; `default` dispatch theo `exec.scenario.name`. `CONFIG.runOnly = null` chạy tất cả.

| # | Scenario | Executor | Load profile | Duration | startTime |
|---|---|---|---:|---:|---:|
| 1 | Smoke | `per-vu-iterations` | 5 VUs × 2 iterations | 30s max | 0s |
| 2 | Load | `ramping-arrival-rate` | 100 → 500 → 1K → 2K → 5K RPS, 10s/stage | 50s | 35s |
| 3 | Stress | `ramping-arrival-rate` | 1K → 2K → 5K → 10K RPS, 10s/stage | 40s | 90s |
| 4 | Spike | `ramping-arrival-rate` | 100 → 1K → 5K → 10K → 100 RPS, 5s/stage | 25s | 135s |
| 5 | Breakpoint | `ramping-arrival-rate` | 100 → 500 → 1K → 2K → 5K → 10K RPS, 10s/stage | 60s | 165s |
| 6 | Soak | `constant-arrival-rate` | 200 RPS | 2m | 230s |
| 7 | Capacity | `constant-arrival-rate` | 1K RPS | 1m | 355s |
| 8 | Scalability | `ramping-arrival-rate` | 500 → 1K → 2K → 5K RPS, 10s/stage | 40s | 420s |
| 9 | Concurrency | `constant-vus` | 200 VUs, hot movie/keyword | 30s | 465s |
| 10 | Volume | `constant-vus` | 20 VUs, heavy query | 1m | 500s |
| 11 | Recovery | `ramping-arrival-rate` | 200 RPS 1m → 2K RPS 20s → 200 RPS 1m | 2m20s | 565s |

- Tổng duration ~**11m45s** (đã tính gap 5s và `gracefulStop: '5s'`).
- `preAllocatedVUs: 500`, `maxVUs: 20000`.
- Stress/Breakpoint không abort cả suite; threshold fail chỉ báo SLO break.
- Đây là quick profile; muốn soak/load chuẩn hơn thì tăng duration trong `CONFIG`.

## Cấu hình & cách chạy

```js
const CONFIG = {
  baseUrl: 'http://localhost:8081',
  runOnly: null, // null = all; hoặc 'smoke' | 'load' | ...
  workload: { search: 50, detail: 30, similarCursor: 10, semanticCursor: 10 },
  cursorLimit: 12,
  cursorNextProbability: 0.5,
  resultDir: 'performance/results',
};
```

```powershell
# Chạy đủ 11 chiến lược
& "C:\Program Files\k6\k6.exe" run performance/public-api.test.js

# Chỉ smoke (không cần sửa file)
& "C:\Program Files\k6\k6.exe" run --scenario smoke performance/public-api.test.js
```

- Không bắt buộc env, không cần runner riêng.
- Kết quả tự động: summary text + JSON + HTML trong `performance/results/`.
- Không còn `performance/run-all.ps1`.

## Metrics, checks, thresholds

### Metrics

- Overall: `http_req_duration`, `http_req_failed`, `checks`, `iterations`, `dropped_iterations`.
- Theo endpoint: `search_duration`, `detail_duration`, `similar_cursor_duration`, `semantic_cursor_duration`.
- Counter: `http_4xx`, `http_5xx`, `business_errors`, `rate_limited_429`.
- Theo scenario: `scenario_<name>_duration`, `scenario_<name>_requests`, `scenario_<name>_errors`.
- Tag: `api`, `scenario`, `stage`, `cursor_page`.

### Thresholds

| Nhóm | Threshold |
|---|---|
| Search | p95 < 800ms, p99 < 1500ms, error rate < 1% |
| Detail | p95 < 400ms, p99 < 800ms, error rate < 1% |
| Similar cursor | p95 < 1500ms, p99 < 3000ms, error rate < 5% |
| Semantic cursor | p95 < 2000ms, p99 < 4000ms, error rate < 5% |
| Overall | p95 < 1000ms, p99 < 2000ms, error rate < 5% |
| Checks | rate > 95% |

- Recommendation thresholds relaxed vì phụ thuộc AI service.
- Stress/Breakpoint không đặt `abortOnFail`.

### Rate limit

- Public API giới hạn 100 request/phút/IP.
- Không sửa backend, không thêm bypass.
- Người dùng tự xử lý rate limit; nếu `rate_limited_429` cao, kết quả phản ánh rate limit chứ không phải capacity thật.

## Checklist Task 1

- [x] Lập plan.
- [x] Tạo `performance/public-api.test.js` one-file.
- [x] `CONFIG` ở đầu file; `runOnly = null`.
- [x] `setup()`: health, genres, countries, search data.
- [x] 11 scenario + `startTime` + `gracefulStop: '5s'`.
- [x] Workload 50/30/10/10; smoke đủ 4 endpoint.
- [x] Similar/semantic dùng cursor + limit, không `topK`.
- [x] Cursor load-more dùng `pagination.nextCursor`; tag first/next.
- [x] Metrics/thresholds/summary text + JSON + HTML.
- [x] Xoá `performance/run-all.ps1`.
- [x] `k6 inspect` pass.
- [x] Smoke functional pass với backend local: 64 request, 10 iterations, 0 lỗi, checks 100%.
- [ ] Smoke SLO pass: search p95 ~1065ms đang vượt threshold 800ms; cần tối ưu backend/index hoặc điều chỉnh SLO.
- [ ] Chạy lại smoke sạch sau khi rate limit reset; các lần chạy liên tiếp bị 429.

### Kết quả smoke gần nhất (functional)

| Metric | Giá trị |
|---|---:|
| HTTP requests | 64 |
| Iterations | 10 |
| Failed rate | 0% |
| Checks | 100% |
| p95 overall | ~1029ms |
| p99 overall | ~1143ms |
| Search p95 | ~1065ms |
| Detail p95 | ~146ms |
| Similar cursor p95 | ~1130ms |
| Semantic cursor p95 | ~305ms |

- Threshold fail chính: `http_req_duration{api:search}` p95 > 800ms và overall p95 > 1000ms.
- 429 ở các lần sau là rate limit môi trường, không phải lỗi code k6.
- Không sửa backend để bypass rate limit.

## Task 2 — Private API (outline, làm sau)

- File: `performance/private-api.test.js`, một file, cùng 11 chiến lược.
- Auth/JWT: login, refresh, me, logout; account pool; rate limit auth do người dùng xử lý.
- Private endpoints:
  - `POST /api/movies/:id/view`
  - `POST /api/interactions` (toggle like)
  - `POST /api/ratings`
  - `POST /api/comments`
  - `GET /api/interactions/my-history`
  - `GET /api/interactions/my-favorites`
  - `GET /api/interactions/movie/:movieId/me`
  - `GET /api/recommendations/for-you/cursor?limit=12&cursor=...`
- Không dùng `topK`; for-you chỉ dùng cursor.
- Cùng cơ chế report/thresholds; tách riêng để không trộn public/private.

## Ghi chú

- Không commit/push nếu chưa được yêu cầu.
- Không commit account/password thật; chỉ dùng file `.example` khi làm Task 2.
- 20.000+ VUs cần k6 distributed (Kubernetes/k6 Operator) nếu chạy thật.
