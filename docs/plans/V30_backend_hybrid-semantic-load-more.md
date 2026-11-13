# V30 — Backend: load-more cho semantic-search & for-you (Redis sorted set, cursor = rank)

## Trạng thái

✅ Hoàn thành — 2026-11-13

## Người thực hiện & thời gian

- Người thực hiện: AI agent (Big Pickle)
- Bắt đầu: 2026-11-13
- Hoàn thành: 2026-11-13

## Phạm vi

- Scope: `backend` + `ai` (chỉ thêm field canonical ở ai-service).
- Mục tiêu: `semantic-search` và `for-you` trả kết quả thật, có load-more bằng cursor.
- Cursor là **số rank** (không encode/decode, không version, không fingerprint).
- Cache bằng **Redis sorted set**: `score = rank`, `member = JSON.stringify({id, rank, score})`, TTL 15 phút.
- Key đặt trực tiếp trong service, **không dùng `CacheKeys`**.
- Không sửa luồng `similar` hiện có, không xoá code cũ.

## Module liên quan

| File | Việc |
|---|---|
| `backend/src/infrastructure/redis/redis.service.ts` | thêm `zadd`, `zrangeByScore`, `zcard` |
| `backend/src/modules/recommendations/recommendations.service.ts` | `readWindow` + 4 method public + loader AI |
| `backend/src/modules/recommendations/recommendations.controller.ts` | 4 route (2 cũ gọi thật + 2 cursor) |
| `backend/src/modules/recommendations/interfaces/ai-service-response.interfaces.ts` | thêm `score`, `id`, `rank` |
| `backend/src/modules/recommendations/dtos/movie-response-with-score.dto.ts` | thêm `score` |
| `ai-service/src/services/recommend_service.py` | thêm `score` + canonical hybrid |
| `ai-service/src/api/schemas.py` | thêm `score` |
| `docs/BACKEND.md` | cập nhật bảng endpoint |

## Hợp đồng API

| Method | Path | Auth | Query | Pagination |
|---|---|---|---|---|
| GET | `/api/recommendations/semantic-search` | public | `keyword` (hoặc `query`), `topK?` | `{page, limit, total, totalPages}` |
| GET | `/api/recommendations/semantic-search/cursor` | public | `keyword` (hoặc `query`), `cursor?`, `limit?` | `{limit, total, hasMore, nextCursor}` |
| GET | `/api/recommendations/for-you` | JWT | `topK?` | `{page, limit, total, totalPages}` |
| GET | `/api/recommendations/for-you/cursor` | JWT | `cursor?`, `limit?` | `{limit, total, hasMore, nextCursor}` |

- `cursor` = rank cuối cùng đã trả (số nguyên). Trang đầu bỏ trống.
- `nextCursor = null` khi hết.
- Envelope chuẩn: `{success, statusCode, message, result, pagination}`.

## Phases

### Phase 1 — Redis sorted set

- [x] `RedisService.zadd(key, entries, ttlSeconds)` (multi: ZADD + EXPIRE)
- [x] `RedisService.zrangeByScore(key, min, max, limit)`
- [x] `RedisService.zcard(key)`

### Phase 2 — AI canonical fields

- [x] `_format_item` thêm `score` (= `similarityScore`)
- [x] `hybrid_recommendation` thêm `id`, `rank`, `score` (giữ `movie_id`, `fused_rank`, `rrf_score`)
- [x] `SimilarMoviesResponse` thêm `score`

### Phase 3 — Backend contract

- [x] Zod: similar thêm `score`; hybrid thêm `id`/`rank`/`score` (optional)
- [x] DTO `SimilarMovieResponseDto` / `HybridMovieResponseDto` thêm `score`
- [x] `hydrate<T>(items, dtoClass)` trả mảng, expose `score` + `rank`

### Phase 4 — Service

- [x] `readWindow(key, loader, afterRank, limit)` → `{items, total}`
- [x] `loadSemanticFromAi(keyword)`, `loadForYouFromAi(accessToken)`
- [x] `semanticSearch`, `semanticSearchByCursor`
- [x] `hybridSearch`, `hybridSearchByCursor`
- [x] Bỏ bug `semanticSearch` gọi nhầm `hybridSearch`

### Phase 5 — Controller

- [x] `/semantic-search` + `/semantic-search/cursor`
- [x] `/for-you` + `/for-you/cursor`
- [x] Envelope chuẩn cho cả 4 route

### Phase 6 — Test & docs

- [x] Test `RedisService` (zadd/zrangeByScore/zcard)
- [x] Test service semantic/hybrid + cursor
- [x] Test controller 4 route
- [x] Test AI `_format_item` có `score`
- [x] Cập nhật `docs/BACKEND.md`, `docs/AI-SERVICE.md`

## Kết quả kiểm thử

- Backend: `npx jest` → **381 passed / 46 suites**; `tsc --noEmit` sạch; eslint 0 error (chỉ còn warning cũ về `mock.calls[0][0]` trong spec).
- AI-service (phạm vi liên quan): `test_recommend_service.py`, `test_recommendations.py`, `test_auth.py`, `test_fusion.py` → **100 passed**.
- AI-service toàn bộ: **607 passed / 7 failed** — 7 failure còn lại nằm ở `tests/unit/api/test_middleware.py` (assert envelope 401 cũ của middleware, thuộc công việc đang làm dở trước V30, không liên quan load-more).

## Ghi chú

- Redis sorted set dùng `score = rank` để `ZRANGEBYSCORE key (cursor +inf LIMIT 0 limit` trả đúng trang kế.
- Nếu list đổi giữa lúc scroll: chấp nhận trùng/mất item (không dùng version/fingerprint).
- `for-you` không gửi `userId` sang AI; ai-service lấy user từ JWT.
- DTO `SimilarMovieResponseDto`/`HybridMovieResponseDto` hiện chỉ expose `score` + `rank` (không còn `similarityScore`/`hybridScore`); frontend khai báo 2 field đó là optional và không dùng trong component nên không vỡ contract.
- Trong lúc làm V30, working tree có refactor song song `ICacheService` (symbol) → `CACHE_SERVICE` (string token) và đổi folder `common/utlils` → `common/utils`. Đã cập nhật 3 consumer còn sót (`countries`, `genres`, `movie-interaction-stats`) để `tsc` sạch; không thay đổi logic.
