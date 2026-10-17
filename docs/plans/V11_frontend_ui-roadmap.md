# V11 — Frontend UI Roadmap (User-facing + Admin CRUD)

- **Trạng thái**: Đang thực hiện (plan đã lập, **chưa triển khai** — toàn bộ task còn `- [ ]`)
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

- [ ] Tạo `frontend/src/shared/types/movie.types.ts` (`Movie`, `MovieDetail`, `MovieQuery`, `Country`, `MovieListResult` + page/limit/keyword)
- [ ] Tạo `frontend/src/apis/movie.api.ts` → `movieApi.getAll/getById/incrementView`
- [ ] Tạo `frontend/src/apis/country.api.ts` → `countryApi.getAll`
- [ ] Tạo `frontend/src/hooks/tankstack/useMovie.ts` → `useGetMovies` (`queryKey: ['movies', params]`, staleTime 5 phút), `useGetMovieDetail` (`['movie', id]`), `useIncrementView`
- [ ] Tạo `frontend/src/hooks/tankstack/useCountry.ts` → `useGetCountries` (`['countries']`, staleTime 5 phút)
- [ ] Tạo `frontend/src/stores/movie-filter.store.ts` → điền state filter (keyword, genreId, countryId, sort, page, limit + `setFilter`, `resetFilter`); lưu ý filter genre/country hiện **chỉ dùng client-side**
- [ ] Tạo `frontend/src/components/movie/movie-card.tsx` (poster `aspect-[2/3]`, title, năm, rating)
- [ ] Tạo `frontend/src/components/movie/movie-grid.tsx` (grid `grid-cols-2 md:grid-cols-4 lg:grid-cols-6`)
- [ ] Tạo `frontend/src/components/movie/movie-filters.tsx` (input keyword **debounce ~400ms** + sort/lọc thể loại–quốc gia **client-side**, vì `GET /api/movies` hiện chỉ nhận `page/limit/keyword`)
- [ ] Tạo `frontend/src/components/movie/movie-pagination.tsx` (đọc `pagination` từ envelope: `total/page/limit/totalPages`)
- [ ] Tạo trang danh sách `frontend/src/app/(main)/movies/page.tsx` + `loading.tsx` (skeleton)
- [ ] Làm lại trang chủ `frontend/src/app/(main)/(home)/page.tsx` (hero + phim mới nhất + danh sách link thể loại)
- [ ] Thêm mục điều hướng cho user (Trang chủ, Phim) vào `frontend/src/components/sidebar/nav-main.tsx` / `nav-user.tsx` (icon lucide)
- [ ] Xử lý trạng thái **guest** trong `frontend/src/components/layout/UserLayout.tsx` (không crash/không trắng trang khi chưa đăng nhập; ẩn mục cần auth)

- **API dùng**: `GET /api/movies?page&limit&keyword` (public, chỉ 3 query param này), `GET /api/genres?page&limit&keyword`, `GET /api/countries?page&limit&keyword`
- **File dự kiến tạo**: `src/shared/types/movie.types.ts`, `src/apis/movie.api.ts`, `src/apis/country.api.ts`, `src/hooks/tankstack/useMovie.ts`, `src/hooks/tankstack/useCountry.ts`, `src/components/movie/*`, `src/app/(main)/movies/page.tsx`, `src/app/(main)/movies/loading.tsx`
- **File dự kiến sửa**: `src/stores/movie-filter.store.ts`, `src/app/(main)/(home)/page.tsx`, `src/components/sidebar/nav-main.tsx`, `src/components/sidebar/nav-user.tsx`, `src/components/layout/UserLayout.tsx`

---

## Phase 2 — Chi tiết phim `/movies/[id]`

**Mục tiêu**: Trang chi tiết phim có thông tin, đánh giá sao, bình luận phân cấp realtime, view count realtime và khu vực phim tương đồng.

- [ ] Tạo `frontend/src/app/(main)/movies/[id]/page.tsx` (params là **string**, parse sang number; gọi `POST /movies/:id/view` khi mount) + `loading.tsx`
- [ ] Tạo `frontend/src/components/movie/movie-detail.tsx` (poster `aspect-[2/3]`, `title`/`titleVi`, `overview`/`overviewVi` qua `react-markdown`, thể loại, quốc gia, `releaseDate`, `runtime` nếu có)
- [ ] Tạo `frontend/src/components/movie/movie-rating.tsx` — chọn sao (0–5) + submit `POST /api/ratings` (`{ rating, movieId }`), hiển thị `voteAverage`/`voteCount`, cập nhật realtime qua WS `movie-{id}-rating` (`movieStats`)
- [ ] Tạo `frontend/src/components/movie/movie-comments.tsx` — root comments (`GET /api/comments/movie/:movieId?page&limit`), tải reply theo `parentId`, form gửi `POST /api/comments` (`{ content, movieId, parentId? }`), phân trang theo `pagination`, hiển thị `replyCount`
- [ ] Tạo `frontend/src/components/movie/movie-view-count.tsx` — hiển thị lượt xem từ `{ viewCount }`, cập nhật realtime qua WS `movie-{id}-viewCount`
- [ ] Tạo `frontend/src/components/movie/similar-movies.tsx` — **để trống/placeholder** vì backend không có endpoint phim tương đồng (thuộc ai-service, xem Rủi ro)
- [ ] Tạo `frontend/src/hooks/tankstack/useRating.ts` (`['ratings', movieId]` + mutation invalidate)
- [ ] Tạo `frontend/src/hooks/tankstack/useComment.ts` (`['comments', movieId]` + mutation invalidate, optimistic khi gửi)
- [ ] Tạo `frontend/src/hooks/useMovieSocket.ts` — kết nối `socket.io-client` tới `:8081`, lắng nghe `movie-{id}-comment`, `movie-{id}-rating`, `movie-{id}-viewCount`, `movie-{id}-typing`; **emit `typingComment`** `{ movieId, isTyping, userFullName? }`; cleanup khi unmount
- [ ] Thêm trạng thái "đang gõ…" (typing) và hiệu ứng cập nhật realtime (transition nhẹ)

- **API dùng**: `GET /api/movies/:id`, `POST /api/movies/:id/view`, `POST /api/ratings`, `GET /api/ratings/movie/:movieId?page&limit`, `GET /api/comments/movie/:movieId?page&limit&parentId`, `POST /api/comments`; Socket.IO: nhận `movie-{id}-comment`, `movie-{id}-rating`, `movie-{id}-viewCount`, `movie-{id}-typing`; gửi `typingComment`
- **File dự kiến tạo**: `src/app/(main)/movies/[id]/page.tsx` + `loading.tsx`, `src/components/movie/{movie-detail,movie-rating,movie-comments,movie-view-count,similar-movies}.tsx`, `src/hooks/tankstack/{useRating,useComment}.ts`, `src/hooks/useMovieSocket.ts`

---

## Phase 3 — Tương tác cá nhân

**Mục tiêu**: User xem được lịch sử xem / phim yêu thích và toggle các tương tác (like/dislike/favorite/watchlist) với optimistic update.

- [ ] Tạo `frontend/src/apis/interaction.api.ts` (`toggle`, `getMyHistory`, `getMyFavorites`)
- [ ] Tạo `frontend/src/hooks/tankstack/useInteraction.ts` — `useToggleInteraction` (đọc `result.action` = `added`/`removed`, optimistic update + rollback `onError`), `useMyHistory`, `useMyFavorites`
- [ ] Tạo `frontend/src/components/movie/movie-actions.tsx` — nút like/dislike/favorite/watchlist (icon lucide, touch target ≥44px)
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
