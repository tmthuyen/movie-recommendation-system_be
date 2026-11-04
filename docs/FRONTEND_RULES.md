# FRONTEND_RULES — Quy tắc code & UI frontend (BẮT BUỘC)

Tài liệu **duy nhất** quy định các quy tắc **bắt buộc** khi viết/sửa code trong `frontend/` của dự án movie-recommendation: kiến trúc (folder-by-type, axiosClient + envelope, zustand + React Query), UI (shadcn/ui + Tailwind v4, dark mode, motion cho card, a11y, tiếng Việt) và chất lượng trải nghiệm (responsive, loading, optimistic update).

> **Lịch sử**: ngày 2026-11-04 gộp toàn bộ `docs/FRONTEND_UI_RULES.md` (tạo ở V18) vào file này theo yêu cầu developer — frontend chỉ còn **1 file rules**. Không rule nào bị nới lỏng khi gộp.

Người/agent viết code mới phải tuân theo toàn bộ danh sách dưới đây; mọi ngoại lệ phải được developer đồng ý trước. Tài liệu tổng quan frontend xem [FRONTEND.md](./FRONTEND.md); rules xuyên service (testing, logging, DoD) xem [CODE_RULES.md](./CODE_RULES.md).

**Mức ưu tiên**: 🔴 bắt buộc — vi phạm là lỗi review; 🟡 nên làm, có lý do chính đáng thì ghi lại.

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
- Animation card → **`motion`** (import từ `motion/react`) — **chỉ** cho card/list entrance + hover elevation; micro-interaction giữ CSS/`tw-animate-css`. Chi tiết + fallback: mục 6.
- Đăng nhập Google → `@react-oauth/google`; biểu đồ admin → `recharts`; realtime → `socket.io-client` (chỉ dùng khi backend đã có event tương ứng).

## 3. UI & component — shadcn/ui first 🔴

### 3.1 Thứ tự tái sử dụng (bắt buộc kiểm tra trước khi tạo UI mới)

1. `frontend/src/components/common` — UI kit dùng chung: `PageHeader`, `SectionHeader`, `EmptyState`, `ErrorState`, `DataPagination`, `PaginatedView`, `SkeletonLoader`, `ConfirmDialog`, `AppModal`, `CarouselCustom`, `ThemeToggle`, `ErrorBoundary`.
2. `frontend/src/components/ui` — shadcn/ui.
3. Component domain sẵn có (`src/components/movie`, `src/components/admin`, ...).

Không tìm thấy → thêm shadcn vào `src/components/ui` theo style `new-york` (`npx shadcn add <component>`). **Không copy** component sang folder domain, không tạo biến thể thứ hai ("mỗi domain tự viết UI riêng = hỏng").

### 3.2 Component shadcn hiện có trong `src/components/ui`

`alert-dialog`, `alert`, `avatar`, `badge`, `breadcrumb`, `button`, `calendar`, `card`, `carousel`, `collapsible`, `command`, `dialog`, `dropdown-menu`, `field`, `input-group`, `input`, `label`, `popover`, `radio-group`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `sonner`, `table`, `tabs`, `textarea`, `tooltip`.

Thiếu component → `npx shadcn add <name>`; không tự viết lại Dialog/Select/Table bằng `div`.

### 3.3 Quy tắc dùng component

- Dùng đúng `variant`/`size` có sẵn; cần biến thể thì mở rộng bằng `cn(...)`/props, không copy toàn bộ file component ra để sửa.
- **Không sửa trực tiếp** file trong `src/components/ui` để phục vụ một domain.
- `className` nối bằng `cn(...)` (`@/lib/utils`), không nối chuỗi tay.
- Dark mode là **class-based** qua `next-themes` (`attribute="class"`, class `.dark`) — không tự thêm cơ chế theme khác.
- Mọi màu sắc phải dùng **design token trong `src/app/globals.css`** qua CSS variable/Tailwind semantic class (`bg-background`, `text-foreground`, `bg-card`, `text-muted-foreground`, `border-border`, `bg-primary`, `ring-ring`, `bg-destructive`…) — **cấm hardcode hex/`rgb()`** trong component. `#000000` chỉ được xuất hiện khi định nghĩa token trong `globals.css`.
- Tailwind v4 CSS-first: **không tạo `tailwind.config.js`**; token khai báo trong `globals.css` (`@theme inline`, `:root`, `.dark`).
- Toàn bộ text hiển thị cho người dùng phải là **tiếng Việt** (kể cả `metadata.title/description`, empty state, nhãn nút, thông báo lỗi, `aria-label`, `alt`).
- Typography theo các class đang dùng trong project (`text-3xl font-extrabold` cho tiêu đề trang, `text-gray-500 dark:text-gray-400` cho mô tả) — không tự ý tạo scale mới.
- Bo góc dùng `--radius` (0.625rem) qua class `rounded-lg/md/sm`, không hardcode `rounded-[10px]`.
- Component shadcn sinh bằng style **`new-york`** theo `components.json`; không đổi style/baseColor toàn cục khi chưa hỏi developer.
- Glassmorphism/`backdrop-blur`: chỉ dùng khi nền **trong suốt** (vd. `bg-sidebar/75 backdrop-blur-md`) — **không** ghép `backdrop-blur-*` với nền opaque (blur bị vô hiệu, "glass giả").

### 3.4 ĐÚNG / SAI

```tsx
// SAI — button thuần, mất focus ring/disabled/variant
<button className="rounded bg-black px-4 py-2 text-white" onClick={onSave}>
  Lưu
</button>

// ĐÚNG
import { Button } from '@/components/ui/button';
<Button onClick={onSave} disabled={isPending}>
  {isPending ? 'Đang lưu...' : 'Lưu'}
</Button>
```

```tsx
// SAI — tự dựng card/khung, hardcode màu
<div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: 8 }}>

// ĐÚNG — token + Card
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
<Card className="rounded-lg">
  <CardHeader>
    <CardTitle>Phim mới</CardTitle>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

```tsx
// SAI — copy button.tsx sang movie/ rồi sửa
// SAI — thêm prop biến thể bằng cách duplicate file
// ĐÚNG — mở rộng bằng cn/props
<Button variant="outline" size="sm" className="gap-2">
  <Plus className="size-4" aria-hidden="true" /> Thêm
</Button>
```

## 4. Đa màn hình (responsive) 🔴

- Viết theo **mobile-first**: style mặc định cho mobile, rồi nâng cấp bằng breakpoint `sm:` / `md:` / `lg:` chuẩn của Tailwind.
- Grid danh sách phim: **≥2 cột ở mobile** (`grid-cols-2`) và **4–6 cột ở desktop** (`md:grid-cols-4 lg:grid-cols-6`), kèm `gap` hợp lý. ⚠️ Hiện trạng `movie-grid.tsx` là `grid-cols-1` ở mobile → lệch rule, sửa khi làm UI.
- Mọi phần tử bấm được (button, icon toggle, menu item) phải có **touch target ≥ 44px** (dùng `size-11`/`h-11` hoặc padding tương đương).
- Bắt buộc kiểm tra giao diện ở **width 375px** (iPhone SE) trước khi coi là xong; không để tràn ngang/xuất hiện scroll ngang (hover scale có thể tràn 1–2px → `overflow-x-hidden` ở container nếu cần).
- Sidebar/header phải hoạt động ở cả mobile (drawer/sheet) lẫn desktop (fixed sidebar).
- Bảng dữ liệu admin trên mobile phải có phương án thay thế (card list hoặc `overflow-x-auto`), không vỡ layout.
- Text dài: `line-clamp-*`, `break-words`; không để tiêu đề phim đẩy layout.

## 5. Trạng thái UI & UI mượt mà (trải nghiệm) 🔴

- **Mọi trang gọi API phải có trạng thái loading/skeleton**: dùng `SkeletonLoader` (`PageSkeleton`, `TableSkeleton`, `CardListSkeleton`), `CrudTableSkeleton`, `MovieGridSkeleton`/`MovieRowSkeleton`, hoặc `AdminSkeletonLayout` — không để màn hình trắng.
- Skeleton phải khớp layout thật (cùng số cột/aspect) để không nhảy khi data về.
- Mọi trang phải có empty state và error state rõ ràng bằng tiếng Việt (không chỉ render danh sách rỗng); error state có nút "Thử lại".
- Các hành động toggle (like/favorite/rating…) phải **optimistic update** qua React Query `onMutate`, rollback trong `onError`.
- Input tìm kiếm phải **debounce** (~300–500ms) trước khi gọi API/đổi queryKey (tránh đụng rate limit 100 req/phút).
- Poster/ảnh phải giữ khung trước khi load (`aspect-*` + `bg-muted` + `next/image` với `width/height` hoặc `fill` + `sizes`); không layout shift.
- Poster phim **luôn giữ tỉ lệ `aspect-[2/3]`** + `object-cover`. ⚠️ Hiện trạng `movie-card.tsx` dùng `aspect-[6/3]` cho backdrop — **lệch rule**, dev cần chốt trước khi sửa (xem mục 14).
- Nút bấm/`Link` phải có phản hồi thị giác (`hover:`, `active:`, `disabled:`) và trạng thái `disabled` khi đang submit; không cho double-submit.
- Danh sách dài phải phân trang (theo `pagination` của backend) hoặc virtualize — không render vô hạn.
- Hiệu ứng chuyển động nhẹ, ưu tiên CSS/`tw-animate-css`; riêng animation xuất hiện của card/list theo mục 6.

## 6. Motion & animation card 🔴

### 6.1 Yêu cầu bắt buộc cho card (đặc biệt `MovieCard`)

- Có animation **xuất hiện**: fade + translate (hoặc scale nhẹ) + **stagger** khi render danh sách.
- Hover có **elevation** (nhấc lên + shadow), không nhảy layout.
- Chỉ animate `transform` và `opacity`. Không animate `width/height/top/left/margin/padding` → gây layout shift (CLS).
- Thời lượng 250–400ms; stagger 40–80ms/item; tổng delay không vượt ~300ms.
- Tôn trọng `prefers-reduced-motion`.
- Không chạy lại animation mỗi lần re-render/đổi state (chỉ khi mount hoặc khi vào viewport lần đầu).

### 6.2 Thư viện & phạm vi

- Dùng package **`motion`** (kế thừa Framer Motion), import từ `motion/react`. **Không** cài/dùng song song `framer-motion`; không trộn `motion` với `react-spring`/`gsap` cho card.
- Phạm vi ngoại lệ so với "không thêm lib animation nặng": **chỉ card/list entrance + hover elevation**. Micro-interaction (fade tooltip, màu nút, skeleton shimmer) dùng CSS/`tw-animate-css`. Không dùng `motion` cho toàn bộ layout/trang.
- ⚠️ Hiện trạng: `motion` **chưa có** trong `frontend/package.json` / `node_modules`. Cài khi được dev duyệt (dependency mới):

```bash
cd frontend
npm i motion
```

- Chưa được duyệt → dùng fallback CSS (mục 6.7) và ghi lại quyết định.

### 6.3 Motion token dùng chung 🟡

Khi implement, tạo `frontend/src/lib/motion.ts` để tránh mỗi card một kiểu:

```ts
import type { Variants } from 'motion/react';

export const DURATION = 0.35;

export const cardVariants: Variants = {
  hidden: { opacity: 0, y: 16, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1 },
};

export const listVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};
```

### 6.4 Pattern A — `MovieCard` + grid stagger

`MovieCard` khai báo `variants`, **không** tự set `initial`/`animate` để kế thừa từ parent (nếu tự set, `staggerChildren` của parent không còn tác dụng).

```tsx
'use client';

import { motion, useReducedMotion } from 'motion/react';
import { cardVariants, DURATION } from '@/lib/motion';

export function MovieCard({ movie, hideActions = false }: MovieCardProps) {
  const reduceMotion = useReducedMotion();
  // ...poster/title/year như hiện tại

  return (
    <motion.article
      variants={cardVariants}
      transition={{ duration: DURATION, ease: 'easeOut' }}
      whileHover={reduceMotion ? undefined : { y: -4, scale: 1.02 }}
      className="group bg-card text-card-foreground focus-within:ring-ring relative flex flex-col overflow-hidden rounded-lg border shadow-sm transition-shadow duration-300 focus-within:ring-2 hover:shadow-lg"
    >
      {/* phần còn lại giữ nguyên cấu trúc card hiện tại */}
    </motion.article>
  );
}
```

Grid là motion parent, quyết định `initial/animate` + stagger:

```tsx
'use client';

import { motion, useReducedMotion } from 'motion/react';
import { listVariants } from '@/lib/motion';
import { MovieCard } from './movie-card';

export function MovieGrid({ movies }: MovieGridProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      variants={listVariants}
      initial={reduceMotion ? false : 'hidden'}
      animate="visible"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4 lg:grid-cols-5 2xl:grid-cols-6"
    >
      {movies.map((movie) => (
        <MovieCard key={movie.id} movie={movie} />
      ))}
    </motion.div>
  );
}
```

Card render ngoài grid (trang chi tiết, `similar-movies`) → bọc bằng motion parent tương tự; hoặc dùng Pattern B.

### 6.5 Pattern B — card lẻ / carousel `movie-row`

`whileInView` + delay theo index, không cần parent:

```tsx
<motion.div
  initial={reduceMotion ? false : { opacity: 0, y: 12 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, amount: 0.2 }}
  transition={{ duration: 0.35, ease: 'easeOut', delay: Math.min(index * 0.05, 0.3) }}
>
  <MovieCard movie={movie} />
</motion.div>
```

Chỉ chọn **một** pattern cho mỗi danh sách. Không set `initial/animate` trên card nếu dùng Pattern A.

### 6.6 Ví dụ SAI (gây layout shift / giật)

```tsx
// SAI — animate height/padding → layout shift, ảnh nhảy
<motion.div animate={{ height: open ? 320 : 0, padding: 16 }} />

// SAI — transition-all + motion cùng element, double transform
<article className="transition-all hover:scale-105">
  <motion.div whileHover={{ scale: 1.02 }} />

// SAI — dùng `layout` trên card trong grid (méo ảnh, nhảy vị trí khi filter)
<motion.article layout />

// SAI — delay tăng vô hạn, list 50 item → item cuối chờ 2.5s
transition={{ delay: index * 0.05 }}

// SAI — animation chạy lại mỗi re-render do key đổi / initial không ổn định
<motion.div key={Math.random()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />

// SAI — animate màu/shadow liên tục bằng JS thay vì CSS
<motion.article animate={{ boxShadow: '0 10px 30px rgba(0,0,0,.3)' }} />
```

Quy ước hover: nếu dùng `whileHover`, **bỏ** `hover:scale-*`/`hover:-translate-y-*` CSS trên cùng element; shadow hover có thể giữ bằng CSS (`hover:shadow-lg`).

### 6.7 Reduced motion & fallback CSS

- Luôn dùng `useReducedMotion()`; khi `true`: tắt translate/scale/stagger, chỉ giữ fade rất ngắn hoặc không animation. Không dựa vào CSS media query một mình cho motion của JS.
- Loading skeleton không được nhấp nháy mạnh khi reduced motion.

Fallback khi chưa được duyệt cài `motion`:

```css
/* globals.css — dùng tw-animate-css */
@keyframes card-in {
  from { opacity: 0; transform: translateY(16px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.card-in {
  animation: card-in 350ms ease-out both;
}
@media (prefers-reduced-motion: reduce) {
  .card-in { animation: none; }
}
```

Stagger bằng CSS: `style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}`. Fallback này chỉ là tạm; **không trộn** với `motion` trên cùng element.

### 6.8 Hiệu năng 🟡

- Chỉ animate `transform`/`opacity`; không set `will-change` vĩnh viễn cho hàng trăm card.
- Danh sách dài: ưu tiên `whileInView` + `viewport={{ once: true }}`, không animate toàn bộ 200 item cùng lúc.
- Xoá item khỏi list: dùng `AnimatePresence` + `exit` ngắn (150–200ms), không animate layout của cả grid.
- Không bọc `motion` quanh component không cần animation (làm chậm RSC/hydration).

## 7. Accessibility (a11y) 🔴

- Mọi control bấm được phải có `focus-visible` ring rõ (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`).
- Icon-only button phải có `aria-label` tiếng Việt; icon trang trí có `aria-hidden="true"`.
- Ảnh phim: `alt` = tiêu đề phim; ảnh decorative (backdrop trong overlay) `alt=""`.
- Link "stretched" trong card: `aria-label` = tiêu đề phim; overlay chỉ chứa text trang trí phải `aria-hidden="true"` (như hiện tại).
- Không đặt button/link tương tác **bên trong** `<Link>` stretched; phần tử tương tác phải là sibling với `z-index` cao hơn (`z-20`) — pattern `MovieActions`.
- Heading đúng cấp: trang có `h1`, card dùng `h3`/`h2` nhất quán, không nhảy cấp.
- Keyboard: tab được tới mọi action; không bẫy focus ngoài Dialog/Sheet (shadcn đã xử lý).
- Không dùng `onClick` trên `div` không có `role`/`tabIndex`/key handler.
- Form: `Label` + `aria-invalid` + message lỗi tiếng Việt (dùng `Field`/`react-hook-form`).
- Độ tương phản text ≥ 4.5:1 (text thường), ≥ 3:1 (text lớn/icon); kiểm tra **cả light & dark** cho card, overlay hover, badge rating, skeleton, border, focus ring.
- Tôn trọng `prefers-reduced-motion` (mục 6.7).

## 8. Nội dung & định dạng 🟡

- Toàn bộ text người dùng thấy là **tiếng Việt**, kể cả empty state, error, `metadata.title/description`, `aria-label`, `alt`.
- Số/ngày theo locale Việt: `toLocaleString('vi-VN')`, `date-fns` với locale `vi` nếu có; không hiển thị ISO thô.
- Nhãn nút là động từ rõ ràng: "Lưu thay đổi", "Xoá phim", "Thử lại" — không "OK"/"Submit".
- Empty state phải nói lý do + hành động tiếp theo; error state có nút "Thử lại".
- Không hardcode text lặp ở nhiều nơi nếu cùng nghĩa; đặt constant/hằng dùng chung khi tái sử dụng.

## 9. Cách thêm một API/tính năng mới (đúng trình tự)

- Bước 1: tạo/cập nhật `src/apis/<domain>.api.ts` — `export const xxxApi = { getAll, getById, create, update, delete }` dùng `axiosClient` và trả `ApiResponse<T>`.
- Bước 2: thêm type vào `src/shared/types/` (ví dụ `movie.types.ts`) theo camelCase, tái sử dụng `ApiResponse`/`ApiPaginatedResponse`.
- Bước 3: tạo hook trong `src/hooks/tankstack/use<Domain>.ts` (`useGetX`, `useCreateX`…) có `queryKey` chuẩn, `staleTime`, `invalidateQueries`, `parseAxiosError` + toast trong `onError`.
- Bước 4: tạo trang trong **route group đúng**: user-facing → `src/app/(main)/…`, admin → `src/app/(admin-layout)/admin/…`.
- Bước 5: thêm mục điều hướng vào `src/components/sidebar/nav-data.ts` (`NAV_SECTIONS`, và `BOTTOM_NAV` nếu cần hiện ở bottom nav mobile) — `nav-main.tsx` chỉ render từ dữ liệu này; dùng icon lucide.
- Bước 6: bọc trang admin bằng `RequireRole` với role phù hợp trước khi merge.
- Không gọi API trực tiếp trong component — luôn thông qua hook (`src/hooks/tankstack`).

## 10. Auth & phân quyền

- **Chỉ dùng `useAuthStore`** (`src/stores/auth.store.ts`) cho access token + user; **KHÔNG dùng mock `AuthContext`/`useAuth.ts`/`AppContext`** cho code mới.
- Access token chỉ giữ **in-memory** trong zustand; refresh token do backend quản lý qua httpOnly cookie — không lưu token vào localStorage/sessionStorage.
- Trang admin phải bọc `RequireRole requiredRoles={['ADMIN']}` (component ở `src/components/auth/RequireRole.tsx`).
- Kiểm tra role bằng `roleUtil.mapRoleToCodes(user.roles)` rồi so sánh code (chuỗi hoa, ví dụ `'ADMIN'`), không so sánh trực tiếp object role.
- Không tự viết lại logic gọi `/auth/refresh`/`/auth/me` trong component — dùng `useAuthStore.bootstrap()/refreshUser()`.
- Redirect khi chưa đăng nhập phải kèm `return-page` (theo pattern `RequireRole`).

## 11. Types & naming

- Type/interface dùng chung đặt trong `src/shared/types/` (`api.types.ts`, `ui.types.ts`, `movie.types.ts`…), không khai báo type dùng chung trong component.
- DTO/field từ API dùng **camelCase** (interceptor đã convert snake→camel) — không viết `snake_case` trong code client.
- Tên file component: **lowercase-kebab** cho file component/layout phụ (ví dụ `nav-main.tsx`, `movie-card.tsx`) hoặc PascalCase cho component export chính/`layout` (`UserLayout.tsx`, `RequireRole.tsx`); không trộn tùy tiện trong cùng thư mục.
- Hook đặt tên theo hành động: `useGetMovies`, `useCreateMovie`, `useUpdateGenre`, `useDeleteComment`.
- API domain file: `src/apis/<domain>.api.ts` với object `export const <domain>Api`.
- Store: `src/stores/<domain>.store.ts`; component: `src/components/<nhóm>/<name>.tsx`.
- Import dùng alias `@/…`, không dùng đường dẫn tương đối dài (`../../..`).
- Giữ nguyên tên folder `src/hooks/tankstack/` (typo lịch sử) — không rename.

## 12. Cấm (tuyệt đối)

- **Không commit/push git** khi chưa được yêu cầu rõ ràng.
- **Không sửa `docs/BACKEND_RULES.md`** (chỉ đọc; chỉ developer được sửa).
- **Không hardcode URL backend** trong component/api — luôn dùng `process.env.NEXT_PUBLIC_API_BASE_URL`.
- **Không dùng `src/shared/utils/http.ts`** (legacy `fetch`) và không gọi `fetch` trực tiếp cho API backend.
- **Không dùng mock `AuthContext`** cho tính năng mới.
- **Không thêm thư viện** UI/state/HTTP/animation mới khi đã có shadcn/zustand/React Query/axios/`motion`; không cài song song `framer-motion`.
- Không dùng emoji làm icon, không hardcode màu hex, không dùng text tiếng Anh cho UI người dùng.
- Không xoá/đổi tên `src/hooks/tankstack/` hay cấu trúc route group khi chưa thống nhất với developer.
- Không animate `width/height/margin/padding` hoặc dùng `layout` trên card trong grid.
- Không sửa trực tiếp file trong `src/components/ui` để phục vụ một domain.

## 13. Checklist review UI (copy vào PR/plan)

```md
- [ ] Dùng shadcn/ui + common kit, không tạo lại component đã có
- [ ] Không hardcode màu hex; chỉ token semantic; light + dark đều đạt tương phản
- [ ] Card có entrance animation (fade + translate/scale + stagger), không layout shift
- [ ] Hover elevation; không trộn CSS transform với motion whileHover
- [ ] Có useReducedMotion; tắt translate/scale khi reduced motion
- [ ] Chỉ animate transform/opacity; stagger ≤ 300ms tổng
- [ ] 375px không tràn ngang; grid ≥2 cột mobile
- [ ] Touch target ≥44px; focus-visible ring; icon-only có aria-label
- [ ] Text tiếng Việt; số/ngày format vi-VN
- [ ] Loading skeleton + empty + error state đầy đủ
- [ ] `motion` chỉ dùng cho card/list; micro-interaction dùng CSS/tw-animate-css
- [ ] Chạy `npm run lint && npm run type-check && npm test && npm run build`
```

## 14. Hiện trạng & follow-up

| # | Hiện trạng | Mức | Follow-up |
|---|---|---|---|
| 1 | `movie-card.tsx` **chưa có motion**, chỉ CSS hover (`hover:-translate-y-1 hover:scale-105 transition-all`) + overlay fade | ⚠️ | Thêm `motion.article` + variants theo mục 6.4 |
| 2 | `motion` chưa có trong `package.json`/`node_modules` | ⚠️ | Cài `motion` sau khi dev duyệt; chưa cài thì dùng fallback CSS (mục 6.7) |
| 3 | `movie-grid.tsx` mobile `grid-cols-1` (lệch yêu cầu ≥2 cột) | ⚠️ | Đổi `grid-cols-2`, desktop 4–6 cột |
| 4 | `similar-movies.tsx` render list dọc, không stagger | ⚠️ | Bọc motion parent hoặc Pattern B |
| 5 | `movie-row.tsx` carousel chưa stagger | ⚠️ | Pattern B với delay theo index |
| 6 | Poster card dùng `aspect-[6/3]`, rule yêu cầu `aspect-[2/3]` | ⚠️ | **Dev chốt tỉ lệ**; nếu đổi phải cập nhật skeleton + `sizes` |
| 7 | Chưa có `src/lib/motion.ts` (token motion dùng chung) | 🟡 | Tạo khi implement animation |
| 8 | `MovieActions` đang bị comment trong card | ⚠️ | Quyết định bật lại; đảm bảo `z-20` + không lồng trong stretched link |
| 9 | CSS `transition-all` trên card dễ animate cả layout property | ⚠️ | Đổi sang `transition-shadow`/`transition-colors` khi thêm motion |
| 10 | Frontend đã có test (V19: 28 file/232 test) | ✅ | Giữ coverage ≥60% (xem `CODE_RULES.md` §3.8) |
