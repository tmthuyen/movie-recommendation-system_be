# V45 — Backend: failed events, lịch sử tương tác, dashboard aggregate và sửa movie genre/country

> **Trạng thái:** 🟢 Đã triển khai (2026-11-27) — P1–P8 xong, chờ QA tay trên stack thật
> **Người thực hiện:** AI agent (Big Pickle)
> **Thời gian lập plan:** 2026-11-27
> **Scope:** `backend` (liên quan `frontend` — xem V46)
> **Phạm vi file:** `backend/src/modules/failed-events/**`, `backend/src/modules/interactions/**`, `backend/src/modules/ratings/**`, `backend/src/modules/comments/**`, `backend/src/modules/movies/**`, `backend/src/infrastructure/messaging/**`, module `dashboard` mới, `docs/BACKEND.md`

---

## 1. Lỗi được giữ nguyên để đối chiếu

Không sửa/sửa nghĩa các câu lỗi sau:

1. `failed event chưa có giao dieennj admin xem và quan lý`
2. `user chưa xem được lịch sử tương tác: rating, comment, chỉ có like và tương tác mấy`
3. `admin hiện tại dashboard chưa có thống kê rõ ràng, chưa có thống kê theo kỳ, theo range, chỉ là hard code`
4. `các trang adminn chưa có nút refresh data`
5. `Còn các phim chưa được thay đổi thể loại và country được, chỉ có thể thêm mới không có thêm, khi sửa movie batws buộc check genreids và countryIds có khớp với data hay không nếu không phải cập nhật lại`

---

## 2. Hiện trạng & lỗi code

| Task | Hiện trạng | Lỗi code hiện tại |
|---|---|---|
| Failed events | Có `GET /api/failed-events`, `POST /:id/retry`; DLQ recommendation/interaction ghi `failed_events` | `@Roles` không được enforce vì thiếu guard; `retry()` không `await` publish; map exchange thiếu `interaction.`/`auth.`; chưa có DLQ movie/user/auth |
| Lịch sử user | `/my-history` chỉ `click`, `/my-favorites` chỉ `like` | Không có endpoint unified/my-ratings/my-comments; không check ownership ở `PATCH ratings`, `PATCH comments`, `DELETE interactions`; comment không có content trong interaction |
| Dashboard | FE tổng hợp từ 100 bản ghi mới nhất | Backend chưa có endpoint aggregate; không có `period`/`from`/`to` thật |
| Refresh admin | Mỗi dashboard có nút Làm mới | Các trang admin chỉ có `onRetry` trong ErrorState — V46 xử lý |
| Movie genre/country | Form có multiselect; DTO có mảng ID | `findById()` thiếu join countries; `validateRelations()` dùng `countryId` thay vì `countryIds`; FE gửi `undefined` cho mảng rỗng; `peopleIds` bị reset; so sánh `hasChanges` sai field |

---

## 3. Phases

### P1 — Failed events: bảo mật + retry đúng

- [x] Thêm `JwtAuthGuard` + RolesGuard cho `FailedEventsController`; chỉ ADMIN/SUPERADMIN.
- [x] `await this.eventPublisher.publish(...)` trước khi mark `RETRIED_SUCCESS`.
- [x] Map exchange theo prefix: `movie.` → MOVIE, `user.` → USER, `interaction.` → INTERACTION, `auth.` → AUTH.
- [x] Giữ response retry không có `result` theo docs; cập nhật docs nếu cần.
- [x] Test: guard từ chối user thường; publish reject → `RETRIED_FAILED`.

### P2 — DLQ coverage

- [x] Đảm bảo mọi DLQ hiện có ghi `FailedEvent` ( recommendation/interaction đã có; bổ sung movie/user/auth nếu topology có DLQ ).
- [x] Không xoá `gateway/kong.yml`; không đụng `.env`.

### P3 — Lịch sử tương tác đầy đủ

- [x] Thêm `GET /api/interactions/my-activities?types=click,like,rating,comment` (JWT), scope `req.user.sub`, join movie, `score` cho rating, join `comments.content` cho comment, phân trang `{result,pagination}`.
- [x] Giữ nguyên `/my-history`, `/my-favorites`.
- [x] Check ownership: `PATCH /ratings/:id`, `PATCH /comments/:id`, `DELETE /interactions/:id` → 403 nếu không phải chủ.
- [x] Test service/controller cho 4 type + ownership.

### P4 — Dashboard aggregate

- [x] Thêm module `dashboard`, endpoint `GET /api/admin/dashboard/stats?period=day|week|month|quarter|year|custom&from=&to=` với guard ADMIN.
- [x] Aggregate SQL toàn DB: totals, time-series, top movies/users, genre/country distribution, rating distribution, data quality.
- [x] Validate range, timezone rõ ràng, rỗng trả số 0.
- [x] Cập nhật `docs/BACKEND.md` endpoint mới.

### P5 — Movie genre/country

- [x] `findById()` join `movie.countries`.
- [x] `validateRelations()` dùng `countryIds`; dedupe ID; `[]` hợp lệ để clear; ID không tồn tại → 400 tiếng Việt kèm ID lỗi.
- [x] `mapDtoToEntity()` dùng `Array.isArray`; `undefined` = giữ nguyên, `[]` = xoá.
- [x] `aiFields`: thêm `countryIds`, so sánh mảng ID đã sort; bỏ biến thừa.
- [x] Chạy backend `lint`, `type-check`, full Jest.

### P6 — Quan hệ phim: `genreIds` / `countryIds` / `peopleIds` (bổ sung theo yêu cầu)

> Lỗi phát sinh sau P5: `repo.merge(existing, movie)` gộp mảng relation theo index/object, **không thay thế** join table. P6 sửa triệt để cả 3 quan hệ, dùng transaction.

- [x] P6.1 — Không dùng `repo.merge()` cho mảng quan hệ nữa; tách scalar và relation.
- [x] P6.2 — Helper `applyRelations(manager, movieId, relations)`:
  - `genreIds` → ManyToMany `movie_genres`: `loadMany()` lấy ID hiện tại rồi `addAndRemove(toAdd, toRemove)` — **không dùng `.set()`** (TypeORM chỉ cho phép set với many-to-one/one-to-one; dùng set làm PATCH trả 500);
  - `countryIds` → ManyToMany `movie_countries`: cùng cơ chế `loadMany()` + `addAndRemove()`;
  - `peopleIds` → **không dùng `.set()`**: `movie_peoples` là entity trung gian có PK kép `(movie_id, people_id)` + cột `role`; xoá theo `movieId` rồi insert lại `{movieId, peopleId, role}`, giữ `role` cũ nếu `peopleId` đã tồn tại, mặc định `'actor'` cho ID mới.
- [x] P6.3 — Ngữ nghĩa: `undefined` = giữ nguyên; `[]` = xoá sạch; `[...]` = thay thế hoàn toàn (dedupe + sort khi so sánh).
- [x] P6.4 — Validate ID tồn tại trong `Genre`, `Country`, `People`; dedupe; ID lỗi → `BadRequestException` tiếng Việt kèm ID cụ thể.
- [x] P6.5 — Scalar update + 3 nhánh quan hệ trong **một `dataSource.transaction()`**; rollback nếu relation lỗi.
- [x] P6.6 — Dùng helper cho **cả `create()` và `update()`**; `create()` hiện map `moviePeoples` rồi trông cascade → chuẩn hoá lại.
- [x] P6.7 — Sau commit reload `findById()` join `genres`, `countries`, `moviePeoples → people`; so sánh ID trước/sau; publish `movie.updated` nếu đổi; invalidate detail/list/similar cache.
- [x] P6.8 — Cập nhật `docs/BACKEND.md`: `countryId?: number` → `countryIds?: number[]`, ghi rõ 3 quy ước mảng.

Test P6:
- [x] đổi `genreIds [1]→[2]`, `countryIds [1]→[2,3]` thì DB chỉ còn ID mới;
- [x] `peopleIds [1]→[2]` thì chỉ còn row `(movie,2)`;
- [x] gửi `[]` xoá sạch từng quan hệ; không gửi thì giữ nguyên;
- [x] ID không tồn tại → `400` có ID đó;
- [x] relation lỗi → scalar không được ghi (rollback).

### P7 — Admin quản lý đủ thông tin user + status (bổ sung theo yêu cầu)

- [x] P7.1 — Thêm `AdminUpdateUserDto`: `email?`, `fullName?`, `phoneNumber?`, `birthDate?`, `gender?`, `avatarUrl?`, `status?`, `isVerified?`, `preferenceData?`. Dùng `IsEnum(UserStatus)`, `IsBoolean`, `IsEmail`, `IsOptional`.
- [x] P7.2 — Đổi `PUT /api/users/:id` sang DTO mới; giữ `PUT /api/users/me` dùng `UpdateProfileDto` để user không tự sửa status.
- [x] P7.3 — Thêm `JwtAuthGuard, RolesGuard` cho `UsersController` — `@Roles` hiện chưa được enforce.
- [x] P7.4 — Validate email unique (trừ chính user), enum status; không cho admin tự `BLOCKED/INACTIVE` chính mình; publish `user.updated`.
- [x] P7.5 — Status chuyển `BLOCKED/INACTIVE` → gọi `SessionService.removeAllSessions(userId)` để blacklist jti. Dùng `forwardRef` nếu circular.
- [x] P7.6 — Cập nhật `docs/BACKEND.md` endpoint + guard + DTO mới.

Test P7:
- [x] user thường gọi `PUT /users/:id` → `403`;
- [x] admin đổi `ACTIVE→BLOCKED` → DB đổi, `removeAllSessions` được gọi, publish `user.updated`;
- [x] đổi `isVerified` → vẫn lưu/publish;
- [x] email trùng → `409`; tự block → `400`.

### P8 — Movie stats: cache miss load DB dưới Redis lock (bổ sung theo yêu cầu)

> Lỗi hiện tại: `getStats()` cache miss chỉ `HSET ZERO_STATS`, không load DB. View/like/comment/rating bắt đầu từ 0 và cron có thể ghi 0 đè stats thật xuống DB.

- [x] P8.1 — `getStats(movieId)`: Redis hash hit → trả ngay; miss → lock `lock:stats:load:<movieId>` (TTL ngắn, wait ngắn), double-check cache sau khi có lock.
- [x] P8.2 — Trong lock: load 1 phim từ DB qua `MOVIE_STATS_REPOSITORY.findOneForBootstrap()` (comment/like/rating lấy từ bảng nguồn, view lấy `movies.view_count`), ghi Redis hash + seed ranking, **trả stats vừa load**.
- [x] P8.3 — Không seed `ZERO_STATS` khi cache miss; movie không tồn tại mới trả zero và không cache.
- [x] P8.4 — `recordView/Like/Comment/Rating` và `setRatingStats` dùng chung `ensureStats()` → DB load trước khi `HINCRBY`.
- [x] P8.5 — Cập nhật spec có sẵn `movie-interaction-stats.service.spec.ts`; không tạo file test mới.

---

## 4. Definition of Done

- Envelope `{success,statusCode,message,result}`; list có `pagination`.
- Mọi endpoint admin có guard thật, không chỉ decorator.
- Không test skeleton, không commit/push.
- Backend gates xanh: `npx tsc --noEmit -p tsconfig.json`, `npx eslint ...`, `npm test -- --runInBand`.
