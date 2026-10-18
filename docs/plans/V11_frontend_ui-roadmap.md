# V11 — Frontend UI Roadmap (User-facing + Admin CRUD)

- **Trạng thái**: Đang thực hiện — **Phase 0 (baseline) xong ở mức môi trường**, **Phase 1 (nền tảng + trang chủ + danh sách phim + movie card UX) hoàn thành → đã đóng**, **Phase 2 (chi tiết phim `/movies/[id]`) hoàn thành → đã đóng**, **Phase 1.5 (base layout shell responsive: fix scroll ngang, bottom nav, header user dropdown, footer site info + trang about/contact/privacy/terms) hoàn thành → đã đóng**, **Phase 3 (tương tác cá nhân: `/my-history`, `/my-favorites`, dislike ở chi tiết, nav cá nhân, guard đăng nhập) hoàn thành → đã đóng**, **Phase 5 (admin CRUD + dashboard: kit data-table/form-dialog, CRUD movies/genres/countries/people/users/roles, trang interaction 3 tab, dashboard recharts) hoàn thành → đã đóng**; còn lại **Phase 4 (semantic search — ⚠ đang bị chặn bởi ai-service lỗi 500 + CORS)**. Lưu ý: DoD `lint`/`build` đang bị chặn bởi lỗi baseline có sẵn trong repo (xem "Ghi chú triển khai Phase 1").
- **Người thực hiện**: AI Agent
- **Thời gian**: 2026-10-17
- **Phạm vi**: `frontend/` — xây dựng toàn bộ giao diện user-facing (trang chủ, danh sách phim, chi tiết phim, tương tác cá nhân, semantic search) và khu vực admin CRUD (movies/genres/countries/peoples/users/roles/interaction + dashboard). Không sửa backend/ai-service.
- **Tài liệu liên quan**: [../FRONTEND.md](../FRONTEND.md), [../FRONTEND_RULES.md](../FRONTEND_RULES.md)

## Module liên quan

| Module | Loại | File/thư mục chính |
|---|---|---|
| API layer | Sửa/Tạo | `frontend/src/apis/{movie,country}.api.ts` |
| Types | Tạo | `frontend/src/shared/types/movie.types.ts` |
| React Query hooks | Tạo/Sửa | `frontend/src/hooks/tankstack/{useMovie,useCountry,useInteraction}.ts` |
| Zustand store | Sửa | `frontend/src/stores/movie-filter.store.ts` |
| Components phim | Tạo | `frontend/src/components/movie/*` |
| Routes user | Sửa/Tạo | `frontend/src/app/(main)/{movies,(home),my-history,my-favorites,search}/` |
| Routes admin | Sửa | `frontend/src/app/(admin-layout)/admin/*`, `dashboard/page.tsx` |
| Navigation | Sửa | `frontend/src/components/sidebar/{nav-main,nav-user}.tsx` |
| Layout/Auth | Sửa | `frontend/src/components/layout/UserLayout.tsx`, `src/components/auth/RequireRole.tsx` |
| Backend (tham chiếu, không sửa) | — | `backend/` API `/api/movies`, `/api/ratings`, `/api/comments`, `/api/interactions` |
| ai-service (phụ thuộc) | — | `ai-service/` endpoint `/search`, `/hybrid`, `/similar` |

---

## Phase 0 — Chuẩn bị (baseline)

**Mục tiêu**: Cài dependencies và xác lập baseline build/lint trước khi viết code.

- [ ] Chạy `npm install` trong `frontend/` (node_modules hiện chưa có)
- [ ] Chạy `npm run lint` — ghi nhận danh sách warning/error hiện có làm baseline
- [ ] Chạy `npm run build` — xác nhận build pass trước khi thay đổi
- [ ] Kiểm tra backend chạy ở `http://localhost:8081/api` và CORS cho `http://localhost:3002`
- [ ] Kiểm tra `frontend/.env` có `NEXT_PUBLIC_API_BASE_URL=http://localhost:8081/api`
- [ ] Chạy `npm run dev`, mở `http://localhost:3002/auth/login` xác nhận auth thật hoạt động

- **API dùng**: `POST /api/auth/login`, `GET /api/auth/me`
- **File dự kiến**: không sửa file nguồn (chỉ `node_modules/`)

---

## Phase 1 — Nền tảng + Trang chủ + Danh sách phim

**Mục tiêu**: Có tầng types/api/hooks cho Movie–Country và hai trang công khai đầu tiên (`/` và `/movies`) hiển thị dữ liệu thật, hỗ trợ guest.

- [x] Tạo `frontend/src/shared/types/movie.types.ts` (`Movie`, `MovieDetail`, `MovieQuery`, `Country`, `MovieListResult` + page/limit/keyword)
- [x] Tạo `frontend/src/apis/movie.api.ts` → `movieApi.getAll/getById/incrementView`
- [x] Tạo `frontend/src/apis/country.api.ts` → `countryApi.getAll` (+ `getById`)
- [x] Tạo `frontend/src/hooks/tankstack/useMovie.ts` → `useGetMovies` (`queryKey: ['movies', page, limit, keyword]`, staleTime 5 phút), `useGetMovieDetail` (`['movie', id]`), `useIncrementView`
- [x] Tạo `frontend/src/hooks/tankstack/useCountry.ts` → `useGetCountries` (`['countries']`, staleTime 5 phút)
- [x] Tạo `frontend/src/stores/movie-filter.store.ts` → điền state filter (keyword, genreId, countryId, sort, page, limit + `setFilter`, `resetFilter`); lưu ý filter genre/country hiện **chỉ dùng client-side**
- [x] Tạo `frontend/src/components/movie/movie-card.tsx` (poster `aspect-[2/3]`, title, năm, rating)
- [x] Tạo `frontend/src/components/movie/movie-grid.tsx` (grid `grid-cols-2 md:grid-cols-4 lg:grid-cols-6` + `MovieGridSkeleton`)
- [x] Tạo `frontend/src/components/movie/movie-filters.tsx` (input keyword **debounce ~400ms** + sort/lọc thể loại–quốc gia **client-side**, vì `GET /api/movies` hiện chỉ nhận `page/limit/keyword`)
- [x] Tạo `frontend/src/components/movie/movie-pagination.tsx` (đọc `pagination` từ envelope: `total/page/limit/totalPages`)
- [x] Tạo trang danh sách `frontend/src/app/(main)/movies/page.tsx` + `loading.tsx` (skeleton) — kèm `movie-list.tsx` (client) và seed filter từ `?genre=`/`?country=`
- [x] Làm lại trang chủ `frontend/src/app/(main)/(home)/page.tsx` (hero + phim mới nhất + danh sách link thể loại) — dùng component `latest-movies.tsx`
- [x] Thêm mục điều hướng cho user (Trang chủ, Phim) vào `frontend/src/components/sidebar/nav-main.tsx` / `nav-user.tsx` (icon lucide)
- [x] Xử lý trạng thái **guest** (không crash/không trắng trang khi chưa đăng nhập; ẩn mục cần auth) — thực hiện ở `RoleLayout.tsx` + `(main)/layout.tsx` (guest → `UserLayout`), `UserLayout.tsx` (dọn import thừa), `nav-main.tsx`/`nav-user.tsx` (ẩn mục cần auth, hiện nút Đăng nhập)

### Mở rộng Phase 1 — Movie card UX (hover overlay + actions) + hàng ngang (2026-10-17)

- [x] Sửa `movie-card.tsx`: bỏ khoảng trắng trên poster, **overlay khi hover/focus** hiện thông tin (thể loại, mô tả, năm, lượt xem), stretched-link click toàn card → `/movies/[id]`, touch-friendly (ẩn overlay trên thiết bị `hover: none`)
- [x] Tạo `components/movie/movie-actions.tsx` — nút toggle like/favorite/watchlist ngay trên card (icon lucide, `aria-pressed`, touch target ≥36px); **rút sớm từ Phase 3**
- [x] Tạo `apis/interaction.api.ts` (`toggle`, `getMyHistory`, `getMyFavorites`) + `hooks/tankstack/useInteraction.ts` (`useToggleInteraction` optimistic + `useMyFavorites`) — **rút sớm từ Phase 3**
- [x] Tạo `components/movie/movie-row.tsx` + `MovieRowSkeleton` — **1 hàng ngang** responsive (2 phim mobile → 6 phim desktop), ẩn scrollbar, scroll-snap, nút cuộn trái/phải (desktop)
- [x] `globals.css` thêm utility `no-scrollbar` (Tailwind v4 `@utility`)
- [x] Trang chủ: các section danh sách (Dành cho bạn, Mới nhất, Xem nhiều, Đánh giá cao, Sắp ra mắt) chuyển sang `MovieRow`; bỏ khoảng trắng của `Card` (`py-6`) ở hero

### Ghi chú triển khai Phase 1 (2026-10-17)

- **Lệch nhỏ so với plan**: `useGetMovies` dùng `queryKey: ['movies', page, limit, keyword]` (primitive) thay vì `['movies', params]` để tuân thủ `FRONTEND_RULES.md` (không đặt object trong queryKey).
- **Mở rộng nhỏ ngoài danh sách file dự kiến**: `genreApi.getAll(params)` + `useGenre.useGetAll(params)` thêm tham số `page/limit/keyword` (tương thích ngược, mặc định giữ nguyên) để lấy đủ thể loại cho dropdown lọc; thêm `src/shared/utils/movie.ts` (dựng URL ảnh TMDB + helper title/năm); `next.config.ts` thêm `images.remotePatterns` cho `image.tmdb.org`; thêm env `NEXT_PUBLIC_TMDB_IMAGE_BASE_URL`.
- **Chuẩn hoá `Pagination`** (rủi ro #8) đã xử lý: `api.types.ts` → `{ total, page, limit, totalPages }` khớp payload backend.
- **Lưu ý chất lượng dữ liệu**: `similar`/`trending`/`sort` phía server chưa có nên sort "Đánh giá cao"/"Xem nhiều" và lọc thể loại–quốc gia được xử lý **client-side trong từng trang** (backend chỉ hỗ trợ `page/limit/keyword`).
- **Chặn DoD (baseline có sẵn, KHÔNG do Phase 1)**: `npm run lint` lỗi do `eslint.config.mjs` import các plugin chưa có trong `package.json` (`eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `@typescript-eslint/*`); `npm run build` lỗi do file cũ `src/app/api/auth/signup/route.ts` trỏ module không tồn tại `@/infrastructure/*`, plus lỗi type sẵn có ở `src/components/ui/{drawer,calendar}.tsx`, `src/components/common/ThemeToggle.tsx`, và `/auth/login` dùng `useSearchParams` thiếu `Suspense`. Đã xác minh code Phase 1 typecheck sạch (`tsc --noEmit` không phát sinh lỗi mới) và build thành công khi tạm vô hiệu hoá các blocker có sẵn này (đã khôi phục nguyên trạng).

- **API dùng**: `GET /api/movies?page&limit&keyword` (public, chỉ 3 query param này), `GET /api/genres?page&limit&keyword`, `GET /api/countries?page&limit&keyword`
- **File dự kiến tạo**: `src/shared/types/movie.types.ts`, `src/apis/movie.api.ts`, `src/apis/country.api.ts`, `src/hooks/tankstack/useMovie.ts`, `src/hooks/tankstack/useCountry.ts`, `src/components/movie/*`, `src/app/(main)/movies/page.tsx`, `src/app/(main)/movies/loading.tsx`
- **File dự kiến sửa**: `src/stores/movie-filter.store.ts`, `src/app/(main)/(home)/page.tsx`, `src/components/sidebar/nav-main.tsx`, `src/components/sidebar/nav-user.tsx`, `src/components/layout/UserLayout.tsx`

---

## Phase 1.5 — Base layout shell responsive (fix scroll ngang + nav mobile + header/footer site info)

**Mục tiêu**: Shell người dùng (`UserLayout`) responsive và đúng chuẩn base: không scroll ngang toàn trang, có bottom nav cho màn hình nhỏ, header có dropdown user (route/tính năng) dùng được cả mobile & desktop, và footer thông tin website (about/contact/social/chính sách).

> Đặt ngay sau Phase 1 (base) trong tài liệu vì đây là phần nền tảng bị thiếu; do Phase 1–2 đã đóng nên các task này được làm mới ở phase riêng.

- [x] **Fix lỗi scroll ngang toàn trang ở trang chủ**: đổi content wrapper trong `UserLayout.tsx` từ `flex` → block (`mx-auto w-full max-w-7xl min-w-0 flex-1`) + thêm `min-w-0` cho `SidebarInset` — loại bỏ min-width:auto của flex item khiến overflow nội bộ (hàng `MovieRow`) lan ra toàn trang
- [x] Tạo `components/layout/user-header.tsx` — header user: `SidebarTrigger` (chỉ `md+`, mobile dùng bottom nav), logo/link về `/`, toggle theme, `UserMenu` (dropdown user) — styled sẵn, dùng cho mọi trang `(main)`
- [x] Tạo `components/layout/user-menu.tsx` — dropdown nội dung user tái sử dụng: thông tin tài khoản, Trang chủ, Phim, Hồ sơ, Thông báo, Dashboard (nếu ADMIN), Đăng nhập (guest) / Đăng xuất; **`nav-user.tsx` (sidebar) tái sử dụng `UserMenuContent`**, không duplicate logic
- [x] Tạo `components/layout/mobile-bottom-nav.tsx` — bottom nav cố định `md:hidden`, safe-area (`env(safe-area-inset-bottom)`), item active theo pathname; guest: Trang chủ/Phim/Đăng nhập; user: + Thông báo, Tài khoản → `/profile`
- [x] Tạo `components/layout/site-footer.tsx` — footer site-wide: giới thiệu ngắn, link nhanh (Trang chủ/Phim), Về chúng tôi/Liên hệ, Chính sách bảo mật/Điều khoản, social icons, copyright
- [x] Tạo trang tĩnh `(main)/{about,contact,privacy,terms}/page.tsx` (server component, dùng `PageHeader`, nội dung tiếng Việt) — không bịa thông tin liên hệ thật, để placeholder cho chủ website điền
- [x] Cập nhật `UserLayout.tsx`: `UserHeader` + wrapper `min-w-0` + `SiteFooter` + `MobileBottomNav`; `SidebarInset` thêm `pb-16 md:pb-0` (chừa chỗ bottom nav)
- [x] Verify `npx --no-install tsc --noEmit` không phát sinh lỗi mới; cập nhật `docs/FRONTEND.md` (layout components + routes mới)

### Mở rộng Phase 1.5 — Ô tìm kiếm kiểu YouTube trong header + fix glassmorphism (2026-10-18)

- [x] Tạo `components/layout/header-search.tsx` — ô tìm kiếm kiểu YouTube: desktop (`md+`) hiện input inline trong header (icon Search + input bo tròn + nút submit); mobile hiện icon tìm kiếm, bấm để **mở rộng input ra toàn hàng header** (autoFocus, nút đóng); submit → `/movies?keyword=…`
- [x] Sửa `movie-list.tsx` + `movies/page.tsx` — đọc `?keyword=` từ URL seed vào filter store **và re-seed khi URL đổi** (trước đây chỉ seed 1 lần khi mount → search từ header trên chính trang `/movies` không có tác dụng)
- [x] Sửa `movie-filters.tsx` — đồng bộ `keywordInput` khi store keyword thay đổi từ bên ngoài (URL seed); **bug tiềm ẩn**: debounce 400ms của filter đang ghi đè keyword vừa seed từ URL (input local rỗng ≠ store keyword → tự setFilter ngược lại)
- [x] Fix glassmorphism "giả" ở header: `bg-sidebar` (opaque) + `backdrop-blur-md` = blur **vô hiệu** (blur chỉ hiệu lực khi nền trong suốt) → chuyển `bg-sidebar/75 backdrop-blur-md` (user header + className của `AdminLayout` đang truyền cho admin-header)

### Mở rộng Phase 1.5 — Ổn định title card + hộp thoại yêu cầu đăng nhập khi tương tác (2026-10-18)

- [x] MovieCard: title giữ `line-clamp-2` + thêm `min-h-[2.5rem]` (dành chỗ 2 dòng) để card không nhảy size khi tên phim ngắn/dài khác nhau; card `TopMovieCard` ở trang chủ đổi `line-clamp-1` → `line-clamp-2`
- [x] Tạo `stores/require-login.store.ts` (zustand: `isOpen/openDialog/closeDialog`) + `components/auth/require-login-dialog.tsx` (dùng `ConfirmDialog`, variant default: "Bạn chưa đăng nhập" → xác nhận mới chuyển `/auth/login?return-page=…`) + hook `hooks/useRequireLogin.ts` (`requireLogin(): boolean`)
- [x] Mount `<RequireLoginDialog />` trong `UserLayout`; thay redirect **ngay lập tức** trước đây bằng guard qua hộp thoại ở `movie-actions.tsx`, `movie-rating.tsx`, `movie-comments.tsx` (submit + reply) — fix kèm bug: submit reply đang redirect login cả khi đã đăng nhập mà `replyTo === null`

- **API dùng**: không gọi API mới — chỉ UI shell (dùng `useAuthStore` cho trạng thái đăng nhập)
- **File dự kiến tạo**: `src/components/layout/{user-header,user-menu,mobile-bottom-nav,site-footer}.tsx`, `src/app/(main)/{about,contact,privacy,terms}/page.tsx`
- **File dự kiến sửa**: `src/components/layout/UserLayout.tsx`, `src/components/sidebar/nav-user.tsx`, `docs/FRONTEND.md`

### Ghi chú triển khai Phase 1.5 (2026-10-18)

- **Nguyên nhân scroll ngang**: `UserLayout` bọc trang trong flex row (`mx-auto flex w-full max-w-7xl flex-1`) — trang chủ (`w-full`) là flex item có `min-width: auto` theo mặc định, nên không co xuống dưới min-content (mọi hàng `MovieRow` với 12 card) → overflow nội bộ bị đẩy ra ngoài, **toàn trang cuộn ngang thay vì từng hàng phim cuộn**. Chuyển wrapper sang block flow + `min-w-0` cho các flex item (wrapper, `SidebarInset`) là fix chuẩn.
- Bottom nav chỉ link **route đang tồn tại** (`/`, `/movies`, `/notification`, `/profile`, `/auth/login`); `/search`, `/recommendations`, `/my-history`, `/my-favorites` chưa có page → không đưa vào nav/footer (tránh 404). **Lỗi có sẵn (ngoài phạm vi phase này)**: trang chủ đang link `/search` và `/recommendations` → 404 (chờ Phase 4 / bổ sung trang).
- Social links trong footer là placeholder `#` + constant `SOCIAL_LINKS` ở đầu file — chủ website tự điền URL thật.

---

## Phase 2 — Chi tiết phim `/movies/[id]`

**Mục tiêu**: Trang chi tiết phim có thông tin, đánh giá sao, bình luận phân cấp realtime, view count realtime và khu vực phim tương đồng.

- [x] Tạo `frontend/src/app/(main)/movies/[id]/page.tsx` (server component — `params` là **Promise** phải `await`; container `movie-detail-view.tsx` gọi `POST /movies/:id/view` 1 lần khi mount, ref-guard chống DoubleInvoke) + `loading.tsx`
- [x] Tạo `frontend/src/components/movie/movie-detail.tsx` (poster `aspect-[2/3]`, `title`/`titleVi`, `overview`/`overviewVi` qua `react-markdown`, thể loại, quốc gia, `releaseDate`)
- [x] Tạo `frontend/src/components/movie/movie-rating.tsx` — chọn sao 1–5 + submit `POST /api/ratings` (`{ rating, movieId }`), hiển thị `voteAverage`/`voteCount`, cập nhật realtime qua WS `movie-{id}-rating` (`movieStats`)
- [x] Tạo `frontend/src/components/movie/movie-comments.tsx` — root comments (`GET /api/comments/movie/:movieId?page&limit`), tải reply theo `parentId`, form gửi `POST /api/comments` (`{ content, movieId, parentId? }`), phân trang bằng `DataPagination`, hiển thị `replyCount`, tái sử dụng `Textarea`/`Input`/`Avatar` shadcn
- [x] Tạo `frontend/src/components/movie/movie-view-count.tsx` — hiển thị lượt xem từ `{ viewCount }`, cập nhật realtime qua WS `movie-{id}-viewCount`
- [x] Tạo `frontend/src/components/movie/similar-movies.tsx` — **placeholder** (chưa có endpoint phim tương đồng; hiển thị giải thích + link khám phá theo thể loại của phim)
- [x] Tạo `frontend/src/hooks/tankstack/useRating.ts` (`['ratings', movieId]` + mutation invalidate `['ratings']`/`['movie']`/`['movies']`)
- [x] Tạo `frontend/src/hooks/tankstack/useComment.ts` (`['comments', movieId]` + mutation invalidate, optimistic prepend khi gửi, rollback `onError`)
- [x] Tạo `frontend/src/hooks/useMovieSocket.ts` — kết nối `socket.io-client` (URL derive từ `NEXT_PUBLIC_API_BASE_URL`, **không hardcode cổng**), lắng nghe `movie-{id}-comment`, `movie-{id}-rating`, `movie-{id}-viewCount`, `movie-{id}-typing`; **emit `typingComment`** `{ movieId, isTyping, userFullName? }`; handler giữ ref, cleanup khi unmount
- [x] Thêm trạng thái "đang gõ…" (typing realtime, debounce 2s) và hiệu ứng cập nhật realtime (star preview, transition card)

- **API dùng**: `GET /api/movies/:id`, `POST /api/movies/:id/view`, `POST /api/ratings`, `GET /api/ratings/movie/:movieId?page&limit`, `GET /api/comments/movie/:movieId?page&limit&parentId`, `POST /api/comments`; Socket.IO: nhận `movie-{id}-comment`, `movie-{id}-rating`, `movie-{id}-viewCount`, `movie-{id}-typing`; gửi `typingComment`

### Ghi chú triển khai Phase 2 (2026-10-17)

- **Lệch nhỏ so với plan**: Next.js 16 bắt buộc `params` là **Promise** → `page.tsx` là server component `await params` rồi truyền `id` sang container client `movie-detail-view.tsx` (plan ghi "parse sang number" — giữ nguyên string theo type `number | string` của API, tránh ép kiểu vô ích).
- **Mở rộng ngoài danh sách file**: thêm `src/apis/{rating,comment}.api.ts`, `src/shared/types/{rating,comment}.types.ts` (types tách khỏi `BaseDto` vì `createdAt` từ server là `string`, không phải `Date`); thêm `movie-detail-view.tsx` (container fetch + tăng view + layout 4 khối).
- **URL Socket.IO** derive từ `NEXT_PUBLIC_API_BASE_URL` (bỏ hậu tố `/api`) — không hardcode `:8081` (tuân thủ rule env).
- **Không dùng class `prose`** cho `react-markdown` vì repo không cài `@tailwindcss/typography` → style markdown bằng arbitrary variant (`[&_p]:mb-2`, `[&_li]:list-disc`…).
- **Rating submit lại**: backend unique (user, movie) — submit lần 2 trả lỗi → hiển thị message server qua toast (không tự thay đổi logic backend).
- **`similar-movies`**: placeholder có chủ đích (backend chưa có endpoint); hiển thị giải thích + link khám phá theo thể loại — không bịa dữ liệu.
- **Chặn DoD**: vẫn là 4 lỗi baseline cũ (`api/auth/signup/route.ts` ×2, `ui/calendar.tsx`, `ui/drawer.tsx`) — `tsc --noEmit` không phát sinh lỗi mới cho toàn bộ code Phase 2.
- **File dự kiến tạo**: `src/app/(main)/movies/[id]/page.tsx` + `loading.tsx`, `src/components/movie/{movie-detail,movie-detail-view,movie-rating,movie-comments,movie-view-count,similar-movies}.tsx`, `src/hooks/tankstack/{useRating,useComment}.ts`, `src/hooks/useMovieSocket.ts`, thêm `src/shared/types/{rating,comment}.types.ts` + `src/apis/{rating,comment}.api.ts`

---

## Phase 3 — Tương tác cá nhân

**Mục tiêu**: User xem được lịch sử xem / phim yêu thích và toggle các tương tác (like/dislike/favorite/watchlist) với optimistic update.

- [x] Tạo `frontend/src/apis/interaction.api.ts` (`toggle`, `getMyHistory`, `getMyFavorites`) — ✅ `toggle` + `getMyFavorites` đã rút lên Phase 1 (card actions); `getMyHistory` hoàn thành ở Phase 3
- [x] Tạo `frontend/src/hooks/tankstack/useInteraction.ts` — `useToggleInteraction` (đọc `result.action` = `added`/`removed`, optimistic update + rollback `onError`), `useMyHistory`, `useMyFavorites` — ✅ `useToggleInteraction` + `useMyFavorites` đã rút lên Phase 1; `useMyHistory` + `useMyFavoritesPaged` (phân trang cho 2 trang cá nhân) hoàn thành ở Phase 3
- [x] Tạo `frontend/src/components/movie/movie-actions.tsx` — nút like/dislike/favorite/watchlist (icon lucide, touch target ≥44px) — ✅ đã rút lên Phase 1 (like/favorite/watchlist trên card); `dislike` thêm ở Phase 3 cho biến thể `detail`
- [x] Gắn `movie-actions` vào `movie-card.tsx` và trang chi tiết phim — ✅ card từ Phase 1; `movie-detail-view.tsx` gắn hàng `MovieActions variant="detail"` (4 nút: thích / không thích / yêu thích / muốn xem)
- [x] Tạo trang lịch sử xem `frontend/src/app/(main)/my-history/page.tsx` (list + phân trang + loading/empty state)
- [x] Tạo trang yêu thích `frontend/src/app/(main)/my-favorites/page.tsx` (list + phân trang + loading/empty state)
- [x] Thêm mục điều hướng (Lịch sử xem, Yêu thích) vào `nav-main.tsx` (group "Cá nhân", ẩn khi guest) / dropdown user `user-menu.tsx` (dùng chung cho header + sidebar)
- [x] Chặn truy cập khi chưa đăng nhập (redirect login kèm `return-page`) — component mới `components/auth/require-auth.tsx` (`RequireAuth`: chỉ yêu cầu đăng nhập, khác `RequireRole` là không check role)

### Ghi chú triển khai Phase 3 (2026-10-18)

- **Dùng chung 1 component cho 2 trang** (tái sử dụng UI): `components/movie/interaction-movie-list.tsx` (`MyInteractionList source="history"|"favorites"`) — hàng poster + tên phim + badge loại tương tác + ngày, click → `/movies/[id]`, `DataPagination`, skeleton/empty/error state; 2 page chỉ là server shell (`PageHeader` + container) + `metadata`.
- **QueryKey tách root**: danh sách phân trang dùng root `['my-history', page, limit]` và `['my-favorites-page', page, limit]` — **cố ý tách khỏi root `interactions`** vì optimistic update trong `useToggleInteraction` ghi cache dạng `Interaction[]` lên mọi query khớp `[FAVORITES_KEY]`, sẽ phá cache có shape `{items, pagination}`; `onSettled` invalidate cả 3 root để trang list đồng bộ sau khi toggle. `useMyFavorites` cũ (page-1, limit 100, shape array) giữ nguyên cho trạng thái nút trên card.
- **Hooks gọi kép an toàn**: `MyInteractionList` gọi cả `useMyHistory` + `useMyFavoritesPaged` (rules của React Hooks) với tham số `enabled` — hook không được chọn không fetch.
- **Guard đăng nhập**: `RequireAuth` (mới) — guest → redirect `/auth/login?return-page=…`, đang khôi phục phiên → spinner; dùng cho `/my-history`, `/my-favorites`. `RequireRole` giữ nguyên cho admin (check role).
- **Giới hạn `dislike` (backend)**: `GET /api/interactions/my-favorites` chỉ trả `type ∈ like, favorite, watchlist` → nút "Không thích" ở chi tiết phim **không hiển thị trạng thái active bền vững** (chỉ toggle theo kết quả server + toast); không tự bịa endpoint để fix.
- **Chặn DoD**: vẫn là 4 lỗi baseline cũ (`api/auth/signup/route.ts` ×2, `ui/calendar.tsx`, `ui/drawer.tsx`) — `tsc --noEmit` không phát sinh lỗi mới; smoke test `/my-history`, `/my-favorites` qua dev server `:3002` OK (SSR shell + title đúng).
- **File dự kiến tạo (thực tế)**: `src/app/(main)/{my-history,my-favorites}/page.tsx`, `src/components/movie/interaction-movie-list.tsx`, `src/components/auth/require-auth.tsx`
- **File dự kiến sửa (thực tế)**: `src/hooks/tankstack/useInteraction.ts` (`useMyHistory`, `useMyFavoritesPaged`, invalidate list roots), `src/components/movie/movie-actions.tsx` (dislike variant detail), `src/components/movie/movie-detail-view.tsx` (hàng actions), `src/components/sidebar/nav-main.tsx` (group "Cá nhân"), `src/components/layout/user-menu.tsx` (2 mục dropdown)

- **API dùng**: `POST /api/interactions` (`{ score?, type, movieId }` — toggle, kết quả `{ success, action: 'added'|'removed', type, data? }`), `GET /api/interactions/my-history?page&limit`, `GET /api/interactions/my-favorites?page&limit`
- **File dự kiến tạo**: `src/apis/interaction.api.ts`, `src/hooks/tankstack/useInteraction.ts`, `src/components/movie/movie-actions.tsx`, `src/app/(main)/my-history/page.tsx`, `src/app/(main)/my-favorites/page.tsx`
- **File dự kiến sửa**: `src/components/movie/movie-card.tsx`, `src/app/(main)/movies/[id]/page.tsx`, `src/components/sidebar/nav-main.tsx`, `src/components/sidebar/nav-user.tsx`

---

## Phase 4 — Semantic search tiếng Việt ⚠ PHỤ THUỘC ai-service

**Mục tiêu**: Tìm kiếm ngữ nghĩa tiếng Việt (kết hợp keyword fallback), hiển thị kết quả kèm mức tương đồng.

> **Điều kiện tiên quyết (blocking)**: (1) ai-service phải fix lỗi **HTTP 500** ở `/search` và `/hybrid` và cấu hình **CORS**; (2) phải chốt **cách gọi**: backend **KHÔNG có** endpoint search/recommendation — recommendation do ai-service cung cấp tại prefix `/api/recommendations`, có thể gọi qua **Kong gateway `:8000`** (`/api/recommendations` → `:8082`). Nếu chưa chốt/chưa sẵn sàng → chuyển sang Phase 5 và quay lại sau.

- [ ] Chốt với dev/backend: gọi ai-service qua gateway `:8000/api/recommendations` hay qua base URL riêng; xác nhận contract (method, query `q`, response `result` + `score`)
- [ ] Thêm biến env cho base URL ai-service/gateway (ví dụ `NEXT_PUBLIC_AI_BASE_URL`) — **không hardcode URL**
- [ ] Tạo `frontend/src/apis/search.api.ts` (`searchApi.search`) — dùng `axiosClient`/instance phù hợp, đọc `result`
- [ ] Tạo `frontend/src/hooks/tankstack/useSearch.ts` (`['search', q]`, debounce input)
- [ ] Tạo `frontend/src/app/(main)/search/page.tsx` — kết quả semantic, empty state khi không có kết quả
- [ ] Tích hợp ô tìm kiếm semantic vào header/trang `/movies` (chuyển đổi giữa keyword và semantic)
- [ ] Hiển thị điểm tương đồng (similarity score) trên kết quả nếu ai-service trả về
- [ ] Fallback sang keyword search (`GET /api/movies?keyword=`) khi endpoint semantic lỗi/timeout
- [ ] Chống spam: debounce ≥400ms + staleTime để không vượt rate limit

- **API dùng (dự kiến)**: ai-service `/api/recommendations/...` (`/search`, `/hybrid`) qua gateway `:8000` (chờ fix 500 + CORS); fallback `GET /api/movies?keyword=` (backend, public)
- **File dự kiến tạo**: `src/apis/search.api.ts`, `src/hooks/tankstack/useSearch.ts`, `src/app/(main)/search/page.tsx`
- **File dự kiến sửa**: `src/app/(main)/movies/page.tsx`, `src/components/movie/movie-filters.tsx`

---

## Phase 5 — Admin CRUD + Dashboard

**Mục tiêu**: Khu vực admin quản trị dữ liệu thật: movies, genres, countries, peoples, users, roles, interaction; dashboard có biểu đồ.

- [x] Tạo component dùng chung `frontend/src/components/admin/data-table.tsx` (table + pagination + search) — kèm `CrudTableSkeleton`, hành động Sửa/Xóa + `extraActions`
- [x] Tạo component dùng chung `frontend/src/components/admin/form-dialog.tsx` (react-hook-form + zod + shadcn Dialog) — field `text`/`textarea`/`select`/`multiselect`, kèm `crud-toolbar.tsx`, `delete-dialog.tsx`, `assign-roles-dialog.tsx`
- [x] Cài đặt CRUD Movies: `src/apis/movie.api.ts` (create/update/delete) + hook + `src/app/(admin-layout)/admin/movies/page.tsx` + form (chọn thể loại/quốc gia/diễn viên)
- [x] Cài đặt CRUD Genres: hoàn thiện trang `admin/genres/page.tsx` dùng `genreApi` + `useGenre` sẵn có
- [x] Cài đặt CRUD Countries: trang `admin/countries/page.tsx`
- [x] Cài đặt CRUD Peoples (diễn viên & đạo diễn): trang `admin/people/page.tsx`
- [x] Cài đặt quản lý Users: trang `admin/users/page.tsx` (list, gán vai trò — **bỏ "khoá/mở"**: backend không có endpoint status được docs xác nhận) dùng `userApi`/`roleApi`
- [x] Cài đặt quản lý Roles: trang `admin/roles/page.tsx` dùng `roleApi`
- [x] Cài đặt trang Interaction: `admin/interaction/page.tsx` — 3 tab Tương tác/Đánh giá/Bình luận (`GET /api/interactions|ratings|comments`, fetch theo tab bằng `enabled`)
- [x] Sửa `nav-main.tsx` — group "Interaction" trỏ đúng `/admin/interaction` (hiện đang trỏ `/interaction/*` không tồn tại)
- [x] Bọc toàn bộ trang admin bằng `RequireRole requiredRoles={['ADMIN']}` — **đã có sẵn trong `AdminLayout.tsx`**, chỉ cần kiểm tra lại
- [x] Dashboard `frontend/src/app/(admin-layout)/dashboard/page.tsx` — thẻ chỉ số + biểu đồ `recharts` (top phim xem nhiều, phim theo thể loại, tương tác theo loại)
- [x] Đảm bảo mọi trang admin có skeleton + error state (tiếng Việt) và responsive (table → card/overflow trên mobile)

### Ghi chú triển khai Phase 5

- **Kit admin tái sử dụng 1 điểm render** (`src/components/admin/`):
  - `data-table.tsx`: `DataTable<T>` generic — bảng shadcn (md+, `overflow-x-auto`) + card list (mobile, đúng chuẩn responsive); cột khai báo `columns`; hành động Sửa/Xóa + `extraActions` (dùng cho nút Phân quyền) khai báo qua props.
  - `form-dialog.tsx`: `CrudFormDialog<T>` (react-hook-form + zod, field `text`/`textarea`/`select`/`multiselect`, error inline tiếng Việt) + `useCrudFormValues` (defaultValues memo theo item sửa).
  - `crud-toolbar.tsx` (tìm kiếm debounce + nút thêm), `delete-dialog.tsx` (`CrudDeleteDialog` bọc `ConfirmDialog` sẵn có), `assign-roles-dialog.tsx` (phân quyền user, tái sử dụng `CrudFormDialog` với 1 field multiselect).
- **Hooks CRUD generic** (`src/hooks/tankstack/admin-crud.ts` + `admin.ts`): factory `createCrudHooks` (list phân trang + create/update/delete, invalidate + toast), `useCrudPage` (state orchestration: pagination, debounce 400ms, dialog thêm/sửa/xóa — mỗi trang chỉ khai báo `columns`/`fields`), `usePagedList`/`useDeleteOnly` cho danh sách read-only. QueryKey root riêng `admin-*` để không conflict cache phía user.
- **API**: thêm `people.api.ts`; mở rộng `movie.api.ts` (create/update/delete), `country.api.ts`, `role.api.ts` (CRUD), `user.api.ts` (`getAllUsers` nhận `{page,limit,keyword}` + `updateUserRoles`), `rating.api.ts`/`comment.api.ts`/`interaction.api.ts` (`getAll` + `remove`). **Fix `genre.api.ts` update: `PUT` → `PATCH`** (đúng `genres.controller.ts` backend).
- **Users**: form thêm (email/fullName/password/confirmPassword) khác form sửa (fullName — `UpdateProfileDto`); không tự xóa chính mình (`canDelete`); gán vai trò qua `PATCH /users/:id/roles` (`{roleIds: number[]}` theo BACKEND.md). **Bỏ "khoá/mở"**: `PUT /users/:id/status` không có trong docs → không bịa endpoint.
- **Roles**: `GET /api/roles` backend không phân trang → giả lập envelope (`limit:1000`, `totalPages:1`) để dùng chung `DataTable`.
- **Interaction**: 3 tab read-only + xóa từng bản ghi; tab switch bằng button segment (không có `tabs.tsx` trong ui kit); tái sử dụng `TYPE_BADGES` từ `interaction-movie-list.tsx` làm nhãn type.
- **Dashboard**: 4 thẻ chỉ số lấy `pagination.total`; biểu đồ recharts (bar top 10 phim xem nhiều, bar phim theo thể loại, donut tương tác theo loại) tổng hợp client-side từ 100 bản ghi đầu tiên — **backend chưa có endpoint thống kê/sort/trend theo thời gian**, có ghi chú rõ trên trang. Biểu đồ có `role="img"` + `aria-label`, thẻ chỉ số hiện số cụ thể (không dùng màu làm duy nhất).
- **Guard**: `RequireRole requiredRoles={['ADMIN']}` đã bọc toàn bộ `AdminLayout` (kiểm tra lại, không sửa thêm).
- **nav-main**: group "Interaction" gộp còn 1 mục "Tương tác" → `/admin/interaction` (4 route `/interaction/*` cũ đều 404, đã xóa khỏi nav); nhóm thêm `Activity` icon, bỏ icon không dùng (`Star`, `MessageSquare`).
- **Kiểm chứng**: `tsc --noEmit` chỉ còn 4 lỗi baseline (signup route ×2, `ui/calendar.tsx`, `ui/drawer.tsx` — không đụng tới theo yêu cầu "chỉ báo cáo, không sửa"); smoke-test 8 trang admin trên dev `:3002` đều 200 (compile OK). Lint/build vẫn bị chặn bởi baseline như các phase trước.

- **API dùng**: CRUD `/api/movies`, `/api/genres`, `/api/countries`, `/api/peoples`, `/api/users`, `/api/roles`, `/api/interactions`; dữ liệu dashboard tổng hợp từ các endpoint trên
- **File dự kiến tạo**: `src/components/admin/{data-table,form-dialog}.tsx`, các form quản trị trong `src/components/admin/*`
- **File dự kiến sửa**: `src/app/(admin-layout)/admin/*/page.tsx` (7 trang), `src/app/(admin-layout)/dashboard/page.tsx`, `src/apis/movie.api.ts`, `src/hooks/tankstack/useMovie.ts`, `src/components/sidebar/nav-main.tsx`

---

## Rủi ro & Phụ thuộc

| # | Rủi ro / Phụ thuộc | Ảnh hưởng | Xử lý |
|---|---|---|---|
| 1 | ai-service lỗi **500** ở `/search` và `/hybrid` | Chặn hoàn toàn Phase 4 | Tạm dùng keyword search (`GET /api/movies?keyword=`); chỉ làm Phase 4 sau khi ai-service fix |
| 2 | ai-service chưa cấu hình **CORS** / chưa chốt cách gọi (gateway `:8000` hay base URL riêng) | Chặn Phase 4 | Frontend không bịa endpoint; chốt với dev rồi mới code, thêm env base URL |
| 3 | Backend **không có** endpoint phim tương đồng (`/similar`) | `similar-movies.tsx` không có dữ liệu | Để placeholder ở Phase 2, chờ ai-service/gateway cung cấp |
| 4 | Backend **không có** endpoint trending/hot và `GET /api/movies` không có tham số `sort` | Trang chủ không có "phim thịnh hành"/sort tùy ý | Dùng danh sách mặc định (`createdAt DESC` = phim mới nhất); đề xuất backend bổ sung `sort` nếu cần |
| 5 | **Rate limit**: global **100 req/phút** + override theo endpoint (login 5/phút, refresh 10/phút…) | Dễ bị 429 khi search/filter liên tục | Debounce input, `staleTime` 5 phút, hạn chế refetch |
| 6 | `frontend/node_modules` chưa cài | Không dev/build/lint được | Bắt buộc chạy `npm install` ở Phase 0 |
| 7 | `socket.io-client` chưa dùng ở UI; CORS WS `origin:'*'`, không bắt buộc auth | Phase 2 realtime có thể lệch contract | Bám đúng event/payload trong `docs/BACKEND.md` trước khi implement `useMovieSocket` |
| 8 | Type `Pagination` (`totalItems/currentPage/pageSize`) lệch payload backend (`total/page/limit/totalPages`) | Hiển thị phân trang sai | Chuẩn hóa type `Pagination` theo payload backend khi làm Phase 1 |
| 9 | Mock `AuthContext` còn song song với `useAuthStore` | Dễ import sai hook | Chỉ dùng `useAuthStore`; dọn mock dần (ngoài phạm vi plan này) |
| 10 | `RolesGuard` **không được enforce** ở hầu hết module backend | API quản trị có thể gọi được cả khi không phải ADMIN | Vẫn bọc `RequireRole(['ADMIN'])` ở client; không dựa backend để bảo vệ |

## Định nghĩa hoàn thành (DoD) chung

- [ ] `npm run lint` và `npm run build` pass, không thêm warning mới
- [ ] Mọi trang có loading/skeleton, empty state và error state bằng tiếng Việt
- [ ] Đã kiểm tra responsive tại width 375px và desktop
- [ ] Không hardcode URL backend, không dùng `fetch`/`http.ts`, không dùng mock `AuthContext`
- [ ] Không commit/push khi chưa được yêu cầu
