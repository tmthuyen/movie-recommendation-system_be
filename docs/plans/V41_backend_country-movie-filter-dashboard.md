# V41 — Country có phim cho user & cập nhật thống kê dashboard admin

## Trạng thái

✅ Hoàn thành — 2026-11-25. Backend build/type-check/test pass (53 suites / 454 tests); frontend build/type-check/test pass (37 files / 287 tests); lint không có error. Chưa commit/push.

## Người thực hiện & thời gian

| Hạng mục | Nội dung |
|---|---|
| Người thực hiện | Dev, AI coding agent |
| Bắt đầu | 2026-11-25 |
| Phạm vi | Backend (countries API) + Frontend (user home, admin dashboard/documents) |
| Methodology | Traditional |
| Complexity | Medium |

## 1. Mục tiêu

- Mở rộng `GET /api/countries` với cờ `hasMovies=true` để chỉ trả các `Country` có ít nhất một quan hệ với `Movie` qua bảng N-N `movie_countries`.
- Các trang user dùng chính `GET /api/countries?hasMovies=true` (qua `useGetCountries`); country chưa có phim không trả về.
- API admin không truyền `hasMovies` nên vẫn lấy đầy đủ country (không đổi hành vi hiện tại).
- Kết quả danh sách country được sắp xếp theo tên tiếng Việt (`viName ASC`), ổn định bằng `id ASC`.
- Trang chủ user giữ đúng **1 section Mỹ (US)** như thiết kế ban đầu; không tự động render tất cả country.
- Dashboard admin sửa thống kê "Phim theo quốc gia" để đọc đúng quan hệ N-N `movie.countries` thay vì field legacy `movie.country`.

## 2. Hiện trạng

- `Country` có quan hệ `@ManyToMany(() => Movie, movie => movie.countries)`; bảng nối là `movie_countries`.
- `Movie` trả `countries: Country[]` từ `MovieRepository.findAll()`.
- `GET /api/countries` hiện trả toàn bộ country, dùng cho admin.
- Trang chủ `frontend/src/app/(main)/(home)/page.tsx` đang hardcode `countryCommon` và gọi hook trong `.map()` (vi phạm React hooks rule).
- Dashboard admin `buildCountryDistribution()` đang đọc `movie.country?.viName`, trong khi backend trả `movie.countries`; vì vậy chart country không thống kê đúng.

## 3. Phạm vi

### Backend

- `backend/src/modules/countries/dto/country-search-request.dto.ts`
- `backend/src/modules/countries/countries.repository.ts`
- `backend/src/modules/countries/countries.service.ts`
- `backend/src/modules/countries/countries.controller.ts`
- `backend/src/modules/countries/countries.service.spec.ts`

### Frontend

- `frontend/src/apis/country.api.ts`
- `frontend/src/apis/genre-country.api.test.ts`
- `frontend/src/hooks/tankstack/useCountry.ts`
- `frontend/src/app/(main)/(home)/page.tsx`
- `frontend/src/shared/utils/admin-dashboard.ts`
- `frontend/src/shared/utils/admin-dashboard.test.ts`
- `frontend/src/app/(admin-layout)/dashboard/dashboard-client.tsx`

### Tài liệu

- `docs/BACKEND.md`
- `docs/FRONTEND.md`
- `docs/plans/PLAN_INDEX.md`

## 4. Phases

### Phase 1 — Backend: `GET /api/countries?hasMovies=true`

- [x] Thêm `CountrySearchRequestDto` với cờ `hasMovies?: boolean`.
- [x] `CountryRepository.findAll()` lọc bằng SQL `EXISTS` trên `movie_countries` khi `hasMovies=true`, tránh duplicate do join N-N.
- [x] Hỗ trợ `page`, `limit`, `keyword`, `filters`; mặc định sort `viName:ASC` + `id:ASC`.
- [x] `CountriesService.findAll()` bỏ cache cho query `hasMovies` để tránh stale quan hệ movie-country.
- [x] Giữ nguyên route `GET /api/countries`; admin không truyền cờ để lấy full.
- [x] Trả envelope `{ success, statusCode, message, result, pagination }`.

### Phase 2 — Frontend public: dùng chung `getAll` với `hasMovies`

- [x] `countryApi.getAll()` nhận thêm `hasMovies`; bỏ endpoint `/countries/with-movies`.
- [x] `useGetCountries()` gửi `hasMovies: true` — dùng cho dropdown lọc phim.
- [x] Trang chủ giữ `countryCommon` với đúng 1 section Mỹ (US), không map tất cả country.
- [x] Tách `CountryMovieSection` để section Mỹ gọi `useSearchMovies` một lần (không gọi hook trong `.map()`).
- [x] Chỉ render section Mỹ khi có movie.

### Phase 3 — Admin dashboard: sửa thống kê country

- [x] `buildCountryDistribution()` đọc `movie.countries` và đếm mỗi country.
- [x] Phim không có country vẫn vào nhóm `"Chưa xác định"`.
- [x] Cập nhật hint chart: một phim thuộc nhiều country được đếm ở từng country.
- [x] Giữ nguyên API admin `GET /api/countries` (full).

### Phase 4 — Test

- [x] Backend: test `findAll` truyền `hasMovies` xuống repository trong `countries.service.spec.ts`.
- [x] Frontend: test `countryApi.getAll({ hasMovies: true })` và `useGetCountries` gửi đúng cờ.
- [x] Frontend: cập nhật `admin-dashboard.test.ts` sang `movie.countries`, thêm case nhiều country.

### Phase 5 — Docs & gate

- [x] Cập nhật bảng endpoint country trong `docs/BACKEND.md`.
- [x] Cập nhật ghi chú API trong `docs/FRONTEND.md`.
- [x] Cập nhật `PLAN_INDEX.md` (index 41, next_index 42).
- [x] Chạy type-check/build/test liên quan backend + frontend.
- [x] Kiểm tra `git diff --check`; giữ thay đổi uncommitted.

## 5. Tiêu chí chấp nhận

- `GET /api/countries?hasMovies=true` chỉ trả country có ít nhất một movie.
- Danh sách trả về sort theo `viName ASC`, sau đó `id ASC`.
- `GET /api/countries` (không có `hasMovies`) vẫn trả đầy đủ country cho admin.
- Trang chủ user giữ đúng **1 section Mỹ (US)** như ban đầu; dropdown lọc phim chỉ hiện country có movie.
- Dashboard admin hiển thị chart "Phim theo quốc gia" có dữ liệu từ `movie.countries`.
- Test backend/frontend liên quan pass; type-check pass.

## 6. Rủi ro / lưu ý

- Trang chủ gọi thêm một request movie cho mỗi country (N+1 request). Dữ liệu country có movie hiện chưa lớn; nếu tăng nhiều sẽ cân nhắc endpoint aggregate hoặc giới hạn số country hiển thị.
- Sort `viName ASC` phụ thuộc collation PostgreSQL. Nếu cần thứ tự từ điển tiếng Việt chính xác (`A, Ă, Â, B, ...`), cần cấu hình ICU collation riêng; plan này giữ sort theo cột `vi_name` giống API country hiện tại.
- `movie_countries` cần index trên `country_id` nếu bảng lớn; kiểm tra `EXPLAIN` khi dữ liệu tăng.
