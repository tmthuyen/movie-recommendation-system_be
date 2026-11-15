# V34 — Nâng cấp UI danh sách quản trị admin bằng TanStack Table v9 (pilot Roles → rollout toàn bộ)

## 0. Thông tin plan

| Trường | Giá trị |
|---|---|
| Trạng thái | ✅ Hoàn thành phần code + gate tự động xanh — chờ QA thủ công |
| Người thực hiện | AI agent (Build) + developer review |
| Thời gian | 2026-11-15 |
| Scope | `frontend` (chính) + `backend` (mở filter/sort cho movies/genres/countries/peoples, operator `empty/notempty`) |
| Module ảnh hưởng | `frontend/src/app/(admin-layout)/admin/*`, `frontend/src/apis/*`, `frontend/src/hooks/*`, `frontend/src/components/admin/*`, `frontend/src/shared/utils/*`, `backend/src/common/*`, `backend/src/modules/movies/*` |
| Index | `V34` (đã gộp nội dung V35/V36 cũ; `max(index)=34`, `next_index=35`) |

---

## 1. Bối cảnh & vấn đề

Bộ UI CRUD admin hiện tại (`components/admin/data-table.tsx`, `crud-toolbar.tsx`, `form-dialog.tsx`,
`hooks/tankstack/admin-crud.ts`) bị đánh giá là quá trừu tượng, thiếu linh hoạt và khó mở rộng:

- `DataTable` là mega-component: columns dùng `{ key, header, render }` cố định, hardcode nút Sửa/Xóa,
  không sort, không chọn dòng, nút action `size-9` (< 44px).
- `useCrudPage` chỉ hỗ trợ `page/limit/keyword`; không filter/sort; trộn state bảng + dialog + debounce.
- `CrudToolbar` chỉ có keyword + nút Add; không có slot filter/sort/view-mode/bulk action.
- `CrudFormDialog` chỉ nhận field string, `buildDefaults` stringify mọi thứ, zod resolver cast-heavy.
- `adminRoles` giả lập envelope (`limit: 1000`, `totalPages: 1`) → phân trang không thật.
- Trang Roles hiện tại: keyword không được gửi xuống API, không render phân trang.

Song song, backend đã có hợp đồng tìm kiếm/lọc/sort mạnh (`BaseSearchRequest`) cho nhiều endpoint
(xem `docs/BACKEND.md`), nhưng frontend chưa dùng.

**Mục tiêu:** xây lớp UI danh sách admin mới theo shadcn/ui + TanStack Table v9, có
search / filter nâng cao / sort / pagination (limit + jump + prev/next) / add / edit / delete modal,
hỗ trợ **2 chế độ xem `table` và `grid`** (bắt buộc cho trang Phim), rồi rollout cho toàn bộ trang admin.

**Ngoài phạm vi:** refactor trang public, đổi stack.

> Ghi chú: plan này đã gộp toàn bộ phạm vi rollout (trước đây tách V35) và các bổ sung theo feedback UI (trước đây tách V36). Không tạo plan riêng cho các phần này nữa.

---

## 2. Hợp đồng API đã xác minh (không được bịa)

`GET /api/roles` — theo `backend/src/modules/roles/roles.service.ts` + `BaseSearchRequest`:

| Param | Kiểu | Ghi chú |
|---|---|---|
| `page` | number ≥ 1 | mặc định 1 |
| `limit` | number 1..100 | mặc định 10 |
| `keyword` | string | ILIKE trên `name`, `code` |
| `filters` | string lặp lại | `field:operator:value`, ví dụ `code:contains:ADM` |
| `sort` | string lặp lại | `field:DIR[,field2:DIR2]`, mặc định `createdAt:DESC,id:ASC` |

- Filter field hợp lệ: `id`, `code`. Sort field hợp lệ: `id`, `code`, `name`, `createdAt`.
- Operator: `eq, ne, gt, gte, lt, lte, contains, startsWith, endsWith, in, notin, isnull, isnotnull, empty, notempty, between`.
  `between` dùng `_`; `in`/`notin` dùng dấu phẩy; `isnull`/`isnotnull`/`empty`/`notempty` không cần value.
  `empty`/`notempty` = NULL hoặc chuỗi rỗng (bổ sung ở P3).
- Response envelope: `{ success, statusCode, message, result: Role[], pagination: { total, page, limit, totalPages } }`.
- Mutation: `POST /api/roles` `{ code*, name*, description? }`, `PATCH /api/roles/:id` (partial), `DELETE /api/roles/:id`.

**Bẫy axios:** serializer mặc định của axios phát `filters[]=`, backend không đọc. Phải dùng
`qs.stringify(params, { arrayFormat: 'repeat' })`.

---

## 3. Kiến trúc & hợp đồng component

```
frontend/src/
  shared/utils/search-query.ts          # build filter/sort string, type filter
  hooks/use-debounce.ts                 # debounce generic
  hooks/use-server-table.ts             # state: pagination + sorting + keyword + filters
  components/admin/data-view/
    features.ts                         # tableFeatures({ rowPaginationFeature, rowSortingFeature })
    types.ts                            # DataTableProps, FilterFieldConfig, ActiveFilter...
    data-table.tsx                      # render bảng + sort header + trạng thái loading/empty/error
    data-table-pagination.tsx           # limit select + jump + prev/next
    data-table-toolbar.tsx              # slot trái (search/filter) + slot phải (actions)
    filter-builder.tsx                  # popover nhiều điều kiện, áp dụng hàng loạt
    active-filter-chips.tsx             # chip điều kiện đang áp dụng + xóa
  apis/role.api.ts                      # RoleListParams + qs repeat
  app/(admin-layout)/admin/roles/
    roles-client.tsx                    # orchestration (export RolesClient)
    roles-columns.tsx                   # ColumnDef<AdminTableFeatures, Role>[]
    role-filter-fields.ts               # cấu hình field filter/sort
    role-form-dialog.tsx                # create/edit (đầy đủ field API)
    role-delete-dialog.tsx              # confirm xóa
```

Nguyên tắc để **không lặp lại mega-component**:

1. `DataTable` chỉ nhận `columns` + `data` + state đã kiểm soát (`pagination`, `sorting`) + callback.
   Không biết gì về domain, không tự fetch, không hardcode action.
2. Mọi cấu hình domain (columns, filter field, form) nằm ở file riêng của trang.
3. `useServerTable` là state hook thuần, không phụ thuộc React Query; trang tự gọi API.
4. Filter/sort/pagination là state của trang → đổi view mode (table/grid) vẫn giữ nguyên truy vấn.

---

## 4. Phases & tiến độ

### P0 — Foundation (dùng chung)

- [x] `shared/utils/search-query.ts` + test: `buildFilterString`, `buildSortString`, `createFilterId`,
      `OPERATOR_LABELS`, validate filter theo field type.
- [x] `hooks/use-debounce.ts`.
- [x] `hooks/use-server-table.ts` + test: pagination/sorting/keyword/filters, reset trang khi đổi query,
      `params` memo hóa, `setPageIndex`, `setPageSize`, `clampPageIndex`.
- [x] `components/admin/data-view/features.ts` (TanStack v9 `tableFeatures`).
- [x] `components/admin/data-view/types.ts`.
- [x] `apis/role.api.ts`: `RoleListParams`, `qs` với `arrayFormat: 'repeat'`, trả `ApiPaginatedResponse<Role[]>`.
- [x] `hooks/tankstack/admin.ts`: `adminRoles.list = roleApi.getAll`, xóa `rolesListNoPagination`.

### P1 — Pilot Roles (gate bắt buộc)

- [x] `DataTable` (sort header, skeleton, empty/error, horizontal scroll mobile, a11y `aria-sort`).
- [x] `DataTablePagination` (limit 10/20/50/100, prev/next, nhập số trang, tổng bản ghi).
- [x] `DataTableToolbar` + `FilterBuilder` + `ActiveFilterChips`.
- [x] `roles-columns.tsx` (code/name/description/createdAt/actions; sort đúng whitelist backend).
- [x] `role-filter-fields.ts`.
- [x] `role-form-dialog.tsx` (code/name/description, validate, map lỗi 409 vào field `code`).
- [x] `role-delete-dialog.tsx`.
- [x] `roles-client.tsx` (export `RolesClient`, query + mutation + dialog orchestration).
- [x] Style neumorphism nhẹ: token `--neo-*` + utility `neo-surface` / `neo-surface-inset` / `neo-raised-sm` / `neo-inset`
      trong `src/app/globals.css` (light + dark), giữ border/contrast cho a11y.
- [x] Gate tự động (2026-11-15): `npm run type-check` ✅, `npm run lint` ✅ (0 error),
      `npm run test` ✅ (41 file / 309 test), `npm run build` ✅ (`/admin/roles` static).
- [ ] Gate thủ công: Network không có `filters[]`; filter/sort/pagination chạy; dialog thêm/sửa/xóa;
      375px không tràn ngang; dark mode; keyboard + screen reader.

### P2 — Chế độ xem & rollout toàn bộ trang admin

- [x] `Movies` hỗ trợ 2 chế độ xem `table` / `grid` (`MovieGrid` + `getPosterUrl`) qua `toolbarActions`/`body` của `AdminTablePage` (không cần `DataViewToggle` tổng quát).
- [x] Users (uuid): list + filter/sort/phân trang server-side; form tạo riêng (`email/password/roleIds`) vs sửa (`UpdateProfileDto`); gán vai trò (`PATCH /users/:id/roles`); xoá = khóa (BLOCKED).
- [x] Genres / Countries / Peoples: filter + sort + phân trang thật (bỏ envelope giả lập).
- [x] Interactions: 3 tab Đánh giá / Bình luận / Like-Click, mỗi tab state + query riêng (chỉ mount tab đang xem).
- [x] Roles giữ nguyên từ P1, chuyển sang dùng `AdminTablePage` chung.

### P3 — Backend mở filter/sort (Track B)

- [x] `genres`, `countries`, `peoples`, `movies`: repository dùng `BaseSearchRequest` + `fieldMap`/`sortMap` + tie-break `id ASC`.
- [x] Bỏ default `sort` ở `BaseSearchRequest` (mỗi module tự default: countries `viName:ASC`, còn lại `createdAt:DESC`).
- [x] `movies.service.findAll`/controller nhận `BaseSearchRequest`; cache chỉ cho truy vấn mặc định.
- [x] `movies` field map mở thêm `overview/overviewVi/homepage/posterPath/backdropPath`.
- [x] Thêm operator `empty`/`notempty` (NULL hoặc chuỗi rỗng) trong `SearchUtils`.

### P4 — Bổ sung theo feedback UI (gộp từ V36)

- [x] Cột **ID** cho mọi bảng admin (users uuid truncate, movies, roles, countries, peoples, ratings, comments, interactions).
- [x] Lọc `isnull`/`isnotnull` cho cột nullable; `empty`/`notempty` cho cột text (vd. phim thiếu mô tả/poster).
- [x] Lọc **quan hệ**: movies theo thể loại/quốc gia/người tham gia; users theo vai trò; interaction/rating/comment theo phim — UI hiện **tên**, request gửi **id** (`in`/`notin`).
- [x] Movies: thêm cột mô tả (truncate + tooltip), quốc gia, ngôn ngữ, lượt bình chọn, lượt xem, lượt thích.
- [x] Movies: **Xem chi tiết** (`MovieDetailDialog`) ở bảng và grid, kèm link mở trang phim công khai.

### P5 — Dọn dẹp

- [x] Trang admin không còn import kit cũ (`components/admin/data-table.tsx`, `crud-toolbar.tsx`, `form-dialog.tsx`, `AdminAssignRolesDialog`); kit cũ giữ nguyên cho code legacy, không mở rộng.
- [x] Cập nhật `docs/FRONTEND.md` + `docs/BACKEND.md`.

### P6 — QA & tài liệu

- [x] Gate tự động frontend: `type-check` sạch, `lint` 0 error, `test` 274/274, `build` OK.
- [x] Gate tự động backend: `type-check` sạch, `lint` 0 error, `test` 433/433.
- [ ] QA thủ công trên trình duyệt (375px, dark mode, keyboard, `cursor-pointer`, nút xoá đỏ, toggle bảng/lưới, 3 tab interaction, Network không có `filters[]`).

---

## 5. Rollout matrix

| Trang | Endpoint | Backend | Ghi chú |
|---|---|---|---|
| Roles | `GET /api/roles` | ✅ | P1 (pilot) |
| Users | `GET /api/users` | ✅ | Track A |
| Ratings | `GET /api/ratings` | ✅ | Track A (tab Đánh giá) |
| Comments | `GET /api/comments` | ✅ | Track A (tab Bình luận) |
| Interactions | `GET /api/interactions` | ✅ | Track A (tab Like/Click, khóa `type:in:like,click`) |
| Movies | `GET /api/movies` | ✅ (đã mở filter/sort) | Track B, table + grid |
| Genres | `GET /api/genres` | ✅ (đã mở filter/sort) | Track B |
| Countries | `GET /api/countries` | ✅ (đã mở filter/sort) | Track B |
| Peoples | `GET /api/peoples` | ✅ (đã mở filter/sort) | Track B |

---

## 6. Rủi ro & giảm thiểu

| Rủi ro | Giảm thiểu |
|---|---|
| TanStack v9 API khác v8 | Dùng đúng `useTable` + `tableFeatures`; tham chiếu skill trong `node_modules/@tanstack/react-table/skills`. |
| `filters[]` bị backend bỏ qua | `qs.stringify` với `arrayFormat: 'repeat'` + test. |
| Neumorphism làm giảm tương phản | Giữ border + text token hiện có; shadow chỉ ở container; kiểm tra dark mode. |
| Backend casing bug (`admin` vs `ADMIN`) | Frontend uppercase `code` trước khi submit; plan backend fix riêng. |
| Đổi trang khi filter làm rỗng dữ liệu | `clampPageIndex` tự lùi trang cuối. |
| Bảng tràn ngang trên mobile | `overflow-x-auto` của shadcn Table + cột mô tả giới hạn `max-w`. |

---

## 7. QA checklist (gate P1)

- [ ] Network: request `GET /api/roles?page=1&limit=10&...` không có `filters[]=`.
- [ ] Search debounce 350ms, reset về trang 1.
- [ ] Filter `code contains`, `id between`, `code in` hoạt động; chip hiển thị và xóa được.
- [ ] Sort `code/name/createdAt` ASC/DESC; header có `aria-sort`.
- [ ] Pagination: limit 2/5/10/20/50/100, dải số trang, tổng bản ghi đúng.
- [ ] Thêm vai trò: validate rỗng, trùng mã (409) hiện lỗi tại field `code`.
- [ ] Sửa vai trò: prefill đúng; xóa: confirm + đóng sau khi thành công.
- [ ] 375px: không tràn ngang trang (bảng scroll trong khung), touch target ≥ 44px.
- [ ] Dark mode: container/input/chip/popover đọc được, không mất viền.
- [ ] Keyboard: Tab tới search/filter/sort/pagination/action; Esc đóng popover/dialog.
- [ ] `npm run type-check && npm run lint && npm run test && npm run build` xanh.

---

## 8. Definition of Done

- Toàn bộ trang admin dùng 100% component mới, không import kit CRUD cũ.
- Có cột ID, lọc null/rỗng, lọc quan hệ bằng tên → gửi id; movies có xem chi tiết.
- Không còn `rolesListNoPagination`, không còn `roleApi.getAll()` không tham số.
- Type-check/lint/test/build xanh; QA checklist pass.
- Plan này được cập nhật trạng thái + checklist (không tách plan mới cho cùng phạm vi).

---

## 9. Nhật ký triển khai P0/P1 (2026-11-15)

### File mới

| File | Vai trò |
|---|---|
| `frontend/src/shared/utils/search-query.ts` | Dựng `filters`/`sort`, validate điều kiện, nhãn chip. |
| `frontend/src/hooks/use-debounce.ts` | Debounce keyword. |
| `frontend/src/hooks/use-server-table.ts` | State pagination/sort/keyword/filters → `params` cho API. |
| `frontend/src/components/admin/data-view/features.ts` | `tableFeatures({ rowSortingFeature, rowPaginationFeature })`. |
| `frontend/src/components/admin/data-view/types.ts` | Props/contract của lớp data-view. |
| `frontend/src/components/admin/data-view/data-table.tsx` | Bảng TanStack v9: sort header, skeleton, empty, error, cuộn ngang. |
| `frontend/src/components/admin/data-view/data-table-pagination.tsx` | Limit 2/5/10/20/50/100 + dải số trang (`DataPagination`), tổng bản ghi. |
| `frontend/src/components/admin/data-view/data-table-toolbar.tsx` | Slot trái/phải. |
| `frontend/src/components/admin/data-view/filter-builder.tsx` | Popover nhiều điều kiện (AND) + validate. |
| `frontend/src/components/admin/data-view/active-filter-chips.tsx` | Chip điều kiện đang áp dụng. |
| `frontend/src/app/(admin-layout)/admin/roles/role-filter-fields.ts` | Field lọc `code`, `id`. |
| `frontend/src/app/(admin-layout)/admin/roles/roles-columns.tsx` | Cột code/name/description/createdAt/actions. |
| `frontend/src/app/(admin-layout)/admin/roles/role-form-dialog.tsx` | Thêm/sửa (code/name/description), map 409 → lỗi field `code`. |
| `frontend/src/app/(admin-layout)/admin/roles/role-delete-dialog.tsx` | Confirm xóa. |

### File sửa

| File | Thay đổi |
|---|---|
| `frontend/src/app/(admin-layout)/admin/roles/roles-client.tsx` | Viết lại hoàn toàn, export `RolesClient`. |
| `frontend/src/apis/role.api.ts` | `RoleListParams`, `qs` `arrayFormat: 'repeat'`, trả `ApiPaginatedResponse<Role[]>`. |
| `frontend/src/hooks/tankstack/admin.ts` | `adminRoles.list = roleApi.getAll`; xóa `rolesListNoPagination`. |
| `frontend/src/app/globals.css` | Token `--neo-*` (light/dark) + utility `neo-surface`, `neo-surface-inset`, `neo-raised-sm`, `neo-inset`. |
| `docs/plans/PLAN_INDEX.md` | Thêm V34, `next_index = 35`. |

### Ghi chú

- `DataTable` không biết domain, không fetch, không hardcode action → tránh lặp lại mega-component.
- `useServerTable` reset trang 1 ngay trong setter (keyword/filters/sorting) thay vì `useEffect` để tránh
  cảnh báo `react-hooks/set-state-in-effect`.
- Form dialog dùng `errors.root` cho lỗi server chung và `errors.code` cho 409.
- `code` được uppercase trước khi submit để giảm ảnh hưởng bug casing của backend.
- Theo yêu cầu của developer: **không viết test cho code mới**. Các test nháp của lớp data-view
  (`search-query`, `use-server-table`, `role.api`, `DataTable`, `RolesClient`) đã được xoá; chỉ giữ
  test cũ và sửa nếu hành vi thay đổi.
- Chưa chạy QA thủ công (cần backend + tài khoản ADMIN); P2 chỉ bắt đầu sau khi QA P1 pass.

### 9.1 Vòng sửa theo feedback (2026-11-15)

| Vấn đề | Cách sửa |
|---|---|
| Thiếu `cursor-pointer` ở UI click được (đặc biệt mũi tên sort asc/desc) | Thêm class `cursor-pointer` trực tiếp vào sort header button, chip xoá filter, action buttons; đổi `cursor-default` → `cursor-pointer` trong `ui/select.tsx`, `ui/dropdown-menu.tsx`, `ui/command.tsx`. **Không sửa CSS cũ** trong `globals.css`. |
| Nút xoá chưa phải danger/đỏ | Cột actions: nút xoá luôn `text-destructive` + `hover:bg-destructive/10`; modal xoá dùng `AlertDialogAction variant="destructive"` (trước đó `bg-destructive` bị class `bg-primary` của `Button` đè do `Slot` nối className). |
| Phân trang dùng ô nhập số trang | `DataTablePagination` dùng lại `DataPagination` (dải số trang 1 … current ±1 … N) như các trang khác; thêm prop `showSummary` để ẩn dòng "Trang x / y" khi nhúng. Limit options: 2, 5, 10, 20, 50, 100. |

### 9.2 Rollout toàn bộ trang admin (gộp nội dung V35 cũ)

| Hạng mục | Kết quả |
|---|---|
| Hạ tầng dùng chung | `shared/utils/list-params.ts`; `admin-form-schema.ts`, `multi-select-field.tsx`, `admin-form-dialog.tsx`, `admin-delete-dialog.tsx`, `admin-table-page.tsx` (+ `toolbarActions`/`body` cho grid view). |
| Hook & API | `admin-crud.ts` nhận full `page/limit/keyword/filters/sort` + `createSearchList`; toàn bộ `apis/*` dùng `SearchListParams` + `withListParams`; test API cũ cập nhật sang URL `qs` (`arrayFormat: 'repeat'`). |
| Backend Track B | `genres/countries/peoples/movies` nhận `BaseSearchRequest` + `FIELD_MAP`/`SORT_MAP` + `id ASC`; bỏ default `sort` ở DTO; `movies.findAll` cache chỉ cho truy vấn mặc định. |
| Users | `users-columns.tsx`, `user-filter-fields.ts`, `users-client.tsx`; form tạo có `roleIds`, sửa theo `UpdateProfileDto`, dialog gán vai trò, xoá = khóa. |
| Genres / Countries / Peoples | 3 trang cùng khuôn; form đúng DTO (`region` bắt buộc, `code ≤ 2`). |
| Movies | Filter/sort + `movie-grid.tsx`/`movie-poster.ts` (TMDB), toggle bảng/lưới, form multiselect genre/people + select country (options `limit=100`); sửa bug backend `entity.country` → `entity.countries`. |
| Interactions | 3 tab riêng (`RatingTab`/`CommentTab`/`LikeClickTab`), mỗi tab `useServerTable` + hook read-only + dialog xoá destructive; `mapStatus` bổ sung `BLOCKED`. |
| Gate | Frontend 274 test, lint 0 error, build OK; backend 433 test, lint 0 error. Fix lint `admin-form-dialog` (không ghi `ref.current` khi render). |

### 9.3 Bổ sung theo feedback UI (gộp nội dung V36 cũ)

| Vấn đề | Cách sửa |
|---|---|
| Thiếu lọc null/rỗng | Backend thêm operator `empty`/`notempty`; expose `isnull/isnotnull` cho cột nullable và `empty/notempty` cho cột text ở movies/users/countries/peoples/genres/ratings/comments/interactions. |
| Thiếu cột ID | Thêm cột ID cho countries/peoples/users/movies/roles/ratings/comments/interactions (genres đã có). |
| Không lọc được quan hệ | Movies: thể loại/quốc gia/người; Users: vai trò; Interaction 3 tab: phim — `FilterBuilder` render danh sách chọn nhiều inline (tìm kiếm, ≥44px), UI hiện tên nhưng gửi id qua `in/notin`. |
| Movies thiếu cột/count | Thêm mô tả (truncate), quốc gia, ngôn ngữ, lượt bình chọn, lượt xem, lượt thích (`bigint` → `Number()`). |
| Chưa xem chi tiết phim | `MovieDetailDialog` + nút `Eye` (bảng & grid), link `/movies/{id}` tab mới. |
| Tab Like/Click hiện cả rating/comment | `useServerTable` thêm `lockedFilters`; tab dùng `['type:in:like,click']`. |
| Copy dialog xoá sai nghiệp vụ | Bỏ câu "tính lại điểm trung bình"/"xoá reply" (backend chỉ xoá bản ghi). |
| Gate | Frontend: type-check/lint/test/build xanh (274 test); backend: 433 test, lint 0 error. |

