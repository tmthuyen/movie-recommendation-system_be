# V13 — Tối ưu quản lý UI & tái sử dụng component

- **Trạng thái**: Đang thực hiện — Phase 1 (UI kit + refactor) triển khai xong, Phase 2 (dọn trùng lặp legacy) triển khai xong
- **Người thực hiện**: AI Agent
- **Thời gian**: 2026-10-17
- **Phạm vi**: `frontend/src/components/common/*` và refactor các trang đang lặp markup. **Không sửa backend/ai-service**, không thêm thư viện UI mới.
- **Tài liệu liên quan**: [../FRONTEND.md](../FRONTEND.md), [../FRONTEND_RULES.md](../FRONTEND_RULES.md), [V11_frontend_ui-roadmap.md](./V11_frontend_ui-roadmap.md)

## Bối cảnh / vấn đề

Yêu cầu: "tối ưu quản lý UI và tái sử dụng code — mỗi domain tự code lại là hỏng".

Rà soát hiện trạng phát hiện:

| # | Vấn đề | Bằng chứng |
|---|---|---|
| 1 | Block "tiêu đề trang" (`text-3xl font-extrabold` + mô tả) **lặp ở 12 file** | 7 trang admin + `dashboard` + `profile` + `notification` + `(home)` + `movies` |
| 2 | **3 kiểu phân trang** khác nhau, không dùng chung | `common/PaginatedView.tsx` (client), `common/paginations/Pagination.tsx` (`PaginatedTable`, envelope **sai**), `movie/movie-pagination.tsx` (mới, Phase 1) |
| 3 | Không có component chung cho **empty state / error state** | `movie-list.tsx` tự viết; `PaginatedTable` tự viết `ErrorFetch` |
| 4 | **2 component modal trùng chức năng** | `common/Modal.tsx` và `common/AppModal.tsx` (markup gần như y hệt) |
| 5 | `PaginatedTable` đọc **sai envelope** (`statusCode/message/data.data.pagination.totalItems`) — vi phạm `FRONTEND_RULES` §1 | `common/paginations/Pagination.tsx` |
| 6 | 3 skeleton rời rạc cho danh sách | `SkeletonLoader.tsx`, `MovieGridSkeleton`, `AdminSkeletonLayout` |

## Mục tiêu

- Tạo một **UI kit dùng chung** trong `src/components/common/` để mọi domain tái sử dụng, không tự viết lại.
- Xoá các đoạn markup trùng lặp (đặc biệt block tiêu đề trang và phân trang).
- Chuẩn hoá phân trang theo envelope backend (`total/page/limit/totalPages`).
- Không đổi hành vi/route; giữ nguyên design token + typography đang dùng.

## Module liên quan

| Module | Loại | File/thư mục chính |
|---|---|---|
| UI kit dùng chung | Tạo | `frontend/src/components/common/{PageHeader,SectionHeader,EmptyState,ErrorState,DataPagination}.tsx` |
| Domain phim (Phase 1 V11) | Sửa/Xoá | `frontend/src/components/movie/{movie-list,latest-movies}.tsx`, xoá `movie/movie-pagination.tsx` |
| Trang lặp header | Sửa | `frontend/src/app/**/*page.tsx` (12 file) |
| Phân trang legacy | Sửa/Xoá | `frontend/src/components/common/paginations/Pagination.tsx`, `common/PaginatedView.tsx`, xoá `common/Modal.tsx` |
| Docs | Sửa | `docs/FRONTEND.md` |

---

## Phase 1 — UI kit dùng chung + áp dụng cho domain phim

**Mục tiêu**: Có các primitive dùng chung, domain phim dùng lại thay vì tự viết.

- [x] Tạo `PageHeader.tsx` (title + description + slot actions) — thay block tiêu đề lặp
- [x] Tạo `SectionHeader.tsx` (title + description + action) — dùng cho các mục trong trang
- [x] Tạo `EmptyState.tsx` (icon + title + description + action tùy chọn)
- [x] Tạo `ErrorState.tsx` (icon + title + description + nút "Thử lại" tùy chọn)
- [x] Tạo `DataPagination.tsx` (presentational: `page/totalPages/total/onPageChange`, touch target ≥44px, dãy số trang + ellipsis)
- [x] Refactor `movie-list.tsx` dùng `ErrorState`/`EmptyState`/`DataPagination`
- [x] Refactor `latest-movies.tsx` dùng `SectionHeader`
- [x] Xoá `movie/movie-pagination.tsx` (đã thay bằng `DataPagination` dùng chung)
- [x] `movies/page.tsx` + `(home)/page.tsx` dùng `PageHeader`

**File tạo**: `src/components/common/{PageHeader,SectionHeader,EmptyState,ErrorState,DataPagination}.tsx`
**File sửa**: `src/components/movie/{movie-list,latest-movies}.tsx`, `src/app/(main)/movies/page.tsx`, `src/app/(main)/(home)/page.tsx`
**File xoá**: `src/components/movie/movie-pagination.tsx`

---

## Phase 2 — Dọn trùng lặp legacy + refactor toàn bộ trang

**Mục tiêu**: Không còn markup/component trùng lặp; mọi trang dùng UI kit.

- [x] Refactor block tiêu đề trang → `PageHeader` ở 12 file (7 admin + dashboard + profile + notification, đã gồm cả 2 trang Phase 1)
- [x] Sửa `common/paginations/Pagination.tsx` (`PaginatedTable`): dùng envelope đúng (`result` + `pagination`) và tái sử dụng `DataPagination`/`EmptyState`/`ErrorState`
- [x] Refactor `common/PaginatedView.tsx` (client-side) dùng `DataPagination` để không lặp markup nút phân trang
- [x] Xoá `common/Modal.tsx` (trùng hoàn toàn với `AppModal.tsx`, không nơi nào import)
- [x] Cập nhật `docs/FRONTEND.md`: thêm mục "UI kit dùng chung" liệt kê các component common

**File sửa**: 12 `page.tsx`, `src/components/common/paginations/Pagination.tsx`, `src/components/common/PaginatedView.tsx`, `docs/FRONTEND.md`
**File xoá**: `src/components/common/Modal.tsx`

---

## Ghi chú & phạm vi không làm

- **Không** sửa blocker baseline (lint/build) — theo quyết định của developer: `eslint.config.mjs` thiếu plugin trong `package.json`; `src/app/api/auth/signup/route.ts` trỏ `@/infrastructure/*`; `ui/{drawer,calendar}.tsx`, `common/ThemeToggle.tsx` lỗi sẵn có; `auth/login` thiếu `Suspense`. (xem `V11` — "Ghi chú triển khai Phase 1")
- **Không** xoá `SkeletonLoader.tsx` / `AdminSkeletonLayout.tsx` (vẫn là nguồn skeleton hợp lệ, có thể dùng ở Phase 2/5).
- **Không** đổi tên `src/hooks/tankstack/` hay route group.
- Kiểm chứng: `npx tsc --noEmit` không phát sinh lỗi mới (giữ đúng tập lỗi baseline có sẵn).

## Định nghĩa hoàn thành (DoD)

- [x] Mọi component UI dùng chung nằm ở `src/components/common/`, có prop type rõ ràng, tiếng Việt cho text mặc định
- [x] Block tiêu đề trang chỉ còn **một** định nghĩa (`PageHeader`)
- [x] Phân trang chỉ còn **một** cách render control (`DataPagination`), mọi biến thể (server/client) tái sử dụng nó
- [x] Empty/error state chỉ còn **một** định nghĩa mỗi loại
- [x] `tsc --noEmit` không có lỗi mới so với baseline
- [x] Không commit/push
