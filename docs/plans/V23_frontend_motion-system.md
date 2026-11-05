# V23 — Hệ thống motion dùng chung cho card và component/trang

## Thông tin chung

| Hạng mục | Nội dung |
|---|---|
| Trạng thái | ✅ Hoàn thành (2026-11-05) |
| Người thực hiện | AI Agent (main) |
| Thời gian | 2026-11-05 |
| Scope | `frontend` |
| Nhánh | `ci-cd` |
| Module liên quan | `frontend/src/lib/motion.ts` (mới), `frontend/src/components/motion/**` (mới), `MovieCard`, `MovieGrid`, `MovieRow`, `SimilarMovies`, `PageHeader`, `SectionHeader`, `EmptyState`, `ErrorState`, `DataTable` |
| Không sửa | `docs/FRONTEND_RULES.md` phần quy tắc bắt buộc (chỉ cập nhật mục "Hiện trạng" sau khi implement) |

## Bối cảnh

- `docs/FRONTEND_RULES.md` §6 yêu cầu card phải có animation xuất hiện (fade + translate + stagger) và hover elevation; dùng package **`motion`** (import `motion/react`), tôn trọng `prefers-reduced-motion`.
- Hiện trạng: `motion` chưa có trong `frontend/package.json`; `MovieCard` chỉ có CSS hover `hover:-translate-y-1 hover:scale-105` và chưa có entrance animation. Các component dùng chung khác (PageHeader, SectionHeader, EmptyState, ErrorState, DataTable) cũng chưa có motion.
- Cần một nơi khai báo token/variant dùng chung để mọi card/list không mỗi nơi một kiểu, và các trang khác chỉ cần tái sử dụng component motion.

## Mục tiêu

- Cài `motion` và tạo **motion system** tái sử dụng:
  - `src/lib/motion.ts`: duration, easing, stagger, variants (`card`, `item`, `section`, `page`).
  - `src/components/motion/motion-primitives.tsx`: `MotionReveal`, `MotionStagger`, `MotionItem` (client components, xử lý `useReducedMotion`).
- `MovieCard` có entrance animation + hover elevation bằng `motion` (bỏ transform CSS trùng).
- `MovieGrid`, `MovieRow`, `MovieColumn`/`SimilarMovies` dùng đúng Pattern A/B trong rules.
- Các component dùng chung khác có entrance nhẹ: `PageHeader`, `SectionHeader`, `EmptyState`, `ErrorState`, `DataTable`.
- Không animate `width/height/margin/padding`; không double transform; không chạy lại animation mỗi re-render.
- Có test cho motion system + MovieCard; full frontend suite xanh.

## Hướng dẫn cài đặt (cho developer)

```bash
cd frontend
npm i motion
```

- Chỉ dùng `motion` (không cài thêm `framer-motion`, `react-spring`, `gsap`).
- Import: `import { motion, useReducedMotion } from 'motion/react';`
- `motion` là dependency runtime (không phải devDependency) vì chạy trên browser.

## Phases

### Phase 0 — Chuẩn bị
- [x] Tạo plan V23 + cập nhật `PLAN_INDEX.md`.
- [x] Cài `motion` vào `frontend/package.json`.

### Phase 1 — Motion system
- [x] Tạo `frontend/src/lib/motion.ts` với token + variants.
- [x] Tạo `frontend/src/components/motion/motion-primitives.tsx`:
  - `MotionReveal` (mount hoặc in-view, delay theo index, nhận `data-*`/`role` để dùng cho wrapper danh sách).
  - `MotionStagger` (parent điều khiển stagger cho grid/section).
  - `MotionItem` (child dùng variants của parent).
- [x] Tất cả component motion là `'use client'`; khi `useReducedMotion()` trả `true` → không translate/scale/stagger.

### Phase 2 — Áp dụng cho movie
- [x] `MovieCard`: `motion.article` + `variants`, hover elevation bằng `whileHover`; bỏ `hover:-translate-y-1 hover:scale-105`/`transition-all`, giữ shadow CSS.
- [x] `MovieGrid`: `MotionStagger` Pattern A; card là con trực tiếp để `staggerChildren` hoạt động.
- [x] `MovieRow`: Pattern B `MotionReveal` cho từng item, delay `min(index * 0.05, 0.3)`, giữ `data-card`.
- [x] `SimilarMovies`/`MovieColumn`: `MotionStagger when="in-view"` (điều chỉnh so với plan ban đầu — dùng Pattern A cho list dọc dài để không phải bọc từng card).
- [x] `LatestMovies` tự hưởng lợi từ `MovieGrid`.

### Phase 3 — Áp dụng cho component/trang khác
- [x] `PageHeader`: entrance fade-up khi mount (mọi trang dùng PageHeader).
- [x] `SectionHeader`: fade-up khi vào viewport (`once: true`).
- [x] `EmptyState`, `ErrorState`: fade-in nhẹ khi mount/in-view.
- [x] `DataTable`: fade-up một lần cho cả bảng (không animate từng row để tránh nặng).
- [x] Rà soát các trang home/movies/admin: không còn `animate-fade-in` trùng với motion ở cùng element nếu gây double animation.

### Phase 4 — Test & kiểm tra
- [x] Test `lib/motion` (token/variant shape) + `MotionReveal`/`MotionStagger`/`MotionItem` render children/className.
- [x] Cập nhật `movie-card.test.tsx` (vẫn pass với motion; thêm assert wrapper/structure nếu cần).
- [x] Thêm test `movie-grid` (render đủ card, wrapper motion).
- [x] `npm test`, `npx vitest run --coverage`, `npm run type-check`, `npm run lint` xanh.
- [x] Cập nhật mục "Hiện trạng" của `docs/FRONTEND_RULES.md` §6.2 (đã cài `motion`) và `docs/FRONTEND.md` nếu cần.
- [x] Ghi kết quả + rủi ro còn lại vào plan này.
- [x] Không commit.

## Acceptance

- [x] `motion` có trong `package.json`/lockfile và chỉ dùng một thư viện animation.
- [x] MovieCard có entrance animation + hover elevation; grid có stagger; row/column có delay theo index.
- [x] PageHeader/SectionHeader/EmptyState/ErrorState/DataTable có motion nhẹ, tái sử dụng cùng token.
- [x] Reduced motion tắt translate/scale/stagger; không animate layout properties.
- [x] Full frontend suite + type-check + lint xanh.

## Kết quả thực hiện

| Hạng mục | Kết quả |
|---|---|
| Dependency | `motion@14.9.1` (dependency runtime, không có `framer-motion`/`react-spring`/`gsap`) |
| Test | 32 file / **246 test** pass (trước V23: 28 file / 232 test) |
| Coverage | **69.46%** statements/lines, 86.76% branches |
| Type-check | ✅ `tsc --noEmit` sạch |
| Lint | ✅ **0 error** (242 warning có sẵn từ trước) |

File/component đã áp dụng:

- Token/variant: `frontend/src/lib/motion.ts` (`MOTION_DURATION`, `MOTION_DURATION_FAST`, `MOTION_STAGGER`, `MOTION_MAX_DELAY`, `MOTION_EASE`, `MOTION_TRANSITION`, `cardVariants`, `listVariants`, `fadeUpVariants`, `fadeVariants`, `revealDelay`).
- Primitives: `frontend/src/components/motion/motion-primitives.tsx` (`MotionReveal`, `MotionStagger`, `MotionItem`).
- Movie: `MovieCard` (Pattern A + `whileHover`), `MovieGrid` (mount stagger), `MovieRow` (Pattern B), `MovieColumn`/`SimilarMovies` (in-view stagger).
- Shared: `PageHeader`, `SectionHeader`, `EmptyState`, `ErrorState`, `DataTable`.
- Test: `src/lib/motion.test.ts`, `motion-primitives.test.tsx`, `motion-primitives.reduced.test.tsx`, `movie-grid.test.tsx`, cập nhật `movie-card.test.tsx`.

Rủi ro / follow-up còn lại:

- `MovieCard` vẫn dùng `aspect-[6/3]` (rules ghi `aspect-[2/3]`) — **chưa đổi trong plan này**, cần developer chốt tỉ lệ.
- `MovieGrid` mobile vẫn `grid-cols-1` (rules yêu cầu ≥2 cột) — follow-up riêng.
- Reduced motion được test bằng cách mock `useReducedMotion` (motion cache `matchMedia` ở module level, không spy được sau import).
- Test jsdom không chạy `IntersectionObserver` thật; chỉ assert render/class, không assert trạng thái animation cuối.

## Rủi ro / lưu ý

- `MovieCard` hiện dùng `aspect-[6/3]` trong khi rules ghi `aspect-[2/3]`; **không đổi tỉ lệ trong plan này** (thay đổi thiết kế, cần developer duyệt), chỉ ghi follow-up.
- `motion` làm tăng JS bundle; chỉ dùng cho entrance/hover, không bọc toàn bộ layout/trang.
- Test jsdom không chạy IntersectionObserver thật; chỉ assert render, không assert trạng thái animation cuối.
