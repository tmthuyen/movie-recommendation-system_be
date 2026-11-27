# V46 — Frontend: admin failed events, lịch sử tương tác, dashboard theo kỳ, refresh và sửa movie genre/country

> **Trạng thái:** 🟢 Đã triển khai (2026-11-27) — P1–P8 xong, chờ QA tay trên stack thật
> **Người thực hiện:** AI agent (Big Pickle)
> **Thời gian lập plan:** 2026-11-27
> **Scope:** `frontend` (phối hợp backend V45)
> **Phạm vi file:** `frontend/src/app/(admin-layout)/**`, `frontend/src/app/(main)/my-history/**`, `frontend/src/components/movie/interaction-movie-list.tsx`, `frontend/src/components/sidebar/nav-data.ts`, `frontend/src/hooks/tankstack/**`, `frontend/src/apis/**`

---

## 1. Lỗi được giữ nguyên để đối chiếu

1. `failed event chưa có giao dieennj admin xem và quan lý`
2. `user chưa xem được lịch sử tương tác: rating, comment, chỉ có like và tương tác mấy`
3. `admin hiện tại dashboard chưa có thống kê rõ ràng, chưa có thống kê theo kỳ, theo range, chỉ là hard code`
4. `các trang adminn chưa có nút refresh data`
5. `Còn các phim chưa được thay đổi thể loại và country được, chỉ có thể thêm mới không có thêm, khi sửa movie batws buộc check genreids và countryIds có khớp với data hay không nếu không phải cập nhật lại`

---

## 2. Phases

### P1 — Trang admin failed events

- [x] API client + hook `useAdminFailedEvents` theo contract backend V45.
- [x] Route `/admin/failed-events`, nav item, bottom nav admin.
- [x] Bảng: thời gian, source, queue, routingKey, status, retryCount, error; filter keyword/status/ngày.
- [x] Dialog payload JSON; nút Retry confirm + toast; nút refresh.
- [x] Resolver không lấy `result` từ response retry.

### P2 — Lịch sử tương tác user

- [x] `MyInteractionList` có tabs: Tất cả / Đã xem / Yêu thích / Đánh giá / Bình luận.
- [x] Gọi `GET /api/interactions/my-activities?types=...`; giữ `/my-history`, `/my-favorites` tương thích.
- [x] Hiện sao cho rating (`score/5`) và nội dung comment rút gọn.
- [x] Nav item “Lịch sử tương tác”.

### P3 — Dashboard thật theo kỳ/range

- [x] `useAdminDashboard` gọi `GET /api/admin/dashboard/stats` với period/custom range.
- [x] Bỏ aggregate client từ 100 sample; filter áp dụng mọi widget.
- [x] Export CSV từ dữ liệu aggregate đã lấy.
- [x] Loading/error/empty đúng chuẩn hiện tại.

### P4 — Nút refresh mọi trang admin

- [x] Component refresh dùng chung: spinner, disable khi fetch, aria-label.
- [x] Đưa `PageHeader` vào client wrapper cho 7 trang: users, roles, genres, countries, people, movies, interaction (+ failed-events ở P1).
- [x] Mỗi nút invalidate đúng queryKey root.

### P5 — Sửa movie genre/country

- [x] `toNumberArray()` trả `[]` cho array rỗng.
- [x] Bỏ biến `countryId` thừa; map `peopleIds` từ `editing.moviePeoples`.
- [x] Form hiện lỗi validate BE (ID không tồn tại) bằng toast.
- [x] Chạy frontend `lint`, `type-check`, full Vitest, `next build`.

### P6 — Dirty-field payload cho form phim (bổ sung theo yêu cầu)

- [x] P6.1 — `AdminFormDialogProps.onSubmit` nhận thêm `dirtyFields` từ `formState.dirtyFields` của React Hook Form.
- [x] P6.2 — `movies-client.tsx`: chỉ đưa field dirty vào payload.
- [x] P6.3 — Riêng `genreIds/countryIds/peopleIds`: nếu dirty thì gửi kể cả `[]`; `undefined` chỉ xảy ra khi không dirty.
- [x] P6.4 — `peopleIds` vẫn map từ `editing.moviePeoples[].people.id`; không gửi `role` từ FE.
- [x] P6.5 — Toast lỗi validate BE (ID không tồn tại / transaction rollback).

### P7 — Admin quản lý user đầy đủ (bổ sung theo yêu cầu)

- [x] P7.1 — `users-client.tsx`: form sửa thêm `email`, `status` (4 giá trị), `isVerified`; giữ dialog gán role riêng.
- [x] P7.2 — Dùng dirty-field payload như movie.
- [x] P7.3 — `users-columns.tsx`: hiện rõ `status`, `isVerified`, `roles`, `createdAt`, `updatedAt`.
- [x] P7.4 — `user-filter-fields.ts`: thêm filter `isVerified`; giữ filter `status`.
- [x] P7.5 — Thêm dialog “Xem chi tiết user”: profile + roles + providers (`local`/`google`) + createdAt/updatedAt.
- [x] P7.6 — Toast/lỗi 403/409/400 theo envelope hiện tại.

Test P6/P7:
- [x] mở form movie sửa rồi bấm Lưu không đổi → body `{}`;
- [x] bỏ hết country → gửi `countryIds: []`;
- [x] admin đổi status user → payload có đúng `status`/`isVerified`.

### P8 — Login sai thông tin: 401 auth không được gọi refresh token (bổ sung theo yêu cầu)

> Lỗi hiện tại: interceptor của `axiosClient` bắt mọi `401` → gọi `/auth/refresh`, làm mất message `Email hoặc mật khẩu không chính xác` của `/auth/login`.

- [x] P8.1 — `axiosClient.ts`: phân biệt 401 từ endpoint auth vs 401 hết access token. Skip refresh với `/auth/login`, `/auth/register`, `/auth/login-google` (và `/auth/refresh` như cũ); trả nguyên error gốc, không xoá token của session hiện tại.
- [x] P8.2 — Giữ nguyên single-flight refresh cho các request có access token hết hạn.
- [x] P8.3 — `login-form.tsx`: sửa precedence `setError('Lỗi...' + message || fallback)` để hiện đúng message backend.
- [x] P8.4 — Cập nhật `axiosClient.test.ts` (file có sẵn): login/register/login-google 401 → không gọi refresh, message gốc được giữ.

---

## 3. Definition of Done

- Không bịa endpoint; đối chiếu `docs/BACKEND.md` sau khi V45 cập nhật.
- Envelope FE đọc đúng `{result,pagination}`; retry failed-event không đọc `result`.
- Responsive, dark mode, a11y, motion theo `docs/FRONTEND_RULES.md`.
- Không commit/push; không đụng `.env`; không xoá `gateway/kong.yml`.
