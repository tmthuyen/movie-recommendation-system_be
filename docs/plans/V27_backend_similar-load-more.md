# V27 — Similar movies load-more: backend cursor API + frontend infinite scroll (API-first)

## 0. Thông tin chung

| Hạng mục | Nội dung |
|---|---|
| **Trạng thái** | 🟡 Backend P1–P5 và frontend P6–P10 đã implement/verify; smoke runtime chờ môi trường |
| **Người thực hiện** | AI Agent (implementation) + developer xác nhận |
| **Thời gian** | 2026-11-07 |
| **Scope** | `backend` (P1–P5) + `frontend` (P6–P10) |
| **Module liên quan** | Backend: `common/dtos`, `common/utlils`, `modules/recommendations`. Frontend: `apis/recommendation.api.ts`, `hooks/tankstack/useRecommendation.ts`, `hooks/useInfiniteScrollTrigger.ts`, `components/common/Column*`, `components/movie/similar-movies*`, `shared/types/*` |
| **Không sửa** | `ai-service`, `docs/BACKEND_RULES.md`, `docs/FRONTEND_RULES.md` |
| **Ngoài phạm vi** | Nâng window >100, thay đổi API topK, xoá API/hook/component cũ |

## 1. Mục tiêu

1. Thêm endpoint cursor **mới**, không thay đổi endpoint topK hiện tại.
2. Lần đầu gọi AI service và cache snapshot; các lần sau đọc cache, cắt theo cursor.
3. Trả `nextCursor` + `hasMore` để frontend infinite scroll.
4. Cursor phát hiện snapshot cũ/đổi version → `409 CURSOR_EXPIRED`; cursor hỏng → `400 INVALID_CURSOR`.
5. Cursor/pagination được thiết kế **dùng chung** cho similar, hybrid và semantic search, không hard-code logic vào recommendations.
6. Frontend phase sau dùng `useInfiniteQuery` + `IntersectionObserver`; giữ nguyên API/hook/component topK cũ.
7. Không commit/push nếu developer chưa yêu cầu.

## 2. Thiết kế dùng chung

### 2.1. Response type

`backend/src/common/dtos/paginated-result.interface.ts`:

```ts
export interface CursorPagination {
  limit: number;
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ResultWithCursorPagination<T> {
  result: T[];
  pagination: CursorPagination;
}
```

### 2.2. Query DTO

`backend/src/common/dtos/cursor-query.dto.ts`:

- `cursor?: string` — opaque, bỏ trống ở trang đầu.
- `limit?: number` — mặc định `12`, min `1`, max `50`.

### 2.3. Cursor utility

`backend/src/common/utlils/cursor-pagination.util.ts` (theo folder util hiện có):

```ts
interface CursorPayload {
  v: number; // snapshot version
  s: string; // stable scope: `similar:1`, `semantic:<hash>`, `hybrid:<hash>`
  o: number; // next offset
  f: string; // fingerprint của ordered id list
}
```

Hàm dùng chung:

- `encodeCursor(payload)` / `decodeCursor(cursor)` — base64url + Zod.
- `fingerprintIds(ids)` — hash SHA-1 rút gọn, ổn định theo thứ tự.
- `resolveCursorOffset(cursor, context, itemCount)` — trả offset; sai scope/offset → `400 INVALID_CURSOR`; sai version/fingerprint → `409 CURSOR_EXPIRED`.
- `clampCursorLimit(limit, fallback, max)`.
- `hydrateCursorPage({ items, offset, limit, hydrate })` — cắt snapshot, gọi hydrate theo chunk, skip item missing, fill đủ `limit` nếu còn item phía sau.
- `buildCursorPagination({ limit, total, offset, scope, version, fingerprint })`.

Nhờ vậy hybrid/semantic search chỉ cần truyền `scope`, `version`, `fingerprint` và hàm hydrate tương ứng.

## 3. Contract API mới

```http
GET /api/recommendations/similar/:id/cursor?limit=12&cursor=<nextCursor>
```

Response thành công:

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Danh sách phim tương tự đã được lấy thành công.",
  "result": [],
  "pagination": {
    "limit": 12,
    "total": 100,
    "hasMore": true,
    "nextCursor": "eyJ2IjowLCJzIjoic2ltaWxhcjoxIiwibyI6MTIsImYiOiI..."
  }
}
```

Lỗi:

- `400 INVALID_CURSOR` — cursor hỏng, sai scope, offset không hợp lệ.
- `409 CURSOR_EXPIRED` — version/fingerprint không khớp snapshot hiện tại.
- `404` — movie không tồn tại (dùng `movieService.findOne`).

## 4. Backend phases

- [x] **P0 — Plan & index**
  - Tạo plan này.
  - Cập nhật `docs/plans/PLAN_INDEX.md` (V27, `next_index=28`).
- [x] **P1 — Contract & type dùng chung**
  - Thêm `CursorPagination`, `ResultWithCursorPagination<T>`.
  - Thêm `CursorQueryDto`.
  - Thêm `cursor-pagination.util.ts` + test.
- [x] **P2 — Service**
  - `getSnapshot` trả thêm `version`, `fingerprint`.
  - Thêm `getSimilarMoviesByCursor`.
  - Giữ nguyên `getSimilarMovies` topK.
- [x] **P3 — Controller**
  - Thêm `GET /similar/:id/cursor`.
  - Trả envelope `{success, statusCode, message, result, pagination}`.
- [x] **P4 — Test**
  - Unit cursor util, service cursor, controller cursor.
  - Test hồi quy API topK.
- [x] **P5 — Docs & verify**
  - Cập nhật `docs/BACKEND.md`.
  - Chạy `type-check`, `lint`, `test` (385 pass), `build` — pass.
  - [ ] Smoke 2–3 trang khi backend/AI service/Redis chạy thực tế.

## 5. Frontend phases (sau backend)

- [x] **P6 — Type & API client**: `CursorPagination`, `ApiCursorPaginatedResponse`, `getSimilarMoviesCursor`; bổ sung `similarityScore`/`rank` cho `MovieWithSimilarScore`.
- [x] **P7 — Hook**: `useGetSimilarMoviesInfinite` dùng `useInfiniteQuery`; query key riêng, giữ hook topK cũ.
- [x] **P8 — UI**: `SimilarMoviesInfinite` + `ColumnInfiniteScroll`/`ColumnList`/`useInfiniteScrollTrigger`; đủ trạng thái loading/empty/error/end.
- [x] **P9 — Wiring & test**: chuyển tab “Phim tương tự”, mock IntersectionObserver, test API/hook/scroll component.
- [x] **P10 — Verify frontend**: `type-check`, `lint`, `vitest`, `build`.

Ghi chú UI:
- Motion được chuyển từ `MotionStagger when="in-view"` (amount 0.15 → list dài phải scroll nhiều mới chạy) sang `ColumnList` reveal từng card với `viewportAmount=0.05`.
- `ColumnInfiniteScroll` là component dùng chung cho mọi danh sách dạng cột; `MovieColumn` cũng dùng `ColumnList` để đồng bộ motion.
- `SimilarMovies`, `useGetSimilarMovies`, `getSimilarMovies` (topK) vẫn giữ nguyên.

## 6. Test plan backend

- Cursor round-trip, base64 sai, JSON/schema sai, fingerprint ổn định.
- Trang đầu: gọi AI 1 lần, trả `limit` item, có `nextCursor`.
- Trang 2: dùng cursor, không gọi AI lần 2, không trùng item.
- Trang cuối: `hasMore=false`, `nextCursor=null`.
- Cursor sai movie/scope → `400`.
- Version tăng hoặc snapshot đổi fingerprint → `409`.
- Snapshot có id không còn trong DB → skip + fill item phía sau.
- API topK cũ giữ nguyên contract/test.

## 7. Definition of Done — backend

- [x] Endpoint cursor hoạt động, envelope + `pagination.nextCursor/hasMore` đúng.
- [x] Cursor util dùng chung, không gắn cứng vào similar.
- [x] Trang đầu gọi AI + cache; trang sau cache hit không gọi AI (unit test).
- [x] API topK cũ không đổi (test hồi quy pass).
- [x] Unit test mới + test cũ xanh (385 test); `type-check`, `lint`, `build` pass.
- [x] `docs/BACKEND.md` + `PLAN_INDEX.md` cập nhật.
- [ ] Smoke runtime 2–3 trang khi có môi trường.
- [ ] Không commit/push nếu developer chưa yêu cầu.

## 8. Definition of Done — frontend

- [x] `getSimilarMoviesCursor` + `useGetSimilarMoviesInfinite` hoạt động, giữ API/hook topK cũ.
- [x] `SimilarMoviesInfinite` tự tải trang kế khi scroll gần cuối, dừng khi `hasMore=false`.
- [x] `ColumnInfiniteScroll`/`ColumnList` tái sử dụng cho danh sách dạng cột; `MovieColumn` dùng chung `ColumnList`.
- [x] Motion reveal từng card (`viewportAmount=0.05`) — không còn phải scroll cao mới thấy hiệu ứng.
- [x] Có đủ loading/empty/error/end; lỗi trang kế không xoá item đã có; `409 CURSOR_EXPIRED` reset query.
- [x] Test API/hook/scroll component mới xanh; `type-check`, `lint` (0 errors), `vitest` (274 pass), `build` pass.
- [ ] Smoke UI runtime trên trang chi tiết phim (cần backend + AI service chạy).
- [ ] Không commit/push nếu developer chưa yêu cầu.
