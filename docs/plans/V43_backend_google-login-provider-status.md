# V43 — Google login: ưu tiên `user_providers`, check status trước khi cấp session

> **Trạng thái:** 🟢 Đã triển khai (2026-11-26) — chờ QA tay trên stack thật  
> **Người thực hiện:** AI agent (Big Pickle)  
> **Thời gian lập plan:** 2026-11-26  
> **Thời gian triển khai:** 2026-11-26  
> **Scope:** `backend`  
> **Phạm vi file:** `backend/src/modules/auth/auth.service.ts`, `backend/src/modules/auth/auth.service.spec.ts`, plan này

---

## 1. Mục tiêu

Sửa `AuthService.loginWithGoogle()` để login Google **check đúng bảng theo thứ tự**, không bỏ sót liên kết `user_providers` và không cấp session cho user bị khóa.

---

## 2. Hiện trạng / vấn đề

Code hiện tại:

1. `usersService.findByEmail(email)` trước.
2. Có user → `this.login()` ngay:
   - ❌ không check `status`
   - ❌ không đọc/ghi `user_providers`
3. Chỉ khi **không có user theo email** mới truy `user_providers`; nếu có provider thì `remove()` rồi tạo user mới.

Hệ quả:

- Email đã tồn tại (đăng ký thường / login cũ) nhưng chưa có provider → login vẫn ok nhưng `user_providers` trống mãi.
- User `BLOCKED`/`INACTIVE` vẫn được callback tạo session Redis + cookie; chỉ bị chặn muộn ở `/auth/refresh`.
- Google đổi email → provider cũ bị xóa, tạo user mới, mất liên kết.

---

## 3. Luồng đích (check bảng theo thứ tự)

1. **`user_providers`** — `findOne(provider='google', providerId=googleId)`.
2. **Có provider row** → **`users`** theo `provider.userId` (`findByIdWithRoles`):
   - Không thấy user → xóa provider stale, rơi xuống bước 3.
   - Thấy user → check status:
     - `BLOCKED` / `INACTIVE` → `UnauthorizedException('Tài khoản bị khóa hoặc không tồn tại')`.
     - `UNVERIFIED` vẫn cho qua (đồng nhất `validateUser` / `refreshToken` hiện tại).
   - `user.email !== google.email` → log warn + `UnauthorizedException('Google provider đang liên kết với tài khoản khác')` (không tự merge).
   - Hợp lệ → `login(user, deviceInfo)`.
3. **Không có provider row** → **`users`** theo `email` (`findByEmail`, đã load roles):
   - Có user → check status như trên → `INSERT user_providers(userId, provider, providerId)` → `login()`.
   - Không có user → transaction: `INSERT users(status=ACTIVE, isVerified=true, role='user')` + `INSERT user_providers` + `publishUserCreated()` → `login()`.
4. **Bỏ** đoạn `remove(existingProvider)` cũ. Nhánh tạo user chỉ chạy khi provider **và** email đều không có.

### Ràng buộc DB

- `users.email` unique (`UQ_USERS_EMAIL`) → không tạo user mới khi email đã có.
- `user_providers(provider, providerId)` unique → insert/upsert cẩn thận khi login đồng thời.

---

## 4. Giới hạn

- ❌ Không đổi controller, strategy, guard, DTO, schema event hay queue.
- ❌ Không đổi luồng login thường (`validateUser`) và `refreshToken` (chỉ dùng chung rule status).
- ❌ Không tạo file test mới; bổ sung test trong `auth.service.spec.ts`.
- ❌ Không commit/push.

---

## 5. Phases / checklist

### Phase 1 — Code

- [x] Thêm helper `assertActiveUser(user)` dùng chung rule `BLOCKED`/`INACTIVE`.
- [x] Đổi `loginWithGoogle()` theo luồng mục 3.
- [x] Xóa logic `remove(existingProvider)` trong nhánh tạo user mới.

### Phase 2 — Test

- [x] Bổ sung mock `dataSource.findOne/save/remove` và `userProducer.publishUserCreated`.
- [x] Test provider tồn tại + user ACTIVE → login theo `provider.userId`, không gọi `findByEmail`.
- [x] Test provider tồn tại + user BLOCKED/INACTIVE → lỗi, không tạo session.
- [x] Test provider tồn tại + email khác → conflict.
- [x] Test provider tồn tại + user missing → xóa provider stale, fallback email.
- [x] Test không provider + email ACTIVE → link provider, không tạo user.
- [x] Test không provider + email BLOCKED → lỗi, không lưu provider.
- [x] Test không provider + email missing → create user + provider + publish `user.created`.

### Phase 3 — Gate

- [x] `npm test -- --runInBand src/modules/auth/auth.service.spec.ts`
- [x] `npm test -- --runInBand` (full backend)
- [x] `git diff --check`

---

## 6. Ghi chú

Task 2 (chuyển gateway sang Nginx) nằm ở `V44_cicd_kong-to-nginx.md`; thực hiện **sau khi task 1 xong**. Không commit/push cho đến khi developer yêu cầu.
