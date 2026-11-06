# V26 — Frontend: Hoàn chỉnh tìm kiếm & bộ lọc phim (DB + URL sync)

| Thuộc tính | Giá trị |
|---|---|
| **Trạng thái** | ✅ Hoàn thành (2026-11-07) — QA responsive thủ công do dev xác nhận |
| **Người thực hiện** | Agent + developer xác nhận quyết định |
| **Thời gian** | 2026-11-06 → 2026-11-07 |
| **Module** | `frontend` (movies page, filters, hooks/api/types/utils), `backend` (`movies.service.searchFromDb` semantics + count fix) |
| **Phạm vi** | Nối bộ lọc/tìm kiếm trang `/movies` vào `GET /api/movies/search` (lọc DB, đúng pagination/total), đồng bộ filter ↔ URL (không render/call lặp), UI bộ lọc đầy đủ/responsive/modern, component tái sử dụng. **Không** làm load-more/cursor (V27). |

## 1. Mục tiêu

- Tìm kiếm + lọc phim lấy dữ liệu **từ database** qua `GET /api/movies/search`.
- Bộ lọc áp dụng thì **URL đổi theo** (shareable, back/forward đúng), URL là nguồn trạng thái; **không** gây render/fetch liên tục do vòng lặp URL ↔ state.
- UI bộ lọc thân thiện, hiện đại, responsive (mobile/desktop), component rõ ràng, tái sử dụng.

## 2. Quyết định đã chốt

- [x] **Incomplete movies**: `/movies/search` **có** hiện phim thiếu poster/overview/... (bỏ điều kiện NOT NULL).
- [x] **Sort mapping**: `popular` = `viewCount:DESC`, `newest` = `releaseDate:DESC`, `rating` = `voteAverage:DESC`.
- [x] **Genre/Country**: `genreIds`/`countryIds` là **mảng number** (multi-select).
- [x] **Year filter**: có `releaseYearFrom`/`releaseYearTo`.
- [x] **Số plan**: V26 = search/filter; load-more/cursor = **V27**.

## 3. Contract API `/api/movies/search`

`GET /api/movies/search` — Public. Params: `page, limit, keyword, sort` (default `releaseDate:DESC`, whitelist `releaseDate|voteAverage|viewCount|likeCount`), `genreIds[]`, `countryIds[]` (repeat), `releaseYearFrom`, `releaseYearTo`. Response: envelope + `result[]` + `pagination`. `qs arrayFormat:'repeat'`.

## 4. Thay đổi chính

### Backend
- `searchFromDb`: không loại phim thiếu field; filter `genreIds/countryIds` bằng subquery (`movie_genres`/`movie_countries`) để tránh nhân dòng, `total` đếm trên query không join M:N; vẫn join select genres/countries/people cho kết quả.

### Frontend
- URL = single source of truth (`useMovieSearchParams` + parse/build utils). `router.replace(...,{scroll:false})` chỉ khi query chuẩn hoá thay đổi. **Bộ lọc dùng draft + nút "Áp dụng"**: mọi thay đổi field (keyword/genre/country/year/sort) chỉ cập nhật state local, **không** ghi URL; bấm "Áp dụng" (hoặc Enter ở ô tìm kiếm) mới ghi URL → React Query fetch **1 lần**. `useMemo` hoá params → React Query.
- `MovieList` dùng `useSearchMovies` (DB), bỏ lọc/sort client-side.
- UI: bar responsive + Drawer mobile (`vaul`), multi-select genre/country, year range, sort, chip filter active (removable), component tái sử dụng.

## 5. Phases

- [x] P0 — Plan/index + chốt quyết định
- [x] P1 — Backend: **bỏ khỏi phạm vi** (giữ nguyên `movies.service` theo yêu cầu developer)
- [x] P2 — FE utils/hook: parse/build URL, no-loop replace, debounce keyword
- [x] P3 — FE UI: filter components responsive/modern, multi-select, year, chips
- [x] P4 — Nối MovieList/page + verify
- [x] P5 — Lint/typecheck/test
- [x] P6 — Responsive toolbar (grid, đồng nhất `h-11`) + slider năm 2 đầu có nhãn số, đồng bộ 2 Select ↔ slider ↔ URL
- [x] P7 — Chuyển bộ lọc sang **draft + nút "Áp dụng"** (không auto-call API khi đổi field), nút Áp dụng mobile, chip phản ánh draft

## 6. Rủi ro

- Loop URL↔state: guard bằng so sánh query + handler-only navigation.
- Next.js 16 `useSearchParams` (client, cần Suspense khi prerender).
- Cache V25 key đã bao gồm filter hash → không đổi. Invalidate list version vẫn đúng khi CRUD phim.

## 7. Ghi chú triển khai (2026-11-07)

- **Slider năm** (`frontend/src/components/ui/slider.tsx`): mở rộng shadcn `Slider` với 2 prop optional `thumbLabels` + `thumbAriaLabels` (backwards-compatible). Nhãn năm nằm trong từng thumb nên bám theo khi kéo, có `pointer-events-none`; pseudo `after:-inset-3.5` mở vùng chạm ~44px.
- **`MovieYearRange`**: state `draft` cập nhật realtime khi kéo (`onValueChange`), chỉ ghi URL khi thả (`onValueCommit`) → tránh spam `router.replace`. 2 Select và slider đồng bộ 2 chiều; chuẩn hoá `from ≤ to`; chạm biên thì bỏ param (URL gọn). `useEffect` sync lại khi props đổi (back/forward, xoá chip).
- **Toolbar desktop**: CSS grid `minmax(0,1fr) 180 180 190 auto` + hàng năm full-width; mọi control `h-11` (fix specificity bằng `data-[size=default]:h-11`), không còn `flex-wrap` gây lệch hàng. Nút "Xoá lọc" luôn render (disabled khi không có filter) để không layout shift.
- **Mobile**: search + nút mở drawer cùng hàng; drawer dùng layout `stack`.
- **Test**: `MovieYearRange.test.tsx` (10 case: helper thuần, aria-valuenow, keyboard commit, sync props, layout stack).
- **P7 — Draft + nút "Áp dụng" (2026-11-07)**: `MovieFilters` giữ `draft` (khởi tạo từ URL, sync lại khi URL đổi do back/forward/xoá chip/đổi trang). Tất cả control (`MovieSearchInput`, multi-select, year range, sort, chip) chỉ `patchDraft` — **không** ghi URL. `applyDraft` gọi `updateFilters(draft)` → `router.replace` 1 lần → 1 fetch. Nút "Áp dụng" desktop + icon ✓ mobile (disabled khi `isDirty=false`), drawer mobile "Xem kết quả" = apply + đóng, "Đặt lại" = reset draft (chưa apply). `MovieSearchInput` bỏ debounce, thành controlled + Enter = apply. Test: `MovieSearchInput.test.tsx` (4 case). *Ngoại lệ có chủ đích theo yêu cầu developer*: thay rule debounce 300–500ms (`FRONTEND_RULES` §input tìm kiếm) bằng nút xác nhận — không gọi API khi gõ/đổi field.
- **Đã verify**: `npm run type-check`, `npm run lint` (0 error), `npx vitest run` (260 test pass), `npm run build`.
- **P8 — Đổi multi-select genre/country sang kiểu `UserProfileForm` (2026-11-07)**: `MovieMultiSelect` giữ nguyên API (không xoá file) nhưng render bằng `InputMultiSelect` + `InputMultiSelectTrigger` (`components/extend-ui/input-multiselect.tsx`) — trigger hiển thị badge, dropdown có ô tìm kiếm + "Chọn tất cả" / "Xóa" / "Đóng". Bổ sung optional (backwards-compatible) cho `InputMultiSelectTrigger`: `singleLine` (toolbar 1 hàng, badge dài truncate), `aria-label`/`title`, `aria-haspopup`/`aria-expanded`; `InputMultiSelect` nhận `emptyText` và đồng bộ `value` từ bên ngoài bằng so sánh nội dung (tránh loop khi parent truyền array mới mỗi render). Toolbar inline dùng `truncateCount={1}` + `singleLine`; drawer mobile dùng `truncateCount={3}` (badge xuống dòng). Grid toolbar đổi `180 180` cho genre/country để badge dễ đọc hơn.
