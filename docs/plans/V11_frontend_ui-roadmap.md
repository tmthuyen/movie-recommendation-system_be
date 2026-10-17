# V11 — Frontend UI Roadmap (User-facing + Admin CRUD)

- **Trạng thái**: Đang thực hiện — **Phase 0 (baseline) xong ở mức môi trường**, **Phase 1 (nền tảng + trang chủ + danh sách phim + movie card UX) hoàn thành → đã đóng**, **Phase 2 (chi tiết phim `/movies/[id]`) hoàn thành → đã đóng**, **Phase 1.5 (base layout shell responsive: fix scroll ngang, bottom nav, header user dropdown, footer site info + trang about/contact/privacy/terms) hoàn thành → đã đóng**; đang làm **Phase 3 (tương tác cá nhân)**; Phase 4–5 còn `- [ ]`. Lưu ý: DoD `lint`/`build` đang bị chặn bởi lỗi baseline có sẵn trong repo (xem "Ghi chú triển khai Phase 1").
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

- [ ] Tạo `frontend/src/apis/interaction.api.ts` (`toggle`, `getMyHistory`, `getMyFavorites`) — ✅ `toggle` + `getMyFavorites` đã rút lên Phase 1 (card actions); còn `getMyHistory` làm ở Phase 3
- [ ] Tạo `frontend/src/hooks/tankstack/useInteraction.ts` — `useToggleInteraction` (đọc `result.action` = `added`/`removed`, optimistic update + rollback `onError`), `useMyHistory`, `useMyFavorites` — ✅ `useToggleInteraction` + `useMyFavorites` đã rút lên Phase 1; còn `useMyHistory` làm ở Phase 3
- [ ] Tạo `frontend/src/components/movie/movie-actions.tsx` — nút like/dislike/favorite/watchlist (icon lucide, touch target ≥44px) — ✅ đã rút lên Phase 1 (like/favorite/watchlist trên card; `dislike` thêm khi làm chi tiết phim)
- [ ] Gắn `movie-actions` vào `movie-card.tsx` và trang chi tiết phim
- [ ] Tạo trang lịch sử xem `frontend/src/app/(main)/my-history/page.tsx` (list + phân trang + loading/empty state)
- [ ] Tạo trang yêu thích `frontend/src/app/(main)/my-favorites/page.tsx` (list + phân trang + loading/empty state)
- [ ] Thêm mục điều hướng (Lịch sử xem, Yêu thích) vào `nav-main.tsx` / `nav-user.tsx` cho user đã đăng nhập
- [ ] Chặn truy cập khi chưa đăng nhập (redirect login kèm `return-page`)

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

- [ ] Tạo component dùng chung `frontend/src/components/admin/data-table.tsx` (table + pagination + search)
- [ ] Tạo component dùng chung `frontend/src/components/admin/form-dialog.tsx` (react-hook-form + zod + shadcn Dialog)
- [ ] Cài đặt CRUD Movies: `src/apis/movie.api.ts` (create/update/delete) + hook + `src/app/(admin-layout)/admin/movies/page.tsx` + form (chọn thể loại/quốc gia/diễn viên)
- [ ] Cài đặt CRUD Genres: hoàn thiện trang `admin/genres/page.tsx` dùng `genreApi` + `useGenre` sẵn có
- [ ] Cài đặt CRUD Countries: trang `admin/countries/page.tsx`
- [ ] Cài đặt CRUD Peoples (diễn viên & đạo diễn): trang `admin/people/page.tsx`
- [ ] Cài đặt quản lý Users: trang `admin/users/page.tsx` (list, khoá/mở, gán vai trò) dùng `userApi`/`roleApi`
- [ ] Cài đặt quản lý Roles: trang `admin/roles/page.tsx` dùng `roleApi`
- [ ] Cài đặt trang Interaction: `admin/interaction/page.tsx` (ratings/comments/favorites/history)
- [ ] Sửa `nav-main.tsx` — group "Interaction" trỏ đúng `/admin/interaction` (hiện đang trỏ `/interaction/*` không tồn tại)
- [ ] Bọc toàn bộ trang admin bằng `RequireRole requiredRoles={['ADMIN']}`
- [ ] Dashboard `frontend/src/app/(admin-layout)/dashboard/page.tsx` — thẻ chỉ số + biểu đồ `recharts` (phim theo thể loại, lượt xem/đánh giá theo thời gian)
- [ ] Đảm bảo mọi trang admin có skeleton + error state (tiếng Việt) và responsive (table → card/overflow trên mobile)

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
