# V31 — Backend: chuẩn hoá search / filter / sort cho users, ratings, comments, interactions, failed-events

## Trạng thái

✅ Hoàn thành — 2026-11-13

## Người thực hiện & thời gian

- Người thực hiện: AI agent (Big Pickle)
- Bắt đầu: 2026-11-13
- Hoàn thành: 2026-11-13

## Phạm vi

- Scope: `backend`.
- Mẫu tham chiếu: `GET /api/roles` (đã được developer cập nhật filter/sort).
- Áp dụng cùng hợp đồng request/response cho các API list:
  - `users`, `ratings`, `comments`, `interactions`, `failed-events`.
- Không đổi path, method, auth hiện có. Không xoá endpoint/field cũ.
- Giữ nguyên response envelope `{success, statusCode, message, result, pagination}`.
- Repository vẫn là nơi dựng query (đúng `docs/BACKEND_RULES.md`: service không dùng `Repository` trực tiếp).

## Module liên quan

| File | Việc |
|---|---|
| `backend/src/common/utils/search.util.ts` | `parseFilter` giữ đủ value có dấu `:`; `in`/`notin` nhận danh sách phân tách bằng `,` |
| `backend/src/common/utils/search.util.spec.ts` | test cho parse/apply filter + parse sort |
| `backend/src/modules/users/users.repository.ts` | thêm `search()` (keyword + filter + sort + pagination) |
| `backend/src/modules/users/users.service.ts` | `findAll()` chuẩn hoá page/limit, trả `{result, pagination}` |
| `backend/src/modules/users/users.controller.ts` | nhận `BaseSearchRequest`, trả envelope |
| `backend/src/modules/ratings/ratings.repository.ts` | `findAll`/`findByMovie` nhận `BaseSearchRequest` |
| `backend/src/modules/ratings/ratings.service.ts` | trả `{result, pagination}` |
| `backend/src/modules/ratings/ratings.controller.ts` | nhận `BaseSearchRequest` |
| `backend/src/modules/comments/comments.repository.ts` | `findAll`/`findByMovie` nhận `BaseSearchRequest` |
| `backend/src/modules/comments/comments.service.ts` | trả `{result, pagination}` |
| `backend/src/modules/comments/comments.controller.ts` | nhận `QueryCommentDto` (kế thừa `BaseSearchRequest`) |
| `backend/src/modules/comments/dto/query-comment.dto.ts` | đổi base sang `BaseSearchRequest` |
| `backend/src/modules/interactions/interactions.repository.ts` | `findAll`/`findByUser` nhận `BaseSearchRequest` |
| `backend/src/modules/interactions/interactions.service.ts` | trả `{result, pagination}` cho list |
| `backend/src/modules/interactions/interactions.controller.ts` | nhận `BaseSearchRequest` cho list |
| `backend/src/modules/failed-events/failed-events.repository.ts` | `search()` nhận `BaseSearchRequest` |
| `backend/src/modules/failed-events/failed-events.service.ts` | `findAll()` nhận search request |
| `backend/src/modules/failed-events/failed-events.controller.ts` | nhận `FailedEventSearchDto` |
| `backend/src/modules/failed-events/dtos/failed-event-search.dto.ts` | `BaseSearchRequest` + `status?` (tương thích query cũ) |
| `docs/BACKEND.md` | cập nhật bảng query params + ví dụ |
| `docs/plans/PLAN_INDEX.md` | thêm dòng V31, `next_index = 32` |

## Hợp đồng chung (request)

Query params dùng chung `BaseSearchRequest` (`backend/src/common/dtos/base-search-query.dto.ts`):

| Param | Kiểu | Mô tả |
|---|---|---|
| `page` | number ≥ 1, mặc định `1` | trang hiện tại |
| `limit` | number 1..100, mặc định `10` | số item/trang (service clamp) |
| `keyword` | string | tìm ILIKE trên các cột text của từng module (bảng bên dưới) |
| `filters` | string, **lặp lại được** | `field:operator:value`. Ví dụ `filters=status:eq:ACTIVE&filters=createdAt:gte:2026-01-01` |
| `sort` | string | `field:direction[,field:direction]`; mặc định `createdAt:DESC`; luôn thêm `id ASC` làm tie-breaker nếu chưa sort theo `id` |

Operator hỗ trợ (không phân biệt hoa/thường):

| Operator | Ý nghĩa | Ghi chú |
|---|---|---|
| `eq` / `ne` | `=` / `!=` | |
| `gt` / `gte` / `lt` / `lte` | so sánh | |
| `in` / `notin` | thuộc / không thuộc | value phân tách bằng `,` — ví dụ `status:in:ACTIVE,BLOCKED` |
| `between` | trong khoảng | value dạng `from_to` — ví dụ `createdAt:between:2026-01-01_2026-12-31` |
| `contains` | ILIKE `%value%` | dùng cho cột text |
| `isnull` / `isnotnull` | null / not null | value có thể bỏ trống |

Quy ước value:

- `filters` **không** phân tách nhiều filter bằng dấu `,` (vì `,` dùng cho `in`). Mỗi filter là một param `filters` riêng.
- Value có dấu `:` (timestamp ISO) được giữ nguyên (phần sau dấu `:` thứ 2).
- Field/operator lạ → `400` với `errorCode` `INVALID_FILTER`; sort sai field/direction → `400` `INVALID_SORT_FIELD` / `INVALID_SORT_DIRECTION`; sort thiếu `:` → `400` `INVALID_SORT`.

## Hợp đồng chung (response)

```json
{
  "success": true,
  "statusCode": 200,
  "message": "...",
  "result": [],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 10,
    "totalPages": 10
  }
}
```

- Lỗi giữ nguyên format của global exception filter: `{success:false, statusCode, message, errorCode, timestamp, path}`.

## Hợp đồng theo module

### Users — `GET /api/users`

- Keyword ILIKE: `fullName`, `email`, `phoneNumber`.
- Filter fields: `id`, `email`, `fullName`, `phoneNumber`, `status`, `isVerified`, `gender`, `birthDate`, `createdAt`, `updatedAt`, `roleId`, `roleCode`.
- Sort fields: `id`, `email`, `fullName`, `status`, `isVerified`, `birthDate`, `createdAt`, `updatedAt`.
- Join `roles` để trả kèm roles và filter theo role.

### Ratings — `GET /api/ratings`, `GET /api/ratings/movie/:movieId`

- Keyword ILIKE: `rating.content`, `user.fullName`, `user.email`, `movie.title`, `movie.titleVi`.
- Filter fields: `id`, `rating`, `content`, `timestamp`, `createdAt`, `updatedAt`, `userId`, `userEmail`, `userFullName`, `movieId`, `movieTitle`.
- Sort fields: `id`, `rating`, `timestamp`, `createdAt`, `updatedAt`.
- `GET /ratings/movie/:movieId` luôn AND thêm điều kiện `movieId` từ path.

### Comments — `GET /api/comments`, `GET /api/comments/movie/:movieId`

- Keyword ILIKE: `comment.content`, `user.fullName`, `user.email`, `movie.title`, `movie.titleVi`.
- Filter fields: `id`, `content`, `parentId`, `createdAt`, `updatedAt`, `userId`, `userEmail`, `userFullName`, `movieId`, `movieTitle`.
- Sort fields: `id`, `content`, `createdAt`, `updatedAt`.
- `GET /comments/movie/:movieId`: giữ `parentId?`; không truyền → root (`parentId IS NULL`); vẫn trả `replyCount` mỗi item.

### Interactions — `GET /api/interactions`, `/my-history`, `/my-favorites`

- Keyword ILIKE: `user.fullName`, `user.email`, `movie.title`, `movie.titleVi`, `interaction.type`.
- Filter fields: `id`, `score`, `type`, `createdAt`, `updatedAt`, `userId`, `userEmail`, `userFullName`, `movieId`, `movieTitle`.
- Sort fields: `id`, `score`, `type`, `createdAt`, `updatedAt`.
- `/my-history` luôn AND `type IN ('click')`; `/my-favorites` luôn AND `type IN ('like')`.

### Failed events — `GET /api/failed-events`

- Keyword ILIKE: `source`, `queueName`, `routingKey`, `eventId`, `eventType`, `correlationId`, `errorReason`.
- Filter fields: `id`, `status`, `source`, `queueName`, `routingKey`, `eventId`, `eventType`, `correlationId`, `retryCount`, `createdAt`, `updatedAt`.
- Sort fields: `id`, `status`, `source`, `queueName`, `routingKey`, `eventType`, `retryCount`, `createdAt`, `updatedAt`.
- Giữ tương thích `?status=PENDING` (được merge thành filter `status:eq:PENDING` nếu client chưa truyền filter status).

## Phases

### Phase 1 — Harden `SearchUtils`

- [x] `parseFilter`: value = phần sau dấu `:` thứ 2 (giữ timestamp có `:`)
- [x] `applyFilters`: `in` / `notin` nhận danh sách phân tách `,` (trim, bỏ phần rỗng)
- [x] Test `search.util.spec.ts`: sort hợp lệ/lỗi, filter eq/gte/between/in/notin/contains/isnull, value có `:`

### Phase 2 — Users

- [x] `IUserRepository.search(request)` + implement query builder (keyword/filter/sort/pagination)
- [x] `UsersService.findAll` trả `{result, pagination}` (clamp page/limit)
- [x] `UsersController.findAll` dùng `BaseSearchRequest`, envelope + `UserMapper`
- [x] Cập nhật `users.service.spec.ts`, bổ sung test controller `findAll`

### Phase 3 — Ratings

- [x] Repository `findAll`/`findByMovie` nhận `BaseSearchRequest`, trả `[data, total]`
- [x] Service trả `{result, pagination}`
- [x] Controller nhận `BaseSearchRequest`
- [x] Cập nhật spec service + controller

### Phase 4 — Comments

- [x] `QueryCommentDto extends BaseSearchRequest`
- [x] Repository `findAll`/`findByMovie` nhận `BaseSearchRequest` (giữ `replyCount`)
- [x] Service trả `{result, pagination}`
- [x] Controller nhận `QueryCommentDto`
- [x] Cập nhật spec service + controller

### Phase 5 — Interactions

- [x] Repository `findAll`/`findByUser` nhận `BaseSearchRequest`
- [x] Service trả `{result, pagination}` cho 3 API list
- [x] Controller nhận `BaseSearchRequest`
- [x] Cập nhật spec service + controller

### Phase 6 — Failed events

- [x] Thêm `FailedEventSearchDto` (`BaseSearchRequest` + `status?`)
- [x] Repository `search()` thay `findAndCount`
- [x] Service `findAll(request)`, merge `status` cũ vào filters
- [x] Controller nhận DTO mới
- [x] Cập nhật spec service + controller

### Phase 7 — Docs & verify

- [x] Cập nhật `docs/BACKEND.md` (bảng endpoint + mục "Search / filter / sort")
- [x] Cập nhật `docs/plans/PLAN_INDEX.md`
- [x] `npm run type-check`, `npm run lint`, `npm test` (backend)

## Ghi chú / quyết định

- Không thêm helper search mới ngoài `SearchUtils`; giữ đúng mẫu roles (keyword → `applyFilters` → `parseSort` → `skip/take`).
- `limit` được clamp 1..100 ở service (giống roles) để tránh query quá lớn.
- Sort mặc định `createdAt:DESC` + tie-breaker `id ASC`; riêng interactions đổi từ `id DESC` sang `createdAt DESC` cho đồng nhất (có thể chỉ định `sort=id:DESC` để giữ hành vi cũ).
- `failed-events` giữ `status?` để không phá client cũ; đồng thời hỗ trợ `filters=status:eq:...`.
- `BaseSearchRequest.sort` đổi thành optional (`sort?: string[]`) để object literal (test/consumer) không bắt buộc truyền `sort`; runtime vẫn mặc định `['createdAt:DESC']`.
- `movies.service.spec.ts` cập nhật kỳ vọng `BadRequestException` → `AppException` cho khớp `SearchUtils` dùng chung (test cũ fail do refactor trước đó, không thuộc logic V31).
- Không commit/push (chờ yêu cầu).
