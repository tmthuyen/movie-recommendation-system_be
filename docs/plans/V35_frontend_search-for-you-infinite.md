# V35 — Trang tìm kiếm (semantic/rerank/lexical) + "Dành cho bạn" + grid phim infinite scroll + review UI bình luận

## 0. Thông tin plan

| Trường | Giá trị |
|---|---|
| Trạng thái | 🟡 Task 1–2 hoàn thành code + gate tự động; Task 3 (review UI bình luận) đã xong, không sửa code; QA thủ công (375px, dark mode) chưa chạy; chờ endpoint `lexical-search/cursor` |
| Người thực hiện | AI agent (Build) + developer review |
| Thời gian | 2026-11-18 |
| Scope | `frontend` (chính) + `docs` (rules comment, cập nhật tài liệu) |
| Module ảnh hưởng | `frontend/src/app/(main)/search/*`, `frontend/src/app/(main)/for-you/*`, `frontend/src/components/search/*`, `frontend/src/components/movie/*`, `frontend/src/components/layout/header-search.tsx`, `frontend/src/apis/recommendation.api.ts`, `frontend/src/hooks/tankstack/useRecommendation.ts`, `docs/*` |
| Index | `V35` (`max(index)=35`, `next_index=36`) |

---

## 1. Bối cảnh & mục tiêu

Frontend đã có trang `/movies` (tìm kiếm + lọc phim từ DB) và cột "Phim tương tự" trên trang chi tiết, nhưng còn thiếu:

- Trang tìm kiếm theo **gợi ý của AI** (semantic / rerank / từ khóa) và không có load-more.
- Danh sách **"Dành cho bạn"** (gợi ý cá nhân hoá) dạng grid có load-more; hiện chỉ có khối gợi ý trên trang chủ.
- Grid phim dùng chung cho các trang danh sách có infinite scroll.

**Mục tiêu:**

1. Trang `/search` với 3 chế độ `semantic` / `rerank` / `lexical`, infinite scroll, chọn chế độ ngay trên trang.
2. Tab **"Dành cho bạn"** trên trang chi tiết phim (chỉ hiện khi đã đăng nhập) và trang `/for-you` có infinite scroll.
3. Một component grid infinite scroll dùng lại được cho các trang danh sách phim sau này.
4. Chuẩn hoá comment trong code mới: trung lập, mô tả biến/hàm/class/tham số/return.
5. **Review-only** UI danh sách bình luận: chỉ đánh giá và liệt kê vấn đề, **không sửa code**.

**Ngoài phạm vi:** viết endpoint `lexical-search/cursor` ở backend (developer bổ sung sau), viết test mới cho code mới, đổi stack UI/state/HTTP.

---

## 2. Hợp đồng API đã xác minh (không được bịa)

Theo `docs/BACKEND.md` + `backend/src/modules/recommendations/recommendations.controller.ts`:

| Endpoint | Auth | Query | Response `pagination` | Ghi chú |
|---|---|---|---|---|
| `GET /api/recommendations/semantic-search/cursor` | Public | `keyword` (bắt buộc), `cursor?` = rank cuối trang trước, `limit?` 1–50 (mặc định 12) | `{ limit, total, hasMore, nextCursor }` | Đã hoạt động; trang đầu bỏ trống `cursor` |
| `GET /api/recommendations/search-rerank/cursor` | Public | `keyword` (bắt buộc), `cursor?` = rank, `limit?` | `{ limit, total, hasMore, nextCursor }` | Kết hợp BM25 (PostgreSQL) + semantic rerank (RRF) |
| `GET /api/recommendations/for-you/cursor` | JWT | `cursor?` = rank, `limit?` | `{ limit, total, hasMore, nextCursor }` | Chỉ gọi khi đã đăng nhập |
| `GET /api/recommendations/lexical-search/cursor` | — | `keyword`, `cursor?`, `limit?` | — | **Chưa có ở backend**; frontend hiển thị thông báo khi 404 |

Quy ước chung:

- Envelope thành công: `{ success, statusCode, message, result, pagination }`.
- `nextCursor = null` khi hết dữ liệu; frontend dùng `pagination.nextCursor` cho trang kế.
- Cursor hết hạn/không còn hợp lệ → backend trả `409 CURSOR_EXPIRED`; frontend `resetQueries` + toast.
- `limit` vượt 50 → `400` (DTO validate).

---

## 3. Kiến trúc & luồng

```
frontend/src/
  app/(main)/
    search/page.tsx                    # route /search (server component)
    for-you/page.tsx                   # route /for-you (server component)
  components/
    search/
      search-client.tsx                # state keyword/mode, gọi infinite query, 409/404
      search-mode-selector.tsx         # pill chọn chế độ
    movie/
      movie-infinite-grid.tsx          # grid + sentinel + loading/empty/error (dùng chung)
      for-you-list.tsx                 # /for-you: grid + trạng thái khách
      for-you-movies-infinite.tsx      # tab "Dành cho bạn" trên chi tiết phim
      movie-grid.tsx                   # thêm prop motion: 'stagger' | 'reveal'
      movie-detail-tabs.tsx            # chèn tab khi đã đăng nhập
  apis/recommendation.api.ts           # 3 method cursor mới
  hooks/tankstack/useRecommendation.ts # query key + 2 hook infinite + enabled cho useForYou
  components/layout/header-search.tsx  # submit → /search?q=...
```

Nguyên tắc:

1. `MovieInfiniteGrid` chỉ nhận dữ liệu đã gộp + callback tải trang kế; không tự gọi API, không biết domain.
2. Trang/hook quyết định endpoint theo `mode`; component không rẽ nhánh theo API.
3. Query key tách theo `mode` + `keyword` + `limit` để đổi chế độ không dùng nhầm cache.
4. `/search` và `/for-you` dùng `MovieGrid` chế độ `reveal`; các trang cũ giữ mặc định `stagger`.

---

## 4. Phases & tiến độ

### P1 — Trang `/search`

- [x] Route `/search`; từ khoá lấy từ `?q=`, chế độ từ `?mode=` (mặc định `semantic`).
- [x] Header search submit điều hướng `/search?q=<keyword>`; chế độ chỉ chọn trong trang.
- [x] `SearchModeSelector`: `semantic` / `rerank` / `lexical`, có `cursor-pointer`, `focus-visible`, touch target ≥ 44px.
- [x] `useSearchMoviesInfinite` gọi đúng endpoint theo mode, `initialPageParam = undefined`, `getNextPageParam` theo `hasMore/nextCursor`.
- [x] Infinite scroll bằng sentinel dùng lại `useInfiniteScrollTrigger`.
- [x] `409` → `resetQueries` + toast "phiên tìm kiếm đã thay đổi".
- [x] `lexical` 404 → thông báo "Chế độ từ khóa chưa khả dụng" (không crash).
- [x] Không hiển thị badge `rank`/`score`.
- [x] Trạng thái loading (skeleton), rỗng, lỗi; nút "Thử lại" khi lỗi.

### P2 — "Dành cho bạn"

- [x] Tab "Dành cho bạn" trên trang chi tiết phim, **chỉ hiện khi đã đăng nhập**; khách không thấy tab (không hiện lời nhắc đăng nhập).
- [x] `/for-you` dùng chung `useForYouInfinite` + `forYouInfiniteQueryKey` với tab chi tiết.
- [x] Khách vào `/for-you`: hiện lời nhắc đăng nhập bằng `requireLogin()` tại chỗ, **không redirect**.
- [x] `useForYou` nhận `enabled`; trang chủ truyền `isAuthenticated` để khách không phát sinh request 401.
- [x] Link "Dành cho bạn" trên trang chủ đổi `/recommendations` → `/for-you`.
- [x] Tab chi tiết giữ nguyên template cột của "Phim tương tự", chỉ đổi nguồn dữ liệu.

### P3 — Hạ tầng dùng chung

- [x] `MovieInfiniteGrid`: grid + sentinel + skeleton/empty/error + "đã hết" dùng chung cho `/search`, `/for-you`, tab chi tiết.
- [x] `MovieGrid` thêm `motion?: 'stagger' | 'reveal'` (mặc định `stagger` giữ hành vi cũ).
- [x] `MovieInfiniteGrid` nhận `movies`, `hasNextPage`, `isFetchingNextPage`, `fetchNextPage`, trạng thái lỗi/rỗng.

### P4 — Sửa vỡ layout grid

- [x] Xác định nguyên nhân: `MotionReveal` bọc card bằng `className="flex h-full"` khiến mỗi card thành flex item co theo nội dung.
- [x] Đổi wrapper sang `className="h-full min-w-0"`.
- [x] Đo lại bằng Chrome headless ở viewport 1280px: 12/12 card rộng **304px**, kể cả phim **không có ảnh** (`Бүркітші`, `Haboolm Ksinaalgat`) cao 232px bằng card có ảnh.
- [x] Ghi lại quy ước breakpoint grid trong `docs/FRONTEND_RULES.md` cho khớp `MovieGrid` hiện tại.

### P5 — Rule & dọn comment

- [x] `docs/CODE_RULES.md`: thêm `## 6. Comment trong code (mọi service)` + 1 mục trong self-check 5.5.
- [x] `docs/FRONTEND_RULES.md` §11.1: siết rule comment trung lập; cấm comment ghi chú/trò chuyện/kế hoạch.
- [x] Viết lại comment trong code mới: `recommendation.api.ts`, `useRecommendation.ts`, `movie-grid.tsx`, `movie-infinite-grid.tsx`, `search-mode-selector.tsx`, `search-client.tsx`, `for-you-list.tsx`, `for-you-movies-infinite.tsx`, `header-search.tsx`.

### P6 — Review UI danh sách bình luận (review-only, không sửa code)

- [x] Đọc `frontend/src/components/movie/movie-comments.tsx` + `frontend/src/hooks/tankstack/useComment.ts`.
- [x] Đánh giá UI/UX, state, optimistic, realtime, phân cấp reply, accessibility.
- [x] Phân loại vấn đề P0/P1 kèm vị trí và hướng sửa; **không thay đổi code** theo yêu cầu.
- [x] Kết quả ghi tại §9.5.

### P7 — Gate tự động & QA

- [x] `npm run type-check` ✅
- [x] `npm run lint` ✅ 0 error (warning cũ không tăng)
- [x] `npm test` ✅ 274/274
- [x] `npm run build` ✅ (đã chạy trước vòng sửa comment/className; không chạy lại khi dev server đang chạy để tránh ghi đè `.next`)
- [ ] QA thủ công: `/search` và `/for-you` ở 375px, dark mode, keyboard, `cursor-pointer`, touch target ≥ 44px.
- [ ] QA thủ công luồng đăng nhập: tab "Dành cho bạn" xuất hiện/biến mất đúng; `/for-you` với khách hiện lời nhắc không redirect.

---

## 5. File mới / file sửa

### File mới

| File | Vai trò |
|---|---|
| `frontend/src/app/(main)/search/page.tsx` | Route `/search`. |
| `frontend/src/components/search/search-client.tsx` | State keyword/mode, infinite query, xử lý 409/404. |
| `frontend/src/components/search/search-mode-selector.tsx` | Pill chọn chế độ tìm kiếm. |
| `frontend/src/app/(main)/for-you/page.tsx` | Route `/for-you`. |
| `frontend/src/components/movie/for-you-list.tsx` | Grid "Dành cho bạn" + trạng thái khách. |
| `frontend/src/components/movie/for-you-movies-infinite.tsx` | Tab "Dành cho bạn" trên trang chi tiết. |
| `frontend/src/components/movie/movie-infinite-grid.tsx` | Grid + sentinel dùng chung. |

### File sửa

| File | Thay đổi |
|---|---|
| `frontend/src/apis/recommendation.api.ts` | Thêm `semanticSearchCursor`, `searchRerankCursor`, `lexicalSearchCursor`, `forYouCursor`. |
| `frontend/src/hooks/tankstack/useRecommendation.ts` | `searchInfiniteQueryKey`, `useSearchMoviesInfinite`, `forYouInfiniteQueryKey`, `useForYouInfinite`; `useForYou` nhận `enabled`. |
| `frontend/src/components/movie/movie-grid.tsx` | Prop `motion`; sửa wrapper `reveal` từ `flex h-full` → `h-full min-w-0`. |
| `frontend/src/components/movie/movie-detail-tabs.tsx` | Chèn tab "Dành cho bạn" khi đã đăng nhập. |
| `frontend/src/components/layout/header-search.tsx` | Submit điều hướng `/search?q=...`. |
| `frontend/src/app/(main)/(home)/page.tsx` | `useForYou({ enabled: isAuthenticated })`; link `/for-you`. |
| `docs/FRONTEND.md` | Bổ sung route, bảng API cursor, ghi chú recommendation. |
| `docs/FRONTEND_RULES.md` | §11.1 comment; sửa quy ước breakpoint grid. |
| `docs/CODE_RULES.md` | §6 comment + self-check. |
| `docs/plans/PLAN_INDEX.md` | Thêm V35, `next_index = 36`. |

Task 3 (review UI bình luận) **không sửa file code**; kết quả ghi tại §9.5.

---

## 6. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| Backend chưa có `lexical-search/cursor` | UI bắt 404 và hiện "Chế độ từ khóa chưa khả dụng"; không chặn 2 chế độ còn lại. |
| Cursor hết hạn khi dữ liệu đổi (`409`) | `resetQueries` + toast; người dùng tải lại từ trang đầu. |
| Khách gọi API for-you gây 401 | `enabled: isAuthenticated` ở hook; tab chi tiết ẩn khi chưa đăng nhập. |
| Đổi `mode`/`keyword` dùng nhầm cache | Query key tách theo `mode`, `keyword`, `limit`. |
| Grid vỡ lại do wrapper flex | Quy ước `min-w-0` + breakpoint đã ghi trong `docs/FRONTEND_RULES.md`. |
| `MovieGrid` đổi mặc định làm ảnh hưởng trang cũ | Mặc định vẫn là `stagger`; chỉ trang mới dùng `reveal`. |
| Trùng cache giữa tab chi tiết và `/for-you` | Dùng chung `forYouInfiniteQueryKey` là chủ đích; dữ liệu đồng nhất. |

---

## 7. QA checklist

- [ ] `/search?q=phim&mode=semantic`: cuộn tới cuối tự tải thêm, dừng đúng khi hết.
- [ ] `/search?q=phim&mode=rerank`: kết quả + load-more hoạt động.
- [ ] `/search?q=phim&mode=lexical`: hiện thông báo chưa khả dụng, không crash.
- [ ] Đổi mode giữ nguyên keyword; đổi keyword reset về trang đầu.
- [ ] Không có badge rank/score trên card.
- [ ] `/for-you` khi đã đăng nhập: grid + load-more; khi là khách: lời nhắc đăng nhập, không redirect.
- [ ] Tab "Dành cho bạn" chỉ hiện khi đã đăng nhập; ẩn hoàn toàn với khách.
- [ ] Grid: card có ảnh và không có ảnh đều rộng bằng nhau; 375px không tràn ngang.
- [ ] Dark mode: text/viền/nút đọc được.
- [ ] Keyboard: Tab tới mode selector và nút thử lại; `focus-visible` rõ.
- [ ] Mọi phần tử click được có `cursor-pointer`; touch target ≥ 44px.

---

## 8. Definition of Done

- `/search` chạy 3 chế độ, infinite scroll, xử lý 409/404, không badge rank/score.
- "Dành cho bạn" có trên tab chi tiết (auth-gated) và `/for-you` (khách thấy lời nhắc, không redirect).
- Grid phim full width cho cả card có ảnh và không có ảnh.
- `MovieInfiniteGrid` dùng lại được cho trang danh sách phim khác.
- Review UI danh sách bình luận đã giao (P0/P1, có vị trí + hướng sửa), không sửa code.
- Rule comment trung lập đã ghi trong `docs/CODE_RULES.md` và `docs/FRONTEND_RULES.md`; code mới không còn comment ghi chú/trò chuyện.
- `type-check` / `lint` / `test` xanh; build xanh; QA checklist pass.
- `PLAN_INDEX.md` cập nhật V35 và `next_index = 36`.

---

## 9. Nhật ký triển khai (2026-11-18)

### 9.1 Quyết định kỹ thuật

| Quyết định | Lý do |
|---|---|
| Route `/search`, keyword trên `?q=`, mode trên `?mode=` | Chia sẻ được URL, back/forward giữ trạng thái. |
| Mode mặc định `semantic` | Khớp hành vi tìm kiếm gợi ý AI. |
| Cursor = rank offset | Đúng hợp đồng backend; không encode. |
| Dùng chung `useForYouInfinite` cho tab và trang | Một nguồn dữ liệu, cache thống nhất. |
| Ẩn tab khi chưa đăng nhập | Tránh 401 và tránh lời nhắc đăng nhập ngoài ý muốn trên trang chi tiết. |
| `MovieGrid` thêm `motion` thay vì tạo grid mới | Giữ nguyên hành vi các trang cũ. |

### 9.2 Vòng sửa layout grid

| Vấn đề | Cách sửa |
|---|---|
| Card co lại, text bị ép, khác trang `/movies` | `MotionReveal` trong chế độ `reveal` dùng `className="flex h-full"` → mỗi card là flex item co theo nội dung. Đổi sang `h-full min-w-0`. |
| Phim không có ảnh cũng không full width | Cùng nguyên nhân; sau khi sửa wrapper, card không ảnh cũng rộng 304px như card có ảnh. |
| Kiểm chứng | Chrome headless 1280px: `/search?q=phim` 12 card × 304px; `/search?q=Haboolm Ksinaalgat` có 2 phim không ảnh vẫn 304×232. |

### 9.3 Vòng sửa comment

| Vấn đề | Cách sửa |
|---|---|
| Comment ghi chú/trò chuyện trong code mới | Viết lại thành JSDoc trung lập (chức năng, `@param`, `@returns`). |
| Thiếu rule chung | Thêm §6 vào `docs/CODE_RULES.md` (áp dụng mọi service) và siết §11.1 `docs/FRONTEND_RULES.md`. |

### 9.4 Gate tự động

| Hạng mục | Kết quả |
|---|---|
| `npm run type-check` | ✅ |
| `npm run lint` | ✅ 0 error |
| `npm test` | ✅ 274/274 |
| `npm run build` | ✅ (trước vòng sửa comment/className) |

### 9.5 Kết quả review UI danh sách bình luận (Task 3 — review-only)

Phạm vi đọc: `frontend/src/components/movie/movie-comments.tsx`, `frontend/src/hooks/tankstack/useComment.ts`. Không sửa code.

#### P0 — Nên sửa trước khi coi UI bình luận là hoàn thiện

| # | Vị trí | Vấn đề | Hướng sửa |
|---|---|---|---|
| 1 | `movie-comments.tsx:82` | Debug text `Level {level} - Comment ID: ... - Parent ID: ...` render thẳng ra UI cho người dùng thấy. | Xoá dòng debug (hoặc bọc sau cờ dev không render production). |
| 2 | `useComment.ts:62` | Optimistic dùng key `['comments', movieId, 'root', 1]` (4 phần) nhưng query thật dùng key 5 phần `['comments', movieId, 'root', page, limit]` → comment tạm **không vào cache**, chỉ hiện sau khi invalidate. | Dùng `setQueriesData` với prefix `['comments', movieId, 'root']` (giống `handleRemoteComment`) hoặc dựng key đủ `limit`. |
| 3 | `movie-comments.tsx:397` | Chỉ xử lý `isLoading`; không có nhánh `isError` → API lỗi sẽ hiện "Chưa có bình luận nào" (sai bản chất) và không có cách thử lại. | Thêm trạng thái lỗi + nút "Thử lại" (`refetch`). |
| 4 | `movie-comments.tsx:108` | Nút "Trả lời" hiện cả với comment tạm `id < 0`; gửi `parentId` âm sẽ lỗi backend. | Ẩn/disable nút khi `isTemporary`. |

#### P1 — Nên sửa để UI rõ ràng, đúng dữ liệu

| # | Vị trí | Vấn đề | Hướng sửa |
|---|---|---|---|
| 5 | `movie-comments.tsx:243-244, 326-343` | Code chết: state `replyTo`/`replyContent` + `handleSubmitReply` ở component cha không được form nào dùng (reply nằm trong `CommentItem`). | Xoá state/handler thừa. |
| 6 | `movie-comments.tsx:367` | `notifyTyping` phát socket mỗi lần gõ; chỉ có debounce tắt sau 2s, không throttle → spam sự kiện khi gõ nhanh. | Throttle ~1–2s hoặc chỉ emit khi chuyển trạng thái gõ/không gõ. |
| 7 | `movie-comments.tsx:156, 160, 169, 379` | `Input` `min-h-9` và `Button size="sm"` thấp hơn touch target 44px. | Tăng chiều cao tối thiểu hoặc dùng size mặc định. |
| 8 | `movie-comments.tsx:198` | Reply list cố định `limit: 20`, không có "xem thêm" → mất reply nếu vượt 20. | Thêm load-more hoặc hiển thị rõ giới hạn. |
| 9 | `movie-comments.tsx:300` | Hiển thị cứng "Ai đó  đang gõ" (2 dấu cách), bỏ qua `userFullName` trong payload. | Dùng tên từ payload, fallback "Ai đó đang gõ". |
| 10 | `movie-comments.tsx:353` | Header "Bình luận (total)" chỉ đếm root; reply không được cộng vào `total` → người dùng hiểu nhầm tổng. | Đổi nhãn "Bình luận gốc" hoặc tính tổng cả reply nếu API hỗ trợ. |
| 11 | `movie-comments.tsx:213-214` | `level > 2` đặt `pl-0` làm mất dấu phân cấp; reply lồng sâu khó đọc. | Giới hạn level hiển thị hoặc flatten reply sâu về cùng cấp. |

**Kết luận review:** UI bình luận có đủ chức năng cơ bản (phân trang root, reply, optimistic, realtime), nhưng 4 lỗi P0 ảnh hưởng trực tiếp trải nghiệm/đúng dữ liệu; nên xử lý P0 trước khi mở rộng thêm.
