# V25 — Cache layer backend (Redis) + đặc tả cache

## 0. Thông tin chung

| Hạng mục | Nội dung |
|---|---|
| Trạng thái | 🟡 Đã triển khai code + test (2026-11-06); còn **1 bug mở** về tương tác phim (mục 11.2) |
| Người thực hiện | AI Agent (main) |
| Thời gian | 2026-11-06 |
| Scope | `backend` |
| Module liên quan | `infrastructure/cache` (mới), `infrastructure/redis`, `modules/movies`, `modules/genres`, `modules/countries`, `modules/interactions`, `modules/recommendations`, `config/env.validation.ts` |
| Không sửa | `docs/BACKEND_RULES.md`, `docs/FRONTEND_RULES.md`, `modules/auth` (session/blacklist giữ nguyên) |
| Ngoài phạm vi | Load-more + cursor + UI frontend (**V26**); cache comments/ratings/peoples/roles; `semantic-search`/`hybrid-search` (đang stub) |

## 1. Bối cảnh

- Backend **chưa có cache** (`grep -i cache backend/src` → 0 match); Redis chỉ dùng cho session/blacklist/rate-limit.
- `GET /api/recommendations/similar/:id` gọi HTTP sang ai-service mỗi request → tốn nhất và dữ liệu lặp lại nhiều.
- `GET /api/movies`, `/movies/search`, `/movies/:id` là các endpoint đọc nhiều nhất nhưng đều query DB mỗi lần.
- `RedisService` có `delByPattern()` dùng `KEYS` → **không dùng** cho cache.

## 2. Mục tiêu

1. Tầng cache có **abstraction** (`ICacheService`) để unit test mock dễ, không phụ thuộc ioredis.
2. Cache endpoint đọc nhiều: movie detail/list/search, genre list, country list, interaction stats.
3. Cache **ranking gợi ý** (window 100), giữ nguyên API hiện tại (chưa đổi cursor).
4. Invalidate **O(1)** bằng version counter — không `KEYS`/`SCAN`.
5. Fail-open: Redis lỗi → API vẫn chạy (đi thẳng DB/AI).
6. Test đủ để không lặp lại lỗi "đổi contract mà test vẫn xanh".

## 3. Quyết định thiết kế

| # | Quyết định | Lý do | Đánh đổi |
|---|---|---|---|
| D1 | Cache ở **backend**, ai-service stateless | backend sở hữu envelope, auth, DB hydrate, hook invalidate; Redis có sẵn | ai-service vẫn tính lại khi bị gọi trực tiếp |
| D2 | `ICacheService` + `RedisCacheService`, token `ICacheService` (camelCase, cùng file impl — theo pattern `IMailService`/repository) | mock test đơn giản, đồng nhất convention symbol của repo | thêm 1 lớp gián tiếp |
| D3 | ioredis trực tiếp, không thêm `cache-manager` | kiểm soát key/version/lock; tránh dependency mới | tự viết single-flight |
| D4 | Invalidate bằng **version counter** | O(1), an toàn multi-instance, không block Redis | key cũ tồn tại tới hết TTL |
| D5 | Key `cache:<domain>:...` dựng 100% qua `CacheKeys` | tránh viết sai key | — |
| D6 | `page/limit` readable, filter hash 12 ký tự | debug được, key bounded, không lặp do thứ tự param | không đọc được filter từ key (log khi set) |
| D7 | **Fail-open** khi Redis lỗi | cache là tối ưu, không phải nguồn sự thật | Redis chết → miss 100% |
| D8 | Recommendation window **100** | khớp giới hạn `topK le=100` của ai-service, không phải sửa AI | chưa có load-more (V26) |

## 4. Đặc tả cache

### 4.1. `ICacheService`

```ts
// src/infrastructure/cache/redis-cache.service.ts
export const ICacheService = Symbol('ICacheService');
// interface
export interface CacheLoadOptions<T> {
  key: string;              // BẮT BUỘC bắt đầu bằng "cache:"
  schema: z.ZodType;        // validate khi ghi & khi đọc
  ttlSeconds: number;
  loader: () => Promise<T>; // chỉ chạy khi miss
}

export interface ICacheService {
  get<T>(key: string, schema: z.ZodType): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  getOrLoad<T>(opts: CacheLoadOptions<T>): Promise<T>;
  incr(key: string): Promise<number>;
  getCounter(key: string): Promise<number>;
}
```

Hành vi bắt buộc của `RedisCacheService`:

| Tình huống | Hành vi |
|---|---|
| Key không bắt đầu `cache:` | `throw` (chặn key rác) |
| Value không phải JSON | `DEL` + coi như miss + warn |
| Zod fail khi đọc | `DEL` + coi như miss + warn |
| Zod fail khi ghi | **không** ghi, log error, vẫn trả dữ liệu vừa load |
| Redis throw/timeout | fail-open: log warn, gọi `loader()` |
| `CACHE_ENABLED=false` | luôn miss, không ghi |
| TTL | `ttl + random(0, ttl*10%)` (jitter) |
| `getOrLoad` đồng thời cùng key | single-flight qua `SET lock NX PX 5000`; không lấy được lock → chờ 120ms đọc lại |
| Release lock | Lua compare-and-del |

### 4.2. Key builder

```ts
const PREFIX = 'cache';

function buildKey(...parts: (string | number | undefined)[]): string;
function hashFilters(filters: Record<string, unknown>): string; // sha1 12 hex, sort key, bỏ rỗng
```

Ví dụ sinh ra:

```
cache:movie:123
cache:movie:list:v3:p1:l20
cache:movie:list:v3:p1:l20:f8f3ae2c1d9a
cache:movie:search:v3:p2:l20:f2b91cc03ae7
cache:genre:list:v1:p1:l100:fda39a3ee5e6
cache:interaction:stats:123
cache:recommendation:similar:123:k100:v7
```

### 4.3. Domain — chốt

| Domain | Endpoint | Key | TTL | Invalidate |
|---|---|---|---|---|
| movie | `GET /api/movies/:id` | `cache:movie:{id}` | 60s | `DEL` sau update/delete |
| movie | `GET /api/movies` | `cache:movie:list:v{v}:p{p}:l{l}[:f{hash}]` | 180s (keyword 60s) | `INCR cache:movie:ver:list` khi create/update/delete |
| movie | `GET /api/movies/search` | `cache:movie:search:v{v}:p{p}:l{l}:f{hash}` | 180s (keyword 60s) | như trên |
| genre | `GET /api/genres` | `cache:genre:list:v{v}:p{p}:l{l}:f{hash}` | 3600s | `INCR cache:genre:ver:list` khi CRUD |
| country | `GET /api/countries` | `cache:country:list:v{v}:p{p}:l{l}:f{hash}` | 3600s | `INCR cache:country:ver:list` khi CRUD |
| interaction | `GET /api/interactions/stats/:movieId` | `cache:interaction:stats:{movieId}` | 60s | Không cần (TTL ngắn; WS cập nhật UI) |
| recommendation | `GET /api/recommendations/similar/:id` | `cache:recommendation:similar:{movieId}:k100:v{ver}` | 900s | `INCR ...:ver:similar:{movieId}`; `INCR ...:ver:global` khi đổi model |

Ghi chú: **movie detail TTL 60s** (không phải 30m) vì `viewCount` tăng mỗi lượt xem; WS đã đẩy số mới cho client. Mutation (`update`, `remove`, `incrementViewCount`) đọc DB trực tiếp, **không** qua cache để tránh lost-update.

**Chỉ cache list ở `page <= 3`** (trang sâu ít dùng, tránh key rác).

### 4.4. Không cache

`genre/country detail`, `peoples`, `comments`, `ratings`, `roles`, `users`, `my-*`, `/auth/*`, `failed-events`, `health` — query rẻ hoặc dữ liệu riêng user/realtime; cache thêm = churn + rủi ro stale.

### 4.5. Schema

- Entity cache: `z.looseObject()` (giữ field lạ), chỉ validate field khoá (`id`, `title`, pagination).
- Recommendation: `z.strictObject()` + kiểm tra `rank` liên tục, không trùng `id`, `score ∈ [0,1]`.

```ts
// value Redis
cache:movie:123      → {"id":123,"title":"...", ...}
cache:movie:list:v3:p1:l20 → {"data":[...],"total":..,"page":1,"limit":20,"totalPages":..}
cache:interaction:stats:123 → {"likeCount":5,"commentCount":2,...}
cache:recommendation:similar:123:k100:v7 → [{"id":9,"score":0.93,"rank":1}, ...]
```

### 4.6. Recommendation window 100 (API không đổi)

```
ver    = getCounter(cache:recommendation:ver:similar:{id})   // mặc định 0
key    = cache:recommendation:similar:{id}:k100:v{ver}
getOrLoad(key, RecommendationSnapshotSchema, 900, () => AI(topK=100))
→ slice 0..topK (client yêu cầu, clamp 1..100)
→ hydrate DB qua movieService.findByIds
→ envelope như hiện tại (movie[] + similarityScore + rank)
```

- id không còn trong DB → skip; mất **> 30%** → `DEL` key + gọi AI lại 1 lần.
- `topK` client > window → clamp window.

### 4.7. Invalidation matrix

| Sự kiện (sau commit) | Hành động |
|---|---|
| `movie.created` | `INCR cache:movie:ver:list` |
| `movie.updated` | `DEL cache:movie:{id}` + `INCR cache:movie:ver:list` + `INCR cache:recommendation:ver:similar:{id}` |
| `movie.deleted` | như trên |
| genre CRUD | `INCR cache:genre:ver:list` |
| country CRUD | `INCR cache:country:ver:list` |
| đổi model/embedding | `INCR cache:recommendation:ver:global` (thủ công/CLI) |
| interaction writes | không invalidate (stats TTL 60s) |

## 5. Cấu hình

```env
CACHE_ENABLED=true            # mặc định true
RECOMMENDATION_WINDOW=100     # mặc định 100
```

TTL để hằng số trong `CacheTtl` (không phình env). Bổ sung 2 biến trên vào `env.validation.ts` (optional).

## 6. Test plan

| Loại | Nội dung |
|---|---|
| Unit `RedisCacheService` | JSON hỏng → miss + DEL; schema sai → miss + DEL; `CACHE_ENABLED=false` → miss; redis throw → fail-open; key sai prefix → throw; TTL jitter; single-flight (10 request → loader 1 lần) |
| Unit `CacheKeys` | đảo thứ tự filter → cùng key; page/limit đọc được; version khác → key khác |
| Unit schema | recommendation: trùng id / rank lệch / score ngoài biên → reject |
| Integration `movies` | hit → repo không gọi; miss → 1 lần; `page > 3` → không cache; update → DEL + INCR |
| Integration `genres/countries` | cache + invalidate khi CRUD |
| Integration `interaction stats` | cache 60s; khi có `manager` (transaction) → bỏ qua cache |
| Integration `recommendations` | hit → `fetch` không gọi; miss → gọi 1 lần `topK=100`; `topK=10` trả 10 item; version bump → miss |

## 7. Phases

- [x] P1 Hạ tầng: `redis-cache.service.ts` (symbol + interface + impl), `cache.keys.ts`, `cache.schemas.ts`, `cache.module.ts`, `testing/fake-cache.service.ts`, env
- [x] P2 Movie: `findOne/findAll/search` + invalidate create/update/remove
- [x] P3 Lookup + stats: genres/countries list + interaction stats
- [x] P4 Recommendation window 100 + version
- [x] P5 Docs + test + smoke

## 8. Rủi ro

| Rủi ro | Chặn |
|---|---|
| Detail cache trả `viewCount` cũ | TTL 60s + WS đẩy số mới; mutation đọc DB trực tiếp |
| Lost-update khi increment view từ cache | `incrementViewCount` dùng `findOneFresh` (bỏ cache) |
| Redis chết | fail-open + log warn |
| `KEYS` block Redis | không expose `delByPattern`; chỉ dùng `DEL`/`INCR` |
| Key gõ sai | throw nếu không prefix `cache:`; mọi key qua `CacheKeys` |
| Cache date thành string sau JSON | mutation không dùng cache; response serializer vẫn ra ISO |
| Memory phình | window 100, TTL ngắn, `allkeys-lru` |

## 9. DoD

- [x] `ICacheService` + impl + fake; service chỉ inject interface
- [x] 7 nhóm key đúng convention, dựng 100% qua `CacheKeys`
- [x] Không `KEYS`/`SCAN`; invalidate bằng version counter
- [x] Cache hoạt động ở movie detail/list/search, genre/country list, interaction stats, recommendation similar
- [x] `GET /api/recommendations/similar/:id` không đổi contract, hit không gọi AI
- [x] Fail-open có test
- [x] `npm test` xanh; docs cập nhật

## 10. Việc tiếp theo (V26)

- Đổi contract gợi ý sang **load-more + cursor** (`result: {items, nextCursor, hasMore}`).
- Cursor = base64 `{o, v}`; `409 CURSOR_EXPIRED` khi version đổi.
- FE: `useInfiniteQuery` + nút "Xem thêm"; bỏ `DataPagination` ở block gợi ý.
- Có thể nâng window lên 200 (cần đổi `le` phía ai-service).

## 11. Báo cáo cuối plan (2026-11-06)

> Ghi nhận hiện trạng, **không sửa code** trong phạm vi plan này.

### 11.1. TTL cache movie detail quá ngắn → dữ liệu trễ

**Quan sát (developer xác nhận):** mở trang chi tiết thấy số liệu trễ; kiểm tra Redis thấy key hết hạn sau ~60s.

| Hạng mục | Giá trị |
|---|---|
| `CacheTtl.movieDetail` | `60` giây (`cache.keys.ts`) |
| `CacheTtl.movieList` | `180` giây |
| `CacheTtl.interactionStats` | `60` giây |
| Invalidate detail khi view / like / rating / comment | **không** (chỉ `update`/`remove` phim) |

**Hệ quả:** người mở trang mới trong vòng 60s nhận `viewCount`/`voteAverage`/`likeCount` cũ. Client đang mở trang đã được WS đẩy số mới, nên chỉ người vào sau bị trễ.

**Phương án (chưa chọn):**

| # | Cách | Đánh đổi |
|---|---|---|
| A | Giữ nguyên 60s | trễ tối đa 60s |
| B | `DEL cache:movie:{id}` sau commit ở `ratings.create` và `interactions.toggle` (không áp dụng cho view) | hit-rate giảm ở phim hot, số liệu đúng ngay |
| C | Tách response chi tiết khỏi entity: không cache counter (`viewCount`, `likeCount`, `voteAverage`) | sạch nhất, phải refactor DTO/response |
| D | Tăng TTL detail (ví dụ 300s) | trễ nhiều hơn, ít request DB hơn |

### 11.2. Bug mở: không thể tương tác với phim trên web

**Trạng thái:** OPEN — chưa xác định nguyên nhân, **chưa sửa**.

**Hiện tượng (developer báo):** sau khi bật cache, thao tác like / rating / comment trên trang chi tiết không thực hiện được nữa.

**Phạm vi nghi vấn và cách kiểm tra:**

| # | Nghi vấn | Cách xác nhận |
|---|---|---|
| 1 | DI: `MovieInteractionStatsService` nay phụ thuộc `ICacheService`; nếu `CacheModule` không resolve được thì app lỗi lúc bootstrap (không riêng interaction) | xem log khởi động Nest, có `Nest can't resolve dependencies` không |
| 2 | `GET /api/interactions/stats/:movieId` trả cache cũ 60s → payload WS (`likeCount`/`commentCount`) sai → UI không đổi dù DB đã ghi | so `redis-cli GET cache:interaction:stats:{id}` với DB ngay sau khi bấm |
| 3 | Mutation vẫn đi REST, UI chỉ cập nhật qua WS broadcast → nếu socket không kết nối thì không thấy thay đổi | tab Network → WS frames; kiểm tra event `movie-{id}-interaction`, `-rating`, `-comment` |
| 4 | Lỗi xác thực/validation ở mutation | HTTP status của `POST /api/interactions`, `POST /api/ratings`, `POST /api/comments` (401/400/500) |
| 5 | Redis lỗi làm treo request (ioredis offline queue) | log `[RedisCacheService] ... lỗi`; thử `redis-cli ping` |

**Dữ liệu cần thu thập trước khi sửa:**
1. Response body + status của 3 API mutation khi bấm trên web.
2. Log backend tại thời điểm bấm (đặc biệt `RedisCacheService`, `CommentsService`, `RatingsService`, `InteractionsService`).
3. WS frames ở tab Network (có nhận `movie-{id}-*` không).
4. `redis-cli MONITOR` và `redis-cli --scan --pattern 'cache:*'` trước/sau khi bấm.
