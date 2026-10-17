# FRONTEND_RULES — Quy tắc code frontend (BẮT BUỘC)

Tài liệu này quy định các quy tắc **bắt buộc** khi viết/sửa code trong `frontend/` của dự án movie-recommendation, nhằm giữ tính nhất quán về kiến trúc (folder-by-type, axiosClient + envelope, zustand + React Query), về UI (shadcn/ui + Tailwind v4, dark mode, tiếng Việt) và về chất lượng trải nghiệm (responsive, loading, optimistic update). Người/agent viết code mới phải tuân theo toàn bộ danh sách dưới đây; mọi ngoại lệ phải được developer đồng ý trước. Tài liệu tổng quan frontend xem [FRONTEND.md](./FRONTEND.md).

## 1. Quy ước response (bắt buộc)

- **Mọi API backend trả về envelope thống nhất**: thành công đơn `{ success, statusCode, message, result }`; danh sách thêm `pagination`; lỗi `{ success: false, statusCode, message, errorCode?, timestamp, path }`.
- Trong `src/apis/*.api.ts` phải khai báo return type `Promise<ApiResponse<T>>` hoặc `Promise<ApiPaginatedResponse<T>>` (types ở `src/shared/types/api.types.ts`).
- **LUÔN đọc dữ liệu ở `response.result`** (danh sách: `response.result` + `response.pagination`) — **không** đọc `response.data`, không đọc `res.data.result`.
- Khi viết hook React Query, trả về `response.result` (ví dụ `const res = await genreApi.getAll(); return res.result;`).
- Với API toggle (`POST /api/interactions`), đọc `result.action` (`'added'` / `'removed'`) để biết trạng thái thực — không giả định luôn là "thêm mới".
- Mọi lỗi API phải xử lý qua `parseAxiosError(error)` trong `src/lib/axiosClient.ts` để lấy `{ statusCode, message }`, rồi hiển thị `toast.error(...)` với message tiếng Việt.
- **KHÔNG tự bọc lại envelope** ở tầng api/hook/component (không tạo thêm `{ data, success, message }` trung gian).
- Không giả định field của lỗi; chỉ dùng `statusCode` + `message` từ `parseAxiosError` (lỗi ≥500 được chuẩn hóa thành "Lỗi máy chủ, vui lòng thử lại sau.").

## 2. Thư viện bắt buộc (không tự thay thế)

- State toàn cục (auth, filter, UI state dùng chung) → **zustand**, khai báo trong `src/stores/*.store.ts`, không dùng Redux/Context mới.
- Server state / cache dữ liệu API → **@tanstack/react-query v5**, hook đặt trong `src/hooks/tankstack/` (giữ nguyên tên folder).
- `queryKey` chuẩn theo mảng phẳng `['domain', 'action']` (ví dụ `['movies']`, `['movie', id]`, `['comments', movieId]`), không dùng object trong key.
- `staleTime` mặc định **5 phút** (`1000 * 60 * 5`) cho dữ liệu ít đổi; mutation xong phải `invalidateQueries` theo đúng queryKey.
- HTTP → **`axiosClient`** từ `src/lib/axiosClient.ts`; **cấm** dùng `fetch` trực tiếp và **cấm** dùng `src/shared/utils/http.ts` (legacy).
- Form → **react-hook-form** + **zod** (+ `@hookform/resolvers/zod`), không tự viết validation tay cho form.
- Toast → **sonner** (`toast.success` / `toast.error`), không dùng `alert()`.
- UI component → **shadcn/ui** (`src/components/ui`) + **Tailwind CSS v4**; không thêm thư viện UI mới khi shadcn đã có.
- Icon → **lucide-react**; **cấm dùng emoji làm icon** trong UI.
- Đăng nhập Google → `@react-oauth/google`; biểu đồ admin → `recharts`; realtime → `socket.io-client` (chỉ dùng khi backend đã có event tương ứng).

## 3. UI / style — Tailwind CSS v4 + shadcn/ui (bắt buộc)

- **UI stack bắt buộc**: mọi giao diện mới phải dựng từ component **shadcn/ui** (`src/components/ui`) + utility **Tailwind CSS v4** — không viết giao diện bằng inline style, không tạo "div thuần + CSS tay" khi shadcn đã có component tương đương (Button, Card, Dialog, DropdownMenu, Select, Sheet, Table, Sidebar…).
- Component shadcn chưa có → thêm vào `src/components/ui` theo đúng cấu trúc style **`new-york`** của `components.json` (`npx shadcn add <component>` hoặc tạo file cùng pattern) — **không** đặt trong folder domain và không nhân bản sang nhiều nơi.
- Trước khi tạo component UI mới phải **kiểm tra tái sử dụng** theo thứ tự: `src/components/common` (UI kit: PageHeader, SectionHeader, EmptyState, ErrorState, DataPagination…) → `src/components/ui` (shadcn) → component domain sẵn có. **Không duplicate** cùng một UI ở nhiều domain (mỗi domain tự viết code UI riêng = hỏng).
- Dùng đúng `variant`/`size` có sẵn của component shadcn; cần biến thể thì mở rộng bằng `cn(...)`/props, không copy toàn bộ file component ra để sửa.
- Component shadcn sinh bằng style **`new-york`** theo `components.json`; không đổi style/baseColor toàn cục khi chưa hỏi developer.
- Dark mode là **class-based** qua `next-themes` (`attribute="class"`, class `.dark`) — không tự thêm cơ chế theme khác.
- Mọi màu sắc phải dùng **design token trong `src/app/globals.css`** qua CSS variable/Tailwind semantic class (`bg-background`, `text-foreground`, `border-border`, `bg-primary`…) — **cấm hardcode hex** trong component.
- Tailwind v4 CSS-first: **không tạo `tailwind.config.js`**; token khai báo trong `globals.css` (`@theme inline`, `:root`, `.dark`).
- Toàn bộ text hiển thị cho người dùng phải là **tiếng Việt** (kể cả `metadata.title/description`, empty state, nhãn nút, thông báo lỗi).
- Typography theo các class đang dùng trong project (`text-3xl font-extrabold` cho tiêu đề trang, `text-gray-500 dark:text-gray-400` cho mô tả) — không tự ý tạo scale mới.
- Bo góc dùng `--radius` (0.625rem) qua class `rounded-lg/md/sm`, không hardcode `rounded-[10px]`.
- Component/trang mới phải kiểm tra cả **light & dark mode** và **width 375px** trước khi nhận là xong.
- Glassmorphism/`backdrop-blur`: chỉ dùng khi nền **trong suốt** (vd. `bg-sidebar/75 backdrop-blur-md`) — **không** ghép `backdrop-blur-*` với nền opaque (blur bị vô hiệu, "glass giả").

## 4. Đa màn hình (responsive)

- Viết theo **mobile-first**: style mặc định cho mobile, rồi nâng cấp bằng breakpoint `sm:` / `md:` / `lg:` chuẩn của Tailwind.
- Grid danh sách phim: **≥2 cột ở mobile** (`grid-cols-2`) và **4–6 cột ở desktop** (`md:grid-cols-4 lg:grid-cols-6`), kèm `gap` hợp lý.
- Mọi phần tử bấm được (button, icon toggle, menu item) phải có **touch target ≥ 44px** (dùng `size-11`/`h-11` hoặc padding tương đương).
- Bắt buộc kiểm tra giao diện ở **width 375px** (iPhone SE) trước khi coi là xong; không để tràn ngang/xuất hiện scroll ngang.
- Sidebar/header phải hoạt động ở cả mobile (drawer/sheet) lẫn desktop (fixed sidebar).
- Bảng dữ liệu admin trên mobile phải có phương án thay thế (card list hoặc `overflow-x-auto`), không vỡ layout.

## 5. UI mượt mà (trải nghiệm)

- **Mọi trang gọi API phải có trạng thái loading/skeleton**: dùng `SkeletonLoader` hoặc `AdminSkeletonLayout`, không để màn hình trắng.
- Mọi trang phải có empty state và error state rõ ràng bằng tiếng Việt (không chỉ render danh sách rỗng).
- Các hành động toggle (like/dislike/favorite/watchlist) phải **optimistic update** qua React Query `onMutate`, rollback trong `onError`.
- Input tìm kiếm phải **debounce** (~300–500ms) trước khi gọi API/đổi queryKey (tránh đụng rate limit 100 req/phút).
- Hiệu ứng chuyển động phải nhẹ và dùng CSS/`tw-animate-css` (transition, fade) — không thêm lib animation nặng.
- Poster phim **luôn giữ tỉ lệ `aspect-[2/3]`** + `object-cover` để tránh layout shift; ảnh phải có kích thước/khoảng trống trước khi load.
- Nút bấm/`Link` phải có phản hồi thị giác (`hover:`, `active:`, `disabled:`) và trạng thái `disabled` khi đang submit.
- Danh sách dài phải phân trang (theo `pagination` của backend) hoặc virtualize — không render vô hạn.

## 6. Cách thêm một API/tính năng mới (đúng trình tự)

- Bước 1: tạo/ cập nhật `src/apis/<domain>.api.ts` — `export const xxxApi = { getAll, getById, create, update, delete }` dùng `axiosClient` và trả `ApiResponse<T>`.
- Bước 2: thêm type vào `src/shared/types/` (ví dụ `movie.types.ts`) theo camelCase, tái sử dụng `ApiResponse`/`ApiPaginatedResponse`.
- Bước 3: tạo hook trong `src/hooks/tankstack/use<Domain>.ts` (`useGetX`, `useCreateX`…) có `queryKey` chuẩn, `staleTime`, `invalidateQueries`, `parseAxiosError` + toast trong `onError`.
- Bước 4: tạo trang trong **route group đúng**: user-facing → `src/app/(main)/…`, admin → `src/app/(admin-layout)/admin/…`.
- Bước 5: thêm mục điều hướng vào `src/components/sidebar/nav-main.tsx` (group phù hợp trong `dataBar`) hoặc `nav-user.tsx`, dùng icon lucide.
- Bước 6: bọc trang admin bằng `RequireRole` với role phù hợp trước khi merge.
- Không gọi API trực tiếp trong component — luôn thông qua hook (`src/hooks/tankstack`).

## 7. Auth & phân quyền

- **Chỉ dùng `useAuthStore`** (`src/stores/auth.store.ts`) cho access token + user; **KHÔNG dùng mock `AuthContext`/`useAuth.ts`/`AppContext`** cho code mới.
- Access token chỉ giữ **in-memory** trong zustand; refresh token do backend quản lý qua httpOnly cookie — không lưu token vào localStorage/sessionStorage.
- Trang admin phải bọc `RequireRole requiredRoles={['ADMIN']}` (component ở `src/components/auth/RequireRole.tsx`).
- Kiểm tra role bằng `roleUtil.mapRoleToCodes(user.roles)` rồi so sánh code (chuỗi hoa, ví dụ `'ADMIN'`), không so sánh trực tiếp object role.
- Không tự viết lại logic gọi `/auth/refresh`/`/auth/me` trong component — dùng `useAuthStore.bootstrap()/refreshUser()`.
- Redirect khi chưa đăng nhập phải kèm `return-page` (theo pattern `RequireRole`).

## 8. Types & naming

- Type/interface dùng chung đặt trong `src/shared/types/` (`api.types.ts`, `ui.types.ts`, `movie.types.ts`…), không khai báo type dùng chung trong component.
- DTO/field từ API dùng **camelCase** (interceptor đã convert snake→camel) — không viết `snake_case` trong code client.
- Tên file component: **lowercase-kebab** cho file component/layout phụ (ví dụ `nav-main.tsx`, `movie-card.tsx`) hoặc PascalCase cho component export chính/`layout` (`UserLayout.tsx`, `RequireRole.tsx`); không trộn tùy tiện trong cùng thư mục.
- Hook đặt tên theo hành động: `useGetMovies`, `useCreateMovie`, `useUpdateGenre`, `useDeleteComment`.
- API domain file: `src/apis/<domain>.api.ts` với object `export const <domain>Api`.
- Store: `src/stores/<domain>.store.ts`; component: `src/components/<nhóm>/<name>.tsx`.
- Import dùng alias `@/…`, không dùng đường dẫn tương đối dài (`../../..`).
- Giữ nguyên tên folder `src/hooks/tankstack/` (typo lịch sử) — không rename.

## 9. Cấm (tuyệt đối)

- **Không commit/push git** khi chưa được yêu cầu rõ ràng.
- **Không sửa `docs/BACKEND_RULES.md`** (chỉ đọc; chỉ developer được sửa).
- **Không hardcode URL backend** trong component/api — luôn dùng `process.env.NEXT_PUBLIC_API_BASE_URL`.
- **Không dùng `src/shared/utils/http.ts`** (legacy `fetch`) và không gọi `fetch` trực tiếp cho API backend.
- **Không dùng mock `AuthContext`** cho tính năng mới.
- **Không thêm thư viện** UI/state/HTTP mới khi đã có shadcn/zustand/React Query/axios.
- Không dùng emoji làm icon, không hardcode màu hex, không dùng text tiếng Anh cho UI người dùng.
- Không xoá/đổi tên `src/hooks/tankstack/` hay cấu trúc route group khi chưa thống nhất với developer.
