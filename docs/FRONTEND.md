# FRONTEND — Next.js (movie-recommendation)

> Tài liệu hiện trạng frontend. Quy tắc bắt buộc khi viết code xem [FRONTEND_RULES.md](./FRONTEND_RULES.md). Kế hoạch triển khai UI xem [plans/V11_frontend_ui-roadmap.md](./plans/V11_frontend_ui-roadmap.md).
>
> **Ngày xác minh: 2026-11-04.** Các kết luận hành vi dưới đây được đối chiếu trực tiếp với code `frontend/src/` và controller backend tương ứng (file:line ghi kèm khi cần). Phần nào chưa chạy runtime sẽ ghi rõ “cần xác minh”.

## About

- Frontend là lớp giao diện web của dự án **"Ứng dụng mô hình ngôn ngữ vào hệ thống gợi ý phim"**, nằm ở thư mục `frontend/`, chạy **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui**.
- Vai trò chính: hiển thị danh sách/chi tiết phim, tìm kiếm, tương tác người dùng (đánh giá, bình luận, yêu thích, lịch sử xem) và khu vực quản trị (CRUD) cho admin.
- Giao tiếp **trực tiếp** với backend NestJS tại `http://localhost:8081/api` từ trình duyệt (không qua tầng BFF), thông qua `axiosClient` ở `frontend/src/lib/axiosClient.ts` với `withCredentials=true` (refresh token nằm trong httpOnly cookie của backend).
- **Backend NestJS CÓ endpoint search và recommendation**:
  - `GET /api/movies/search` — tìm kiếm nâng cao (keyword, sort, genreIds, countryIds, khoảng năm) — xem `docs/BACKEND.md`.
  - `GET /api/recommendations/similar/:id` — phim tương tự, backend proxy HTTP sang ai-service rồi map DB; FE gọi qua `recommendationApi.getSimilarMovies` → `axiosClient` (`frontend/src/apis/recommendation.api.ts:18-24`), dùng ở `SimilarMovies` (`frontend/src/components/movie/similar-movies.tsx:42-51`).
  - `GET /api/recommendations/semantic-search` và `GET /api/recommendations/hybrid-search` — **stub** ở backend (trả `{status, message, data: []}`), FE đã có api/hook nhưng chưa dùng thực tế.
  - Backend ↔ ai-service giao tiếp **2 kênh**: RabbitMQ (event) + HTTP (module recommendations).
- Hạ tầng có **Kong gateway (`gateway/kong.yml`, `:8000`)**: `/api` → `8081`, `/api/recommendations` → `8082`; **hiện frontend gọi thẳng backend `:8081`**, chưa dùng gateway và chưa có client gọi trực tiếp ai-service `:8082`.
- Port dev: **3002** — script `npm run dev` chạy `next dev -p 3002`; backend đã cho phép CORS với `http://localhost:3002`.
- Ngôn ngữ giao diện: **tiếng Việt**; có dark mode (class-based qua `next-themes`).
- **Onboarding sở thích (V15)**: `PreferenceOnboardingGate` mount trong `src/app/(main)/layout.tsx:4,11`; hiện dialog chọn thể loại cho user đã đăng nhập chưa có `preferenceData.genre`, lưu qua `PUT /api/users/me`, có nút bỏ qua lưu `localStorage` theo user (`preference-onboarding-gate.tsx:24-89`).

## Techstacks

Bảng lib đọc từ `frontend/package.json` (phiên bản khai báo):

| Lib | Phiên bản | Vai trò |
|---|---|---|
| `next` | `16.3.8` | Framework App Router, SSR/build, route groups |
| `react` / `react-dom` | `19.2.8` | UI library |
| `typescript` (dev) | `^5` | Strong type cho toàn bộ `src/` |
| `tailwindcss` + `@tailwindcss/postcss` | `^4.3.3` / `^4` | Utility-first CSS, CSS-first config trong `src/app/globals.css` (không có `tailwind.config`) |
| `tw-animate-css` | `^1.4.0` | Animation/transition CSS sẵn có cho shadcn (tw-animate-*) |
| `shadcn` (CLI) | `^4.19.0` | Sinh component shadcn/ui — cấu hình ở `components.json` (style `new-york`, `baseColor: neutral`, `cssVariables: true`, icon `lucide`) |
| `@radix-ui/react-dialog`, `@radix-ui/react-dropdown-menu`, `@radix-ui/react-slot`, `radix-ui` | `^1.1.15`, `^2.1.16`, `^1.2.4`, `^1.5.0` | Primitive không có style (dialog, menu…) làm nền cho `src/components/ui` |
| `@base-ui/react` | `^1.7.0` | Component primitive bổ sung (dùng cho một số component mở rộng) |
| `lucide-react` | `^0.562.0` | Icon — **icon duy nhất được dùng** (không emoji) |
| `zustand` | `^5.0.15` | State toàn cục (`src/stores/*.store.ts`), notably `auth.store.ts` giữ access token in-memory |
| `@tanstack/react-query` + devtools | `^5.102.8` | Cache/server state, hook `src/hooks/tankstack/*` |
| `axios` | `^1.20.0` | HTTP — gói trong `axiosClient` (interceptor auth + snake→camel + refresh 401) |
| `react-hook-form` + `zod` + `@hookform/resolvers` | `^7.76.1`, `^4.4.3`, `^5.4.0` | Form + validation schema |
| `sonner` | `^2.0.7` | Toast (thông báo lỗi/thành công tiếng Việt) |
| `next-themes` | `^0.4.6` | Dark mode class-based (`attribute="class"`) |
| `@react-oauth/google` | `^0.13.5` | Đăng nhập Google (dùng `NEXT_PUBLIC_GOOGLE_CLIENT_ID`) |
| `class-variance-authority`, `clsx`, `tailwind-merge`, `cn` | `^0.7.1`, `^2.1.1`, `^3.4.0`, `^0.4.0` | Variants + gộp class Tailwind (`cn()` trong `src/lib/utils.ts`) |
| `react-markdown` | `^10.1.0` | Render Markdown (nội dung mô tả phim…) |
| `react-day-picker` + `date-fns` | `^10.0.1`, `^4.4.0` | Chọn ngày + format ngày (Calendar của shadcn) |
| `cmdk` | `^1.1.1` | Command palette (component `command` của shadcn) |
| `recharts` | `^3.10.1` | Biểu đồ cho Dashboard admin (**đã dùng** — bar/donut trong `dashboard-client.tsx`) |
| `socket.io-client` | `^4.8.3` | Realtime (comment/rating/interaction/viewCount/typing) — **1 socket dùng chung** ở `hooks/useMovieSocket.ts` |
| `react-icons` | `^5.7.0` | **Không dùng** cho icon mới (ưu tiên lucide-react) |
| `react-router-dom` | `^7.18.3` | **Không dùng** — project dùng Next.js App Router |

Dev tooling: `eslint` `^9` + `eslint-config-next` `16.3.8` + `eslint-config-prettier` `^10.1.8`, `prettier` `^3.8.3` + `prettier-plugin-tailwindcss` `^0.8.0`, `vitest` `^2.1.9` (script `npm test`), `tsx` `^4.20.3`, `babel-plugin-react-compiler` `1.0.0`.

Scripts: `dev` (port 3002), `build`, `start` (port 3002), `lint`, `test`, `test:watch`.

## Structure Folder

Cấu trúc theo **folder-by-type**, alias `@/*` → `./src/*`:

```
frontend/
├── components.json          # Cấu hình shadcn: style new-york, baseColor neutral, cssVariables, icon lucide
├── package.json             # Scripts dev/build/lint/test + danh sách lib (bảng trên)
├── .env                     # NEXT_PUBLIC_API_BASE_URL, NEXT_PUBLIC_GOOGLE_CLIENT_ID, NEXT_PUBLIC_TINYMCE_API_KEY
└── src/
    ├── proxy.ts             # Proxy/middleware của Next — hiện chỉ pass-through header
    │
    ├── app/                 # NEXT.JS APP ROUTER (routes)
    │   ├── layout.tsx       # Root layout (font, providers: ReactQuery, theme, sonner…)
    │   ├── globals.css      # Design tokens Tailwind v4 (CSS-first): :root light, .dark, [data-theme=…], radius
    │   ├── not-found.tsx    # Trang 404
    │   ├── (main)/          # Route group cho USER
    │   │   ├── layout.tsx   # RoleLayout → guest/USER: UserLayout, ADMIN: AdminLayout; mount PreferenceOnboardingGate
    │   │   ├── (home)/page.tsx        # / — trang chủ THẬT (hero, MovieRow sections, genre/country)
    │   │   ├── movies/                # /movies (danh sách + filter) và /movies/[id] (chi tiết)
    │   │   ├── notification/page.tsx  # /notification (placeholder)
    │   │   ├── profile/               # /profile — THẬT (ProfileForm, UserProfileForm, UpdatePasswordForm, UserSessionForm)
    │   │   ├── setting/theme/page.tsx # /setting/theme — THẬT (chọn theme/màu)
    │   │   └── about/ contact/ privacy/ terms/   # Trang thông tin website (server component, PageHeader)
    │   ├── (admin-layout)/  # Route group cho ADMIN (bọc `RequireRole(['ADMIN'])` trong AdminLayout)
    │   │   ├── layout.tsx / error.tsx / loading.tsx   # Layout admin, error boundary, skeleton
    │   │   ├── dashboard/page.tsx     # /dashboard — THẬT (thẻ chỉ số + biểu đồ recharts)
    │   │   └── admin/                 # /admin/* — 8 trang THẬT (Phase 5, page server + *-client.tsx):
    │   │       ├── movies/  genres/  countries/  people/
    │   │       ├── users/   roles/   interaction/
    │   ├── auth/             # Xác thực — THẬT (gọi API)
    │   │   ├── login/        # page.tsx + login-form.tsx + google-button.tsx
    │   │   ├── signup/       # page.tsx + signup-form.tsx
    │   │   ├── verify-email/ # page.tsx + verify-email.tsx
    │   │   └── google-success/page.tsx  # Callback Google OAuth
    │   └── api/              # Route handler Next (stub trả JSON rỗng — KHÔNG dùng cho business logic)
    │       ├── auth/{login,logout,me,signup}/route.ts
    │       └── profile/route.ts
    │
    ├── apis/                # Tầng API — mỗi domain một file `export const xxxApi = {...}` dùng axiosClient
    │   ├── auth.api.ts      # login/register/refresh/getMe/logout/verify-email…
    │   ├── genre.api.ts     # CRUD genres (mẫu chuẩn cho các api mới)
    │   ├── movie.api.ts     # list/chi tiết, search (`GET /movies/search`), create/update/delete (admin)
    │   ├── country.api.ts / people.api.ts   # CRUD (admin)
    │   ├── rating.api.ts / comment.api.ts / interaction.api.ts  # Toggle + getAll/remove (trang admin)
    │   ├── recommendation.api.ts # similar (`/recommendations/similar/:id`), semantic-search, hybrid-search
    │   ├── user.api.ts      # Quản lý tài khoản + getAllUsers({page,limit,keyword}) + updateUserRoles
    │   └── role.api.ts      # CRUD vai trò (GET không phân trang)
    │
    ├── hooks/
    │   ├── tankstack/       # ⚠ Typo cố ý — GIỮ NGUYÊN tên folder: hook @tanstack/react-query
    │   │   ├── useAuthApi.ts   # Query/mutation auth
    │   │   ├── useGenre.ts     # useGetAll (staleTime 5 phút) + useCreateGenre (mẫu chuẩn)
    │   │   ├── useUser.ts      # Quản lý user
    │   │   ├── admin-crud.ts   # Factory CRUD admin: createCrudHooks (list+create/update/delete), useCrudPage (state orchestration: pagination, debounce 400ms, dialog), usePagedList/useDeleteOnly
    │   │   ├── admin.ts        # Bộ hooks admin theo domain (adminGenres/Countries/Peoples/Movies/Users/Roles) + interactions/ratings/comments read-only
    │   │   ├── admin-dashboard.ts # useAdminDashboard({days}) — gom 6 list API + memo thống kê dashboard + refresh()
    │   │   ├── useMovie.ts     # useGetMovies (list), useSearchMovies + useLatest/TopRated/MostViewed/MostLiked (gọi /movies/search với sort)
    │   │   ├── useRecommendation.ts # useGetSimilarMovies (đã dùng ở SimilarMovies), useSemanticSearch, useHybridRecommendations (api/hook có, chưa dùng UI)
    │   │   └── useInteraction.ts # useToggleInteraction (like, optimistic + invalidate), useMyFavorites/useMyFavoriteKeys (trạng thái nút card), useInteractionStats (like/comment/view realtime fallback),
    │   │                          # useMyHistory + useMyFavoritesPaged (phân trang, queryKey root riêng my-history/my-favorites-page)
    │   ├── useAuth.ts       # ⚠ Đang đọc mock AuthContext — sẽ dọn khi chuyển hẳn useAuthStore
    │   ├── useRequireLogin.ts # Guard guest: true nếu đã đăng nhập, ngược lại mở RequireLoginDialog
    │   ├── use-mobile.ts, useBreadCrumb.ts, useClickOutside.ts, useColor.ts, useHover.ts
    │
    ├── stores/              # ZUSTAND — state toàn cục
    │   ├── auth.store.ts        # accessToken in-memory, user, bootstrap/refresh/logout
    │   ├── movie-filter.store.ts # Filter state trang phim (keyword, genreId, countryId, sort, page, limit)
    │   └── require-login.store.ts # Trạng thái hộp thoại "chưa đăng nhập" (mở bởi useRequireLogin)
    │
    ├── components/
    │   ├── ui/              # shadcn/ui sinh từ CLI (button, dialog, table, sidebar, sonner…)
    │   ├── layout/          # UserLayout (shell user: UserHeader + content wrapper min-w-0 + SiteFooter + MobileBottomNav),
    │   │                    # AdminLayout (shell admin: AdminSidebar + admin-header + SiteFooter + AdminMobileBottomNav),
    │   │                    # RoleLayout (bọc theo role), user-header (top header + dropdown điều hướng nhanh + dropdown user),
    │   │                    # quick-nav-dropdown (QuickNavDropdown variant user/admin — nhảy route nhanh từ header),
    │   │                    # user-menu (dropdown nội dung dùng chung header/sidebar),
    │   │                    # mobile-bottom-nav (khung BottomNav dùng chung + MobileBottomNav user + AdminMobileBottomNav),
    │   │                    # site-footer (footer info website, dùng chung cả user & admin)
    │   ├── sidebar/         # nav-data.ts (NAV_SECTIONS + BOTTOM_NAV — nguồn route duy nhất cho sidebar/header dropdown/bottom nav),
    │   │                    # nav-main.tsx (render NavSection từ nav-data), nav-user.tsx (trigger sidebar, dùng chung UserMenuContent), user-sidebar, admin-sidebar
    │   ├── auth/            # RequireRole.tsx (phân quyền), RequireAuth.tsx (chỉ cần đăng nhập — guard trang cá nhân), RequireLoginDialog.tsx (hộp thoại yêu cầu đăng nhập khi guest bấm tương tác), InitAuth.tsx (bootstrap token khi F5)
    │   ├── onboarding/      # PreferenceOnboardingGate (mount ở `(main)/layout.tsx`) + PreferenceOnboardingDialog (chọn thể loại sở thích, lưu `PUT /users/me`)
    │   ├── common/          # UI kit dùng chung: PageHeader, SectionHeader, EmptyState, ErrorState, DataPagination,
    │   │                    # PaginatedView, paginations/Pagination (PaginatedTable), ConfirmDialog, AppModal,
    │   │                    # SkeletonLoader, ThemeToggle; ErrorBoundary.tsx đã comment toàn bộ (không dùng)
    │   ├── motion/          # Motion primitives dùng chung: MotionReveal (Pattern B), MotionStagger + MotionItem (Pattern A)
    │   ├── admin/           # Kit CRUD admin 1 điểm render: data-table.tsx (DataTable<T> bảng md+ / card mobile + CrudTableSkeleton + extraActions),
    │   │                    # form-dialog.tsx (CrudFormDialog: RHF+zod, field text/textarea/select/multiselect + useCrudFormValues),
    │   │                    # crud-toolbar.tsx, delete-dialog.tsx (CrudDeleteDialog bọc ConfirmDialog), assign-roles-dialog.tsx
    │   ├── movie/           # Domain phim: MovieCard (hover overlay + actions), MovieRow (+MovieRowSkeleton, hàng ngang),
    │   │                    # MovieActions (1 nút Yêu thích = like; variant detail hiện số like realtime), MovieGrid (+MovieGridSkeleton), MovieFilters,
    │   │                    # MovieList, LatestMovies, MovieDetailView/Detail (chi tiết /movies/[id]), MovieRating (sao
    │   │                    # realtime), MovieComments (phân cấp + typing realtime), MovieViewCount (realtime),
    │   │                    # SimilarMovies (đã gọi useGetSimilarMovies → `/recommendations/similar/:id`; comment trong file còn ghi “placeholder” là stale),
    │   │                    # InteractionMovieList (dùng chung /my-history + /my-favorites: hàng poster + badge type + phân trang)
    │   ├── header/          # admin-header (logo Admin + QuickNavDropdown + nút về trang user + toggle theme + UserMenu)
    │   ├── dropdown/        # user-dropdown, notification-dropdown, streak-dropdown, dropdown-container
    │   ├── loading/         # AdminSkeletonLayout, redirecting, spining
    │   ├── custom-modal/    # Modal tùy chỉnh
    │   ├── extend-ui/       # input-multiselect (component mở rộng)
    │   └── theme-provider.tsx
    │
    ├── contexts/            # React context cũ
    │   ├── AuthContext.tsx  # ⚠ MOCK auth song song với useAuthStore — dọn dần, KHÔNG dùng cho code mới
    │   ├── AppContext.tsx, ColorContext.tsx
    │
    ├── lib/
    │   ├── axiosClient.ts   # Axios instance + interceptor (xem mục Kết nối API)
    │   ├── motion.ts        # Token/variant motion dùng chung (duration, stagger, cardVariants, listVariants…)
    │   ├── ReactQueryProvider.tsx # Provider cho @tanstack/react-query
    │   └── utils.ts         # Hàm cn() (clsx + tailwind-merge)
    │
    └── shared/
        ├── types/           # api.types.ts (ApiResponse, ApiPaginatedResponse, Pagination, User, Role, Genre…),
        │                    # ui.types.ts, global.d.ts
        ├── utils/           # snakeToCamel.ts (keysToCamel), formatting, helpers, roleUtil (mapRoleToCodes),
        │                    # admin-dashboard.ts (hàm thuần thống kê dashboard: top/bucket/phân bố, toCsv/downloadCsv),
        │                    # validation, mapStatus, http.ts (⚠ legacy — KHÔNG dùng)
        └── config/          # app.config.ts (hằng số app)
```

## Routes hiện có

| URL | File | Trạng thái |
|---|---|---|
| `/` | `src/app/(main)/(home)/page.tsx` | ✅ Thật (hero + hàng phim MovieRow, thể loại/quốc gia) |
| `/movies` | `src/app/(main)/movies/page.tsx` | ✅ Thật (danh sách phim, filter client-side, phân trang) |
| `/movies/[id]` | `src/app/(main)/movies/[id]/page.tsx` | ✅ Thật (chi tiết phim, đánh giá sao, bình luận + view count/like realtime, 1 nút Yêu thích) |
| `/my-history` | `src/app/(main)/my-history/page.tsx` | ✅ Thật (lịch sử xem — `GET /api/interactions/my-history`, cần đăng nhập: `RequireAuth` redirect kèm `return-page`) |
| `/my-favorites` | `src/app/(main)/my-favorites/page.tsx` | ✅ Thật (phim yêu thích — `GET /api/interactions/my-favorites`, cần đăng nhập) |
| `/auth/login` | `src/app/auth/login/page.tsx` (+ `login-form.tsx`, `google-button.tsx`) | ✅ Thật (API login + Google OAuth) |
| `/auth/signup` | `src/app/auth/signup/page.tsx` (+ `signup-form.tsx`) | ✅ Thật (API register) |
| `/auth/verify-email` | `src/app/auth/verify-email/page.tsx` (+ `verify-email.tsx`) | ✅ Thật (API verify-email) |
| `/auth/google-success` | `src/app/auth/google-success/page.tsx` | ✅ Thật (callback Google, đổi token) |
| `/profile` | `src/app/(main)/profile/page.tsx` (+ 4 form) | ✅ Thật (getMe, update profile, đổi mật khẩu, session) |
| `/setting/theme` | `src/app/(main)/setting/theme/page.tsx` | ✅ Thật (chọn theme/màu, next-themes) |
| `/notification` | `src/app/(main)/notification/page.tsx` | 🔲 Placeholder |
| `/about` | `src/app/(main)/about/page.tsx` | ✅ Trang thông tin tĩnh (server component) |
| `/contact` | `src/app/(main)/contact/page.tsx` | ✅ Trang thông tin tĩnh (server component, placeholder thông tin liên hệ) |
| `/privacy` | `src/app/(main)/privacy/page.tsx` | ✅ Trang thông tin tĩnh (server component) |
| `/terms` | `src/app/(main)/terms/page.tsx` | ✅ Trang thông tin tĩnh (server component) |
| `/dashboard` | `src/app/(admin-layout)/dashboard/page.tsx` (+ `dashboard-client.tsx`) | ✅ Thật — 6 thẻ chỉ số chính xác (`pagination.total`: phim/người dùng/thể loại/tương tác/đánh giá/bình luận) + 7 biểu đồ recharts (top phim xem nhiều, tương tác theo loại, top người dùng hoạt động, phân bố đánh giá 1–5 sao, phim theo thể loại, phim theo quốc gia, top phim điểm cao) + bảng "Hoạt động gần đây" + cảnh báo dữ liệu phim thiếu; toolbar lọc 7/30/90/Tất cả, "Làm mới", "Xuất CSV". Biểu đồ/bảng tổng hợp client-side từ ≤100 bản ghi mẫu (backend chưa có endpoint aggregate/sort/filter thời gian) — có ghi chú cỡ mẫu trên trang |
| `/admin/movies` | `src/app/(admin-layout)/admin/movies/page.tsx` (+ `movies-client.tsx`) | ✅ Thật — CRUD phim (multiselect thể loại/người, select quốc gia) |
| `/admin/genres` | `src/app/(admin-layout)/admin/genres/page.tsx` (+ `genres-client.tsx`) | ✅ Thật — CRUD thể loại |
| `/admin/countries` | `src/app/(admin-layout)/admin/countries/page.tsx` (+ `countries-client.tsx`) | ✅ Thật — CRUD quốc gia |
| `/admin/people` | `src/app/(admin-layout)/admin/people/page.tsx` (+ `people-client.tsx`) | ✅ Thật — CRUD diễn viên/đạo diễn |
| `/admin/users` | `src/app/(admin-layout)/admin/users/page.tsx` (+ `users-client.tsx`) | ✅ Thật — list/tìm kiếm, thêm (email/password), sửa fullName, xóa (không tự xóa mình), phân quyền (`AssignRolesDialog`) |
| `/admin/roles` | `src/app/(admin-layout)/admin/roles/page.tsx` (+ `roles-client.tsx`) | ✅ Thật — CRUD vai trò (backend GET không phân trang → envelope giả lập) |
| `/admin/interaction` | `src/app/(admin-layout)/admin/interaction/page.tsx` (+ `interaction-client.tsx`) | ✅ Thật — 3 tab read-only Tương tác/Đánh giá/Bình luận + xóa từng bản ghi |

Mẫu chung cho trang admin: trang server `export metadata` (title/description tiếng Việt) + `<PageHeader>` + component client `*-client.tsx` dùng kit `components/admin/` (DataTable/CrudFormDialog/CrudToolbar/CrudDeleteDialog + hooks `admin.ts`); phân quyền bằng `RequireRole(['ADMIN'])` bọc trong `AdminLayout`.

## Layout shell khu vực user (`UserLayout`)

`UserLayout` (`components/layout/UserLayout.tsx` — dùng cho guest + USER ở route group `(main)`):

- `SidebarProvider` + `UserSidebar`: sidebar **desktop (`md+`)**; mobile ẩn mặc định (chỉ mở tay qua Sheet của shadcn).
- `UserHeader` (`components/layout/user-header.tsx`): top header sticky — logo/link về `/`, toggle theme, dropdown **điều hướng nhanh** `QuickNavDropdown variant="user"` (nhảy route/tính năng nhanh không cần mở sidebar), dropdown tài khoản `UserMenu`; `SidebarTrigger` chỉ hiện `md+`.
- Content wrapper **block** `mx-auto w-full max-w-7xl min-w-0 flex-1` (không dùng flex row) + `SidebarInset` có `min-w-0` — fix lỗi scroll ngang toàn trang (trước đây flex item `w-full` có `min-width:auto` khiến overflow nội bộ hàng `MovieRow` đẩy ra ngoài trang).
- `SiteFooter` (`components/layout/site-footer.tsx`): footer info website — giới thiệu, Khám phá, Thông tin (About/Contact), Pháp lý (Chính sách/Điều khoản), social (placeholder `SOCIAL_LINKS` — chủ website điền URL thật), copyright.
- `MobileBottomNav` (`components/layout/mobile-bottom-nav.tsx`): khung `BottomNav` **dùng chung** (cố định `md:hidden`, chừa `env(safe-area-inset-bottom)`, item active theo pathname) cho 2 biến thể:
  - `MobileBottomNav` (user, đọc `BOTTOM_NAV.user`): guest Trang chủ/Phim/Đăng nhập — user + Thông báo/Tài khoản.
  - `AdminMobileBottomNav` (admin, đọc `BOTTOM_NAV.admin`): Tổng quan/Phim/Tương tác/Tài khoản/Hồ sơ.
- `SidebarInset` có `pb-16 md:pb-0` để không bị bottom nav che footer.
- Nội dung dropdown tài khoản **dùng chung** `UserMenuContent` (`components/layout/user-menu.tsx`) giữa header và sidebar (`nav-user.tsx`) — route shortcuts (Trang chủ, Phim, Lịch sử xem, Yêu thích, Hồ sơ, Thông báo, Dashboard nếu ADMIN), Đăng nhập/Đăng xuất.
- `<RequireLoginDialog />` mount trong `UserLayout`: guest bấm tương tác cần JWT (thích/yêu thích/muốn xem trên card, đánh giá/bình luận ở `/movies/[id]`) → hiện **hộp thoại** xác nhận, xác nhận mới chuyển `/auth/login?return-page=…` (không redirect ngay) — guard tập trung qua hook `useRequireLogin()` + `stores/require-login.store.ts`.

## Layout shell khu vực admin (`AdminLayout`)

`AdminLayout` (`components/layout/AdminLayout.tsx` — bọc `RequireRole(['ADMIN'])`, route group `(admin-layout)`):

- `SidebarProvider` + `AdminSidebar`: sidebar **desktop (`md+`)**; mobile ẩn, điều hướng qua `AdminMobileBottomNav`.
- `admin-header` (`components/header/admin-header.tsx`): sticky — logo "Admin" (link `/dashboard`), `QuickNavDropdown variant="admin"` (route quản trị nhanh), nút về trang người dùng `/`, toggle theme, `UserMenu` (dropdown tài khoản dùng chung).
- Content wrapper **block** `mx-auto w-full max-w-7xl min-w-0 flex-1` + `SidebarInset` `min-w-0` — cùng cách fix scroll ngang như `UserLayout` (bảng `DataTable` rộng cuộn trong khung `overflow-x-auto` của nó, không đẩy scroll ngang toàn trang).
- `SiteFooter` **dùng chung** với khu vực user; `SidebarInset` có `pb-16 md:pb-0` để bottom nav mobile không che nội dung.
- Điều hướng nhanh & bottom nav đọc từ `components/sidebar/nav-data.ts` (`NAV_SECTIONS`, `BOTTOM_NAV`) — sửa route chỉ cần sửa 1 chỗ.

## Kết nối API

### Env (`frontend/.env`)

```env
PORT=3002
NEXT_PUBLIC_API_BASE_URL=http://localhost:8081/api
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<Google OAuth client id>
NEXT_PUBLIC_TINYMCE_API_KEY=<TinyMCE key>
```

- `axiosClient` lấy `NEXT_PUBLIC_API_BASE_URL`; fallback mặc định trong code là `http://localhost:8000/api` (trùng port **Kong gateway** nếu gateway đang chạy — nếu không chạy gateway thì phải đặt env đúng `http://localhost:8081/api`).
- Không được hardcode URL backend ở bất kỳ đâu khác.

### `src/lib/axiosClient.ts` — làm gì

1. **Request interceptor**: gắn `Authorization: Bearer <accessToken>` từ `useAuthStore.getState().accessToken` (token sống in-memory trong zustand, không lưu localStorage).
2. **Response interceptor (thành công)**: chuyển **toàn bộ** key `snake_case` → `camelCase` bằng `keysToCamel` (`src/shared/utils/snakeToCamel.ts`) — nên code chỉ đọc camelCase.
3. **Response interceptor (401) — refresh single-flight**: nếu chưa `_retry` → gọi `POST /auth/refresh` (`withCredentials=true`) → lưu token mới vào store → retry request gốc; các request 401 khác xếp hàng (`failedQueue`) chờ token chung; refresh thất bại → `setAccessToken(null)` (bị đá về login).
4. **`parseAxiosError(error, customMessage?)`** → `{ statusCode, message }` — message đã là tiếng Việt, dùng để `toast.error(...)`.

### Envelope response (thống nhất từ backend)

**Thành công — object:**

```json
{
  "success": true,
  "statusCode": 201,
  "message": "Tạo bình luận thành công",
  "result": { "id": 15, "content": "Phim hay quá", "movieId": 603 }
}
```

**Thành công — danh sách (kèm phân trang):**

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Get movies successfully",
  "result": [{ "id": 1, "title": "The Matrix", "titleVi": "Ma Trận" }],
  "pagination": { "total": 100, "page": 1, "limit": 10, "totalPages": 10 }
}
```

**Lỗi:**

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Chưa đăng nhập hoặc token không hợp lệ",
  "errorCode": "Unauthorized",
  "timestamp": "2026-10-17T08:00:00.000Z",
  "path": "/api/auth/me"
}
```

- Luôn đọc dữ liệu ở **`res.result`** (danh sách: `res.result` + `res.pagination`) — **không** dùng `res.data`.
- Types sẵn có: `ApiResponse<T>`, `ApiPaginatedResponse<T>`, `Pagination`, `ApiErrorResponse` trong `src/shared/types/api.types.ts`.
- Lỗi hiển thị cho user qua `parseAxiosError` + `toast` (sonner), **không** tự bọc lại envelope.

### Refresh token flow (tóm tắt)

1. Đăng nhập thành công → `authApi.login` trả `result.accessToken` → `useAuthStore.setAccessToken` (in-memory); refresh token backend set httpOnly cookie.
2. F5 trang / callback Google → `useAuthStore.bootstrap()` (gọi `InitAuth`) → `POST /auth/refresh` → `GET /auth/me` → khôi phục `user`.
3. Request thường gặp 401 → interceptor refresh tự động → retry (single-flight, không gọi refresh song song).
4. Refresh fail → clear store → redirect `/auth/login?return-page=<path>` (xem `RequireRole`).

### Backend endpoints frontend sẽ gọi

| Method | Endpoint | Auth | Query/Body | Trả về (`result`) |
|---|---|---|---|---|
| GET | `/api/movies` | Public | `{ page, limit, keyword }` (keyword ILIKE `title`/`titleVi`; **không hỗ trợ filter genre/country/sort**) | `movie[]` (join genres, countries M2M, moviePeoples) + `pagination`, sort mặc định `createdAt DESC` |
| GET | `/api/movies/search` | Public | `{ page=1, limit=10, keyword?, sort=releaseDate:DESC, genreIds?, countryIds?, releaseYearFrom?, releaseYearTo? }` | `movie[]` + `pagination`; chỉ trả phim đủ `title/titleVi/releaseDate/overview/overviewVi/posterPath/backdropPath`; `sort` ∈ `releaseDate,voteAverage,viewCount,likeCount,createdAt` |
| GET | `/api/movies/:id` | Public | path `id` (**number**, bigint) | `movie` (kèm relations) |
| POST | `/api/movies/:id/view` | Optional JWT | — | `{ viewCount, score, interaction: 'created'\|'updated'\|'none' }` — luôn tăng `viewCount`; user đăng nhập mới tạo/tăng `click`; WS `movie-{id}-viewCount` |
| GET | `/api/genres` | Public | `{ page, limit, keyword }` | `genre[]` + `pagination` |
| GET | `/api/countries` | Public | `{ page, limit, keyword }` | `country[]` + `pagination` |
| GET | `/api/peoples` | Public | `{ page, limit, keyword }` | `people[]` + `pagination` |
| POST | `/api/ratings` | JWT | `{ rating: 0–5, movieId }` | `rating` — WS `movie-{id}-rating` (kèm `movieStats`) |
| GET | `/api/ratings/movie/:movieId` | Public | `{ page, limit }` | `rating[]` (join user) + `pagination` |
| GET | `/api/comments/movie/:movieId` | Public | `{ page, limit }`, `parentId?` | `comment[]` + `pagination`; root khi không truyền `parentId`; mỗi item có `replyCount` |
| POST | `/api/comments` | JWT | `{ content, movieId, parentId? }` | `comment` — WS `movie-{id}-comment` |
| POST | `/api/interactions` | JWT | `{ type: 'like', movieId }` — **không gửi `score`** | `{ success, action: 'added'\|'removed', type, score, likeCount, data? }` (**TOGGLE like** — đọc `result.action`/`result.likeCount`) |
| GET | `/api/interactions/stats/:movieId` | Public | — | `{ movieId, likeCount, commentCount, viewCount, ratingCount, voteAverage }` |
| GET | `/api/interactions/my-history` | JWT | `{ page, limit }` | `interaction[]` (`type=click`) + `pagination` |
| GET | `/api/interactions/my-favorites` | JWT | `{ page, limit }` | `interaction[]` (`type=like`) + `pagination` |
| GET | `/api/recommendations/similar/:id` | Public | path `id` (number), query `topK?` (mặc định 10) | `movie[]` kèm `similarityScore`, `rank` + `pagination` (envelope chuẩn) |
| GET | `/api/recommendations/semantic-search` | Public | `keyword?`, `topK?` | **stub** — `{status, message, data: []}` (không envelope) |
| GET | `/api/recommendations/hybrid-search` | Public | `{ userId (bắt buộc), keyword?, topK?, page?, pageSize? }` | **stub** — `{status, message, data: []}` (không envelope) |
| — | `/api/auth/*`, `/api/users`, `/api/roles` | — | — | Đã có api/hook (auth, user, role, genre) |

- **Search/recommendation đã có ở backend**: `/api/movies/search` là search nâng cao thật (home dùng qua `useLatestMovies`/`useTopRatedMovies`/`useMostViewedMovies` → `useSearchMovies`, `frontend/src/hooks/tankstack/useMovie.ts:99-173`); `/api/recommendations/similar/:id` là proxy thật sang ai-service và đã dùng ở `SimilarMovies`. `semantic-search`/`hybrid-search` mới là stub — chưa nối UI thật (xem V11 Phase 4).
- **Socket.IO cùng `:8081`** (CORS `origin: '*'`, không bắt buộc auth): server→client `movie-{id}-comment`, `movie-{id}-rating`, `movie-{id}-interaction`, `movie-{id}-viewCount`, `movie-{id}-typing`; client→server `typingComment` `{ movieId, isTyping, userFullName? }`. Trang chi tiết chỉ dùng **1 socket dùng chung** (`hooks/useMovieSocket.ts`), mỗi widget subscribe event của mình.
- **Rate limit**: global **100 request/phút** cho mọi request (fixed-window theo IP) + override theo endpoint (`/auth/login` 5/phút, `/auth/refresh` 10/phút, `/auth/register` 5/phút…) — tránh spam refetch (React Query `staleTime` 5 phút, debounce input tìm kiếm).
- ⚠ **`RolesGuard` chỉ được gắn ở `RolesController`** — các module movies/genres/countries/peoples/ratings/comments/users… có `@Roles(...)` nhưng **KHÔNG được enforce** ở backend; phân quyền admin hiện chủ yếu dựa vào phía client (`RequireRole`).

## Quy ước phát triển

Tóm tắt (chi tiết, bắt buộc: [FRONTEND_RULES.md](./FRONTEND_RULES.md)):

- **Response**: mọi API trả envelope `{success, statusCode, message, result, pagination?}` — luôn đọc `res.result`; lỗi qua `parseAxiosError`.
- **Thư viện**: state toàn cục → zustand; server state → React Query (`src/hooks/tankstack`, queryKey `['domain','action']`); HTTP → `axiosClient` (không `fetch`, không `http.ts`); form → react-hook-form + zod; toast → sonner; UI → shadcn/ui + Tailwind v4; icon → lucide-react.
- **UI**: shadcn style `new-york`, dark mode class-based, design token trong `globals.css` (CSS variable, không hardcode hex), text tiếng Việt.
- **Responsive**: mobile-first, grid phim ≥2 cột mobile → 4–6 cột desktop, touch target ≥44px, kiểm tra width 375px.
- **Mượt**: skeleton/loading cho mọi trang, optimistic update khi toggle tương tác, debounced search, giữ tỉ lệ poster `aspect-[2/3]` tránh layout shift.
- **Thêm API mới**: `src/apis/<domain>.api.ts` → hook trong `src/hooks/tankstack/` → trang vào route group đúng (`(main)` user / `(admin-layout)` admin) → thêm route vào `components/sidebar/nav-data.ts` (`NAV_SECTIONS`, và `BOTTOM_NAV` nếu cần hiện ở bottom nav mobile) — **không copy danh sách route vào từng component nav/dropdown**.
- **Auth/roles**: chỉ dùng `useAuthStore` (không dùng mock `AuthContext`), trang admin bọc `RequireRole(['ADMIN'])`.
- **Git**: không commit/push khi chưa được yêu cầu.

## UI kit dùng chung (`src/components/common`)

Quy ước: **UI nào lặp lại phải là component dùng chung** — mỗi domain không tự viết lại markup. Chi tiết kế hoạch: [plans/V13_frontend_ui-reuse.md](./plans/V13_frontend_ui-reuse.md).

| Component | Vai trò | Props chính |
|---|---|---|
| `PageHeader` | Tiêu đề trang — định nghĩa **duy nhất** cho block `text-3xl font-extrabold` + mô tả | `title`, `description?`, `actions?`, `className?` |
| `SectionHeader` | Tiêu đề một mục trong trang | `title`, `description?`, `action?`, `className?` |
| `EmptyState` | Trạng thái rỗng cho danh sách | `icon?` (LucideIcon), `title?`, `description?`, `action?`, `className?` |
| `ErrorState` | Trạng thái lỗi + nút thử lại | `title?`, `description?`, `onRetry?`, `retryText?`, `action?`, `className?` |
| `DataPagination` | Control phân trang (presentational — **điểm duy nhất** render phân trang) | `page`, `totalPages`, `total?`, `onPageChange`, `disabled?`, `className?`, `ariaLabel?` |
| `PaginatedView` | Bọc danh sách phân trang **client-side** (đã có sẵn toàn bộ dữ liệu) | `data`, `itemsPerPage?`, `renderContent`, `resetDependency?` |
| `PaginatedTable` (`common/paginations/Pagination.tsx`) | Khung danh sách phân trang **server-side** cho admin (đọc envelope `result` + `pagination`) | `queryKeyName`, `fetchFn`, `ContentComponent`, `title?`, `staleTime?`, `gcTime?`, `pageSizeOptions?` |
| `DataTable` (`admin/data-table.tsx`) | Bảng CRUD admin dùng chung — bảng md+ (`overflow-x-auto`) + card list mobile; cột khai báo `columns`; Sửa/Xóa + `extraActions` qua props | `columns`, `items`, `rowKey`, `onEdit?`, `onDelete?`, `canEdit?`, `canDelete?`, `extraActions?`, `empty?` |
| `CrudTableSkeleton` (`admin/data-table.tsx`) | Skeleton bảng admin khi lần đầu tải | `rows?`, `columns?` |
| `CrudFormDialog` (`admin/form-dialog.tsx`) | Dialog form CRUD (RHF + zod, error inline tiếng Việt); field `text`/`textarea`/`select`/`multiselect` | `open`, `onOpenChange`, `title`, `schema`, `fields`, `defaultValues`, `onSubmit`, `submitting?` |
| `CrudToolbar` (`admin/crud-toolbar.tsx`) | Toolbar tìm kiếm (debounce do `useCrudPage` xử lý) + nút thêm | `keyword`, `onKeywordChange`, `onAdd`, `addLabel?`, `searchPlaceholder?`, `hideAdd?` |
| `CrudDeleteDialog` (`admin/delete-dialog.tsx`) | Hộp thoại xác nhận xóa (bọc `ConfirmDialog`) | `target` (`{id, label}` hoặc `null`), `onConfirm`, `onCancel`, `isPending?`, `entityLabel?` |
| `AssignRolesDialog` (`admin/assign-roles-dialog.tsx`) | Phân quyền user (gọi `PATCH /users/:id/roles`), tái sử dụng `CrudFormDialog` | `user` (`null` = đóng), `onCancel` |
| `ConfirmDialog` | Hộp thoại xác nhận | `isOpen`, `title`, `description`, `onConfirm`, `onCancel`, `confirmText?`, `cancelText?`, `variant?` |
| `AppModal` | Modal có portal + kích thước | `isShowingModal`, `toggleModal`, `title`, `children`, `size?` |
| `SkeletonLoader` | Skeleton danh sách/bảng dùng chung | `rows?`… |

Ghi chú:

- `DataPagination` là nơi duy nhất render control phân trang; cả `PaginatedView` (client) và `PaginatedTable` (server) đều tái sử dụng nó.
- `PaginatedTable` trước đây đọc sai envelope (`data.data.pagination.totalItems`); đã sửa về `result` + `pagination { total, page, limit, totalPages }` (khớp `FRONTEND_RULES` §1).
- `ErrorBoundary.tsx` đã bị comment toàn bộ trong repo (không dùng) — không nằm trong UI kit.

## Motion dùng chung (`src/lib/motion.ts` + `src/components/motion`)

Chi tiết quy tắc: [`FRONTEND_RULES.md` §6](./FRONTEND_RULES.md#6-motion--animation-card-). Package: **`motion`** (import `motion/react`).

| File/Component | Vai trò |
|---|---|
| `lib/motion.ts` | Token/variant dùng chung: `MOTION_DURATION`, `MOTION_DURATION_FAST`, `MOTION_STAGGER`, `MOTION_MAX_DELAY`, `MOTION_EASE`, `MOTION_TRANSITION`, `cardVariants`, `listVariants`, `fadeUpVariants`, `fadeVariants`, `revealDelay()` |
| `MotionStagger` | Pattern A — parent stagger cho grid/list (`when="mount"` mặc định, `when="in-view"` cho list dài). Con là `MovieCard` hoặc `MotionItem` |
| `MotionReveal` | Pattern B — fade-up cho card lẻ/carousel, delay theo `index` (giới hạn `MOTION_MAX_DELAY`), `when="mount" \| "in-view"` |
| `MotionItem` | Item con cho `MotionStagger` khi không phải `MovieCard` |

Đã áp dụng: `MovieCard` (entrance + hover elevation), `MovieGrid`/`MovieColumn` (stagger), `MovieRow` (Pattern B), `PageHeader`/`SectionHeader`/`EmptyState`/`ErrorState`/`DataTable` (fade-up nhẹ). Tất cả tôn trọng `prefers-reduced-motion` qua `useReducedMotion()`.

## Ủng hộ/known issues

- ✅ **Các trang auth + `/profile` + `/setting/theme` đã hoạt động thật** với backend; envelope + refresh token đã chạy ổn định; Design tokens, sidebar, phân quyền (`RequireRole`, `RoleLayout`) đã sẵn sàng làm nền.
- ✅ **`frontend/node_modules` và `package-lock.json` đã có trong workspace** (kiểm tra 2026-11-04) — vẫn nên chạy `npm install` khi clone mới/đổi dependency.
- ⚠ **Mock `AuthContext` còn song song** với `useAuthStore` (`src/contexts/AuthContext.tsx`, `src/hooks/useAuth.ts`, `AppContext`) — code mới chỉ dùng `useAuthStore`, dọn dần mock.
- ⚠ **Folder `src/hooks/tankstack/` sai chính tả** (`tankstack` thay vì `tanstack`) — **giữ nguyên tên folder** để không phá import hiện hữu.
- ⚠ **`react-router-dom`, `react-icons` không dùng trong App Router**; **`socket.io-client` đã dùng (Phase 2)**; **`recharts` đã dùng ở Dashboard admin (Phase 5)**.
- ⚠ **`src/shared/utils/http.ts` là legacy (dùng `fetch`)** — không được dùng, chỉ dùng `axiosClient`.
- **Nav group "Interaction"** nằm trong `components/sidebar/nav-data.ts` (không phải `nav-main.tsx`) — gộp còn 1 mục "Tương tác" → `/admin/interaction` (4 route `/interaction/*` cũ đều không tồn tại).
- ✅ **Type `Pagination`** trong `api.types.ts` đã chuẩn hoá về `{ total, page, limit, totalPages }` khớp payload backend; `DataPagination` dùng chung cho mọi nơi hiển thị phân trang.
- ⚠ **Route handler `src/app/api/*` chỉ là stub** trả JSON rỗng — không phải nơi gọi backend.
- ✅ **`movie-filter.store.ts`** đã có state filter (keyword, genreId, countryId, sort, page, limit) + `setFilter/setPage/resetFilter`.
- ⚠ **`GET /api/movies` chỉ hỗ trợ `page/limit/keyword`** — trang `/movies` vẫn lọc/sắp xếp **client-side** trên trang hiện tại (`movie-list.tsx:64-89`). Backend đã có `GET /api/movies/search` (filter `genreIds/countryIds/releaseYearFrom/releaseYearTo`, sort server-side) nhưng **trang danh sách chưa chuyển sang dùng** — cần xác minh/đề xuất khi muốn filter toàn bộ dữ liệu.
- ⚠ **Lệch shape quốc gia**: backend `MovieResponseDto` trả `countries: Country[]` (`movie-response.dto.ts:82-84`), nhưng type FE `Movie` khai báo `country?: Country` (`movie.types.ts:61`) và `movie-list.tsx:80` / `movie-detail.tsx:82-85` đọc `movie.country` → filter/hiển thị quốc gia có thể không chạy đúng; **cần xác minh runtime** và thống nhất `countries` vs `country`.
- ⚠ **Recommendation**: `similar` đã dùng thật; `semantic-search`/`hybrid-search` ở backend còn stub, FE có api/hook (`recommendation.api.ts`, `useRecommendation.ts`) nhưng chưa nối UI. ai-service `/search` được cho là lỗi 500 (xem `docs/AI-SERVICE.md`) — cần xác minh runtime trước khi tích hợp.
- ⚠ **`RolesGuard` không được enforce** ở hầu hết module backend — không dựa vào backend để bảo vệ trang admin; dùng `RequireRole(['ADMIN'])` ở client và cẩn trọng khi ẩn/hiện hành động quản trị.
- ⚠ **`id` của movie/genre/country/people là number** (bigint) — route động `/movies/[id]` nhận string, phải parse sang number trước khi gọi API.
