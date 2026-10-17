# FRONTEND — Next.js (movie-recommendation)

> Tài liệu hiện trạng frontend. Quy tắc bắt buộc khi viết code xem [FRONTEND_RULES.md](./FRONTEND_RULES.md). Kế hoạch triển khai UI xem [plans/V11_frontend_ui-roadmap.md](./plans/V11_frontend_ui-roadmap.md).

## About

- Frontend là lớp giao diện web của dự án **"Ứng dụng mô hình ngôn ngữ vào hệ thống gợi ý phim"**, nằm ở thư mục `frontend/`, chạy **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS v4 + shadcn/ui**.
- Vai trò chính: hiển thị danh sách/chi tiết phim, tìm kiếm, tương tác người dùng (đánh giá, bình luận, yêu thích, lịch sử xem) và khu vực quản trị (CRUD) cho admin.
- Giao tiếp **trực tiếp** với backend NestJS tại `http://localhost:8081/api` từ trình duyệt (không qua tầng BFF), thông qua `axiosClient` ở `frontend/src/lib/axiosClient.ts` với `withCredentials=true` (refresh token nằm trong httpOnly cookie của backend).
- **Backend NestJS KHÔNG có endpoint search/recommendation** — recommendation do ai-service (FastAPI `:8082`, prefix `/api/recommendations`) cung cấp; backend ↔ ai-service giao tiếp qua RabbitMQ (không HTTP-call lẫn nhau).
- Hạ tầng có **Kong gateway (`gateway/kong.yml`, `:8000`)**: `/api` → `8081`, `/api/recommendations` → `8082`; hiện frontend trong code **chưa dùng gateway**, đang gọi thẳng `:8081` và **chưa có client nào gọi ai-service**.
- Port dev: **3002** — script `npm run dev` chạy `next dev -p 3002`; backend đã cho phép CORS với `http://localhost:3002`.
- Ngôn ngữ giao diện: **tiếng Việt**; có dark mode (class-based qua `next-themes`).
- ⚠ **`frontend/node_modules` chưa được cài** — phải chạy `npm install` trong `frontend/` trước khi `npm run dev` / `npm run build`.

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
| `recharts` | `^3.10.1` | Biểu đồ cho Dashboard admin (**đã cài, chưa dùng**) |
| `socket.io-client` | `^4.8.3` | Realtime (comment/rating/viewCount/typing) (**đã cài, chưa dùng**) |
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
    │   │   ├── layout.tsx   # "/" → render trần; path khác → bọc RoleLayout/UserLayout
    │   │   ├── (home)/page.tsx        # / — trang chủ (placeholder)
    │   │   ├── notification/page.tsx  # /notification (placeholder)
    │   │   ├── profile/               # /profile — THẬT (ProfileForm, UserProfileForm, UpdatePasswordForm, UserSessionForm)
    │   │   └── setting/theme/page.tsx # /setting/theme — THẬT (chọn theme/màu)
    │   ├── (admin-layout)/  # Route group cho ADMIN
    │   │   ├── layout.tsx / error.tsx / loading.tsx   # Layout admin, error boundary, skeleton
    │   │   ├── dashboard/page.tsx     # /dashboard (placeholder)
    │   │   └── admin/                 # /admin/* — 7 trang placeholder:
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
    │   ├── user.api.ts      # Quản lý tài khoản
    │   └── role.api.ts      # Quản lý vai trò
    │
    ├── hooks/
    │   ├── tankstack/       # ⚠ Typo cố ý — GIỮ NGUYÊN tên folder: hook @tanstack/react-query
    │   │   ├── useAuthApi.ts   # Query/mutation auth
    │   │   ├── useGenre.ts     # useGetAll (staleTime 5 phút) + useCreateGenre (mẫu chuẩn)
    │   │   └── useUser.ts      # Quản lý user
    │   ├── useAuth.ts       # ⚠ Đang đọc mock AuthContext — sẽ dọn khi chuyển hẳn useAuthStore
    │   ├── use-mobile.ts, useBreadCrumb.ts, useClickOutside.ts, useColor.ts, useHover.ts
    │
    ├── stores/              # ZUSTAND — state toàn cục
    │   ├── auth.store.ts        # accessToken in-memory, user, bootstrap/refresh/logout
    │   └── movie-filter.store.ts # Filter state trang phim (keyword, genreId, countryId, sort, page, limit)
    │
    ├── components/
    │   ├── ui/              # shadcn/ui sinh từ CLI (button, dialog, table, sidebar, sonner…)
    │   ├── layout/          # UserLayout.tsx, AdminLayout.tsx, RoleLayout.tsx (bọc theo role)
    │   ├── sidebar/         # nav-main.tsx (dataBar nhiều group), nav-user.tsx, user-sidebar, admin-sidebar
    │   ├── auth/            # RequireRole.tsx (phân quyền), InitAuth.tsx (bootstrap token khi F5)
    │   ├── common/          # UI kit dùng chung: PageHeader, SectionHeader, EmptyState, ErrorState, DataPagination,
    │   │                    # PaginatedView, paginations/Pagination (PaginatedTable), ConfirmDialog, AppModal,
    │   │                    # SkeletonLoader, ThemeToggle; ErrorBoundary.tsx đã comment toàn bộ (không dùng)
    │   ├── movie/           # Domain phim: MovieCard, MovieGrid (+MovieGridSkeleton), MovieFilters, MovieList, LatestMovies
    │   ├── header/          # admin-header
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
    │   ├── ReactQueryProvider.tsx # Provider cho @tanstack/react-query
    │   └── utils.ts         # Hàm cn() (clsx + tailwind-merge)
    │
    └── shared/
        ├── types/           # api.types.ts (ApiResponse, ApiPaginatedResponse, Pagination, User, Role, Genre…),
        │                    # ui.types.ts, global.d.ts
        ├── utils/           # snakeToCamel.ts (keysToCamel), formatting, helpers, roleUtil (mapRoleToCodes),
        │                    # validation, mapStatus, http.ts (⚠ legacy — KHÔNG dùng)
        └── config/          # app.config.ts (hằng số app)
```

## Routes hiện có

| URL | File | Trạng thái |
|---|---|---|
| `/` | `src/app/(main)/(home)/page.tsx` | 🔲 Placeholder (mới có tiêu đề "Trang chủ" + UserDropdown) |
| `/auth/login` | `src/app/auth/login/page.tsx` (+ `login-form.tsx`, `google-button.tsx`) | ✅ Thật (API login + Google OAuth) |
| `/auth/signup` | `src/app/auth/signup/page.tsx` (+ `signup-form.tsx`) | ✅ Thật (API register) |
| `/auth/verify-email` | `src/app/auth/verify-email/page.tsx` (+ `verify-email.tsx`) | ✅ Thật (API verify-email) |
| `/auth/google-success` | `src/app/auth/google-success/page.tsx` | ✅ Thật (callback Google, đổi token) |
| `/profile` | `src/app/(main)/profile/page.tsx` (+ 4 form) | ✅ Thật (getMe, update profile, đổi mật khẩu, session) |
| `/setting/theme` | `src/app/(main)/setting/theme/page.tsx` | ✅ Thật (chọn theme/màu, next-themes) |
| `/notification` | `src/app/(main)/notification/page.tsx` | 🔲 Placeholder |
| `/dashboard` | `src/app/(admin-layout)/dashboard/page.tsx` | 🔲 Placeholder |
| `/admin/movies` | `src/app/(admin-layout)/admin/movies/page.tsx` | 🔲 Placeholder |
| `/admin/genres` | `src/app/(admin-layout)/admin/genres/page.tsx` | 🔲 Placeholder |
| `/admin/countries` | `src/app/(admin-layout)/admin/countries/page.tsx` | 🔲 Placeholder |
| `/admin/people` | `src/app/(admin-layout)/admin/people/page.tsx` | 🔲 Placeholder |
| `/admin/users` | `src/app/(admin-layout)/admin/users/page.tsx` | 🔲 Placeholder |
| `/admin/roles` | `src/app/(admin-layout)/admin/roles/page.tsx` | 🔲 Placeholder |
| `/admin/interaction` | `src/app/(admin-layout)/admin/interaction/page.tsx` | 🔲 Placeholder |

Mẫu chung cho trang admin placeholder: `export metadata` (title/description tiếng Việt) + `<h2>` tiêu đề + `div.flex.flex-col.gap-4` khung nội dung.

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
| GET | `/api/movies` | Public | `{ page, limit, keyword }` (keyword ILIKE `title`/`titleVi`; **không hỗ trợ filter genre/country/sort**) | `movie[]` (join genres, country, peoples) + `pagination`, sort mặc định `createdAt DESC` |
| GET | `/api/movies/:id` | Public | path `id` (**number**, bigint) | `movie` (kèm relations) |
| POST | `/api/movies/:id/view` | Optional JWT | — | `{ viewCount }` — anti-spam 1 lần/user/movie, WS `movie-{id}-viewCount` |
| GET | `/api/genres` | Public | `{ page, limit, keyword }` | `genre[]` + `pagination` |
| GET | `/api/countries` | Public | `{ page, limit, keyword }` | `country[]` + `pagination` |
| GET | `/api/peoples` | Public | `{ page, limit, keyword }` | `people[]` + `pagination` |
| POST | `/api/ratings` | JWT | `{ rating: 0–5, movieId }` | `rating` — WS `movie-{id}-rating` (kèm `movieStats`) |
| GET | `/api/ratings/movie/:movieId` | Public | `{ page, limit }` | `rating[]` (join user) + `pagination` |
| GET | `/api/comments/movie/:movieId` | Public | `{ page, limit }`, `parentId?` | `comment[]` + `pagination`; root khi không truyền `parentId`; mỗi item có `replyCount` |
| POST | `/api/comments` | JWT | `{ content, movieId, parentId? }` | `comment` — WS `movie-{id}-comment` |
| POST | `/api/interactions` | JWT | `{ score?, type, movieId }` — `type` ∈ `like\|dislike\|favorite\|watchlist\|rating\|comment\|click` | `{ success, action: 'added'\|'removed', type, data? }` (**TOGGLE** — đọc `result.action`) |
| GET | `/api/interactions/my-history` | JWT | `{ page, limit }` | `interaction[]` (`type=click`) + `pagination` |
| GET | `/api/interactions/my-favorites` | JWT | `{ page, limit }` | `interaction[]` (`type ∈ like\|favorite\|watchlist`) + `pagination` |
| — | `/api/auth/*`, `/api/users`, `/api/roles` | — | — | Đã có api/hook (auth, user, role, genre) |

- Endpoint recommendation/tìm kiếm ngữ nghĩa **chưa có ở backend** — ai-service cung cấp qua `/api/recommendations` (gateway `:8000` → `:8082`); cần chốt cách gọi trước khi làm (xem V11 Phase 4).
- **Socket.IO cùng `:8081`** (CORS `origin: '*'`, không bắt buộc auth): server→client `movie-{id}-comment`, `movie-{id}-rating`, `movie-{id}-viewCount`, `movie-{id}-typing`; client→server `typingComment` `{ movieId, isTyping, userFullName? }`.
- **Rate limit**: global **100 request/phút** cho mọi request (fixed-window theo IP) + override theo endpoint (`/auth/login` 5/phút, `/auth/refresh` 10/phút, `/auth/register` 5/phút…) — tránh spam refetch (React Query `staleTime` 5 phút, debounce input tìm kiếm).
- ⚠ **`RolesGuard` chỉ được gắn ở `RolesController`** — các module movies/genres/countries/peoples/ratings/comments/users… có `@Roles(...)` nhưng **KHÔNG được enforce** ở backend; phân quyền admin hiện chủ yếu dựa vào phía client (`RequireRole`).

## Quy ước phát triển

Tóm tắt (chi tiết, bắt buộc: [FRONTEND_RULES.md](./FRONTEND_RULES.md)):

- **Response**: mọi API trả envelope `{success, statusCode, message, result, pagination?}` — luôn đọc `res.result`; lỗi qua `parseAxiosError`.
- **Thư viện**: state toàn cục → zustand; server state → React Query (`src/hooks/tankstack`, queryKey `['domain','action']`); HTTP → `axiosClient` (không `fetch`, không `http.ts`); form → react-hook-form + zod; toast → sonner; UI → shadcn/ui + Tailwind v4; icon → lucide-react.
- **UI**: shadcn style `new-york`, dark mode class-based, design token trong `globals.css` (CSS variable, không hardcode hex), text tiếng Việt.
- **Responsive**: mobile-first, grid phim ≥2 cột mobile → 4–6 cột desktop, touch target ≥44px, kiểm tra width 375px.
- **Mượt**: skeleton/loading cho mọi trang, optimistic update khi toggle tương tác, debounced search, giữ tỉ lệ poster `aspect-[2/3]` tránh layout shift.
- **Thêm API mới**: `src/apis/<domain>.api.ts` → hook trong `src/hooks/tankstack/` → trang vào route group đúng (`(main)` user / `(admin-layout)` admin) → thêm nav vào `nav-main.tsx`/`nav-user.tsx`.
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
| `ConfirmDialog` | Hộp thoại xác nhận | `isOpen`, `title`, `description`, `onConfirm`, `onCancel`, `confirmText?`, `cancelText?`, `variant?` |
| `AppModal` | Modal có portal + kích thước | `isShowingModal`, `toggleModal`, `title`, `children`, `size?` |
| `SkeletonLoader` | Skeleton danh sách/bảng dùng chung | `rows?`… |

Ghi chú:

- `DataPagination` là nơi duy nhất render control phân trang; cả `PaginatedView` (client) và `PaginatedTable` (server) đều tái sử dụng nó.
- `PaginatedTable` trước đây đọc sai envelope (`data.data.pagination.totalItems`); đã sửa về `result` + `pagination { total, page, limit, totalPages }` (khớp `FRONTEND_RULES` §1).
- `ErrorBoundary.tsx` đã bị comment toàn bộ trong repo (không dùng) — không nằm trong UI kit.

## Ủng hộ/known issues

- ✅ **Các trang auth + `/profile` + `/setting/theme` đã hoạt động thật** với backend; envelope + refresh token đã chạy ổn định; Design tokens, sidebar, phân quyền (`RequireRole`, `RoleLayout`) đã sẵn sàng làm nền.
- ⚠ **`frontend/node_modules` chưa cài** — phải chạy `npm install` trong `frontend/` trước khi dev/build (agent không tự cài).
- ⚠ **Mock `AuthContext` còn song song** với `useAuthStore` (`src/contexts/AuthContext.tsx`, `src/hooks/useAuth.ts`, `AppContext`) — code mới chỉ dùng `useAuthStore`, dọn dần mock.
- ⚠ **Folder `src/hooks/tankstack/` sai chính tả** (`tankstack` thay vì `tanstack`) — **giữ nguyên tên folder** để không phá import hiện hữu.
- ⚠ **`recharts` và `socket.io-client` đã cài nhưng chưa dùng** (chờ Phase 2/5 trong plan V11); `react-router-dom`, `react-icons` cũng không dùng trong App Router.
- ⚠ **`src/shared/utils/http.ts` là legacy (dùng `fetch`)** — không được dùng, chỉ dùng `axiosClient`.
- ⚠ **Nav group "Interaction" trong `nav-main.tsx` trỏ `/interaction/*`** nhưng hiện chưa có route nào khớp (trang thật là `/admin/interaction`) — cần sửa khi làm Phase 5.
- ✅ **Type `Pagination`** trong `api.types.ts` đã chuẩn hoá về `{ total, page, limit, totalPages }` khớp payload backend; `DataPagination` dùng chung cho mọi nơi hiển thị phân trang.
- ⚠ **Route handler `src/app/api/*` chỉ là stub** trả JSON rỗng — không phải nơi gọi backend.
- ✅ **`movie-filter.store.ts`** đã có state filter (keyword, genreId, countryId, sort, page, limit) + `setFilter/setPage/resetFilter`.
- ⚠ **`GET /api/movies` chỉ hỗ trợ `page/limit/keyword`** — chưa có filter theo thể loại/quốc gia hay tham số `sort`; muốn filter theo thể loại/quốc gia cần backend bổ sung query param (đề xuất plan backend) hoặc lọc client-side trên trang hiện tại.
- ⚠ **Không có endpoint recommendation/search ở backend** — recommendation nằm ở ai-service (`/api/recommendations`, qua gateway `:8000`); frontend cần chốt cách gọi và chờ ai-service fix lỗi 500 + CORS (V11 Phase 4).
- ⚠ **`RolesGuard` không được enforce** ở hầu hết module backend — không dựa vào backend để bảo vệ trang admin; dùng `RequireRole(['ADMIN'])` ở client và cẩn trọng khi ẩn/hiện hành động quản trị.
- ⚠ **`id` của movie/genre/country/people là number** (bigint) — route động `/movies/[id]` nhận string, phải parse sang number trước khi gọi API.
