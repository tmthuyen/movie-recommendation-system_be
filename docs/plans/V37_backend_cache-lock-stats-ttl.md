# V37 — Ổn định cache, RedisLockService và stats Redis-first

- **Trạng thái:** ✅ Hoàn tất — đã chạy `type-check`, `lint`, `test`, `build` (không commit).
- **Người thực hiện:** AI agent
- **Thời gian:** 2026-11-20
- **Scope:** `backend`
- **Module liên quan:** `infrastructure/cache`, `infrastructure/redis`, `modules/movies`, `modules/recommendations`, `modules/interactions`, `modules/comments`, `modules/ratings`, `config`, `docs`
- **Plan độc lập:** Có. Không phụ thuộc V38.

## Ràng buộc đã chốt

1. Tổ hợp request random **vô hạn** → không cache raw query; chỉ cache key có cardinality hữu hạn.
2. Mọi lock đi qua `RedisLockService`; **không viết lại** acquire/renew/release/watchdog trong `RedisCacheService`.
3. **Cấm sửa logic rerank API** (`searchLexicalSemanticRerank*`); `hydrate()` cũ giữ nguyên cho rerank.
4. Stats là **Redis-first**: click/like/comment/rating chỉ `HINCRBY`/`ZINCRBY`; **không query DB stats trong request path**, **không update `movies.view_count/like_count/vote_*` trong transaction tương tác**.
5. Không dùng env mới cho lock TTL/jitter — khai báo **constant ở đầu file** `redis-cache.service.ts`.
6. **Bỏ hoàn toàn trending**: không endpoint `trending`, không `trending:*` ZSET, không weighted decay. Thay bằng **hot/popular/top**.
7. Cron đồng bộ Redis → DB lúc **03:00 mỗi ngày**, có `RedisLockService`.
8. V38 ghi nhận riêng, **chưa duyệt / chưa triển khai**. Không commit/push.

## Phạm vi

### Làm
- `RedisLockService`: giữ `runWithLock` cho cron cũ; thêm `runWithLockOrFallback` (retry ngắn + watchdog + release) cho cache/semantic/stats.
- `RedisCacheService`: inject lock service, bỏ primitive lock tự viết; re-check sau acquire; stale fallback; negative cache; schema rejection metric; TTL jitter 20%.
- TTL cache dài hạn; keyword normalization cho cache key; `findByIdsCached()`/`hydrateWithCacheFirst()` chỉ cho semantic & forYou.
- Stats: Redis hash per movie + ZSET bucket theo ngày/tuần/tháng/all; score hot/popular = **tổng thuần** view+like+comment+rating (không weight).
- API xếp hạng: `GET /api/interactions/stats/popular`, `stats/hot`, `stats/top`, giữ `stats/:movieId`.
- Cron `MovieStatsSyncCron` 03:00: Redis → DB theo danh sách dirty, ghi giá trị tuyệt đối (idempotent); **không rebuild ZSET từ DB**.
- Bootstrap DB → Redis là thao tác **thủ công 1 lần** khi cần (`bootstrapFromDatabase()`), không chạy tự động.
- Metric Prometheus cho cache.

### Không làm
- Sửa rerank; search history / user vector (→ V38); migration schema DB.
- Thêm env vars `CACHE_LOCK_WAIT_MS`, `CACHE_TTL_JITTER`.
- Endpoint/ZSET `trending:*`; tích hợp k6 ai-service vào backend.

## Phase & Task

### Phase 0 — Guardrail `[x]`
- [x] Đọc rules (`BACKEND_RULES.md`, `CODE_RULES.md`), `PLAN_INDEX.md`, code hiện trạng.
- [x] Chốt ràng buộc random vô hạn, cấm rerank, constants thay env, bỏ trending.
- [x] Tạo V37/V38 + cập nhật `PLAN_INDEX.md` (`next_index = 39`).

### Phase 1 — Lock & cache `[x]`
- [x] `RedisLockService`: giữ `runWithLock`, thêm `LockRunOptions` + `runWithLockOrFallback`; dùng chung `executeWithLockValue`.
- [x] `RedisCacheService`: inject `REDIS_LOCK_SERVICE`, xoá lock tự viết; re-check sau acquire; stale fallback; negative cache; schema reject metric.
- [x] Constants `CACHE_LOCK_TTL_SECONDS`, `CACHE_LOCK_WAIT_MS`, `CACHE_LOCK_RETRY_MS`, `CACHE_TTL_JITTER` đặt đầu file; xoá env khỏi `env.validation.ts`.
- [x] TTL dài hạn; normalize keyword; metric cache.
- [x] Test cache.

### Phase 2 — Semantic / forYou `[x]`
- [x] `readWindow()` dùng lock service.
- [x] `findByIdsCached()` + `hydrateWithCacheFirst()` cho semantic/forYou; rerank giữ `hydrate()`.
- [x] Cursor contract không đổi.

### Phase 3 — Stats Redis-first `[x]`
- [x] `MovieInteractionStatsService`: hash Redis + ZSET bucket `all/day/week/month`; `ratingTotal/ratingAvg`; không inject DB/cache service.
- [x] `recordView/recordLike/recordComment/recordRating`: HINCRBY/ZINCRBY + dirty set; trả snapshot Redis cho socket.
- [x] `MoviesService`, `InteractionsService`, `CommentsService`, `RatingsService`: bỏ ghi stats trong transaction; broadcast snapshot Redis.
- [x] `MovieStatsRepository`: ghi DB idempotent + query bootstrap; `MovieStatsSyncCron` chạy 03:00 dưới lock.
- [x] Routes `stats/popular`, `stats/hot`, `stats/top` đặt trước `stats/:movieId`; cập nhật `docs/BACKEND.md`.
- [x] Test unit cho stats service & cron + controller ranking.

### Phase 4 — Gate `[x]`
- [x] `npm run type-check`, `npm run lint` (0 error), `npm test` (52 suites/442 tests), `npm run build`.
- [x] Cập nhật trạng thái plan; không commit/push.

## Definition of Done

- Không còn hàm lock nào trong `RedisCacheService`; không env cache-lock/jitter mới.
- Rerank logic không đổi; warm cache semantic/forYou không query DB movie detail.
- Stats request path không query DB; DB chỉ được ghi bởi cron 03:00; ranking là hot/popular/top, không trending.
- Gate backend xanh; không commit/push.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Stats write-behind trễ tối đa 1 ngày | Snapshot Redis là nguồn thật; cron 03:00 ghi DB; document consistency window |
| Bucket ZSET cũ tồn tại | TTL theo period tự expire; không job rebuild |
| Lock service đổi ảnh hưởng cron cũ | Giữ `runWithLock`, chỉ thêm method mới |
| Metric label cardinality | Chỉ label `cache_type`, không label raw key |
| Bootstrap ghi đè stats live | Chỉ gọi thủ công, không chạy trong cron/request |
