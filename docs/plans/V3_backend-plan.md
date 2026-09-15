# V3 Backend Plan: Auth, User, RBAC & Security

Tài liệu này mô tả chi tiết kế hoạch triển khai các tính năng cốt lõi tiếp theo cho Backend NestJS, bao gồm xác thực (Auth), quản lý người dùng (User), phân quyền (RBAC) và bảo mật, bám sát theo các quy tắc trong `BACKEND_RULES.md`.

## User Review Required

> [!WARNING]
> Kế hoạch này yêu cầu sử dụng **Redis** cho các tính năng: Rate Limiting, JWT JTI Blacklist (Revoke token). Cần đảm bảo Redis đã được tích hợp (hiện tại trong `BACKEND.md` ghi nhận chưa kết nối Redis dù có trong docker-compose).

> [!IMPORTANT]
> Cần thống nhất về dịch vụ gửi Mail (SMTP/Nodemailer hay các service như SendGrid/AWS SES) cho tính năng xác thực email đăng ký.

## Quyết định Thiết kế (Từ User Feedback)

> [!NOTE]
> 1. **Lưu trữ Session & Token xác thực:** Sử dụng **Redis** để lưu `user_sessions` (key-value) cho tốc độ cao. Các fields: `token` (opaque random), `deviceId`, `type`, `ip`, `expireAt`, và một số thông tin thiết bị (userAgent, browser, os, lastActivityAt) để tăng cường bảo mật quản lý thiết bị.
> 2. **Dịch vụ Mail:** Thiết kế pattern mở rộng (Interface/Strategy). Trước mắt implement provider `nodemailer`, dễ dàng thay thế sang AWS SES hoặc SendGrid về sau.
> 3. **Phân quyền User/Admin:**
>    - **Admin:** Full quyền (xem, sửa, xóa, chặn user).
>    - **User:** Xem profile, sửa password, sửa thông tin, đăng xuất thiết bị.

## Proposed Changes

---

### Cấu hình Hạ tầng & Tích hợp (Infrastructure)
Bổ sung các kết nối cần thiết để hỗ trợ Security và Caching.

#### [NEW] `src/config/redis.config.ts`
- Cài đặt `ioredis` và module liên quan để kết nối Redis.
- Dùng Redis cho `@nestjs/throttler` (Rate limit) và Cache.

#### [NEW] `src/modules/mail/`
- Tạo Mail module sử dụng `nodemailer` để gửi email xác thực và reset mật khẩu.

---

### Database Entities
Tạo các bảng mới và cập nhật bảng cũ để hỗ trợ luồng Auth và Security.

#### [MODIFY] `src/modules/users/entities/user.entity.ts`
- Thêm trường `status` (Enum: `UNVERIFIED`, `ACTIVE`, `INACTIVE`...). Mặc định khi đăng ký là `UNVERIFIED`.
- Thêm quan hệ One-to-Many với `UserSession` và `Token`.

#### [NEW] `src/modules/permissions/entities/permission.entity.ts`
- Bảng `permissions` (`id`, `action`, `resource`, `description`).
- Tạo bảng trung gian `role_permissions` kết nối Many-to-Many giữa `Role` và `Permission`.

#### [NEW] `src/modules/auth/entities/user-session.entity.ts`
- Bảng `user_sessions` để quản lý thiết bị đăng nhập (`id`, `userId`, `refreshToken` (hashed/opaque), `deviceInfo`, `ipAddress`, `expiresAt`, `isRevoked`).

#### [NEW] `src/modules/auth/entities/token.entity.ts`
- Bảng `tokens` quản lý mã xác thực (`id`, `userId`, `token`, `type` [VERIFY_EMAIL, RESET_PASSWORD], `expiresAt`, `isUsed`).

---

### User Module
Hoàn thiện các API quản lý người dùng.

#### [MODIFY] `src/modules/users/users.controller.ts` & `users.service.ts`
- Hoàn thiện các STUB API: `GET /api/users` (có Pagination), `GET /api/users/:id`, `PATCH /api/users/:id`, `DELETE /api/users/:id`.
- Thêm `GET /api/users/me` trả về thông tin user đang đăng nhập (lấy từ request user qua jwt token).

---

### Auth Module
Nâng cấp bảo mật đăng nhập, phiên hoạt động (sessions) và quy trình xác thực.

#### [MODIFY] `src/modules/auth/auth.service.ts`
- **Login:** 
  - Đổi logic `findByEmail` ném 401 Unauthorized thay vì 404 NotFound.
  - Đưa scopes (từ roles + permissions) vào JWT AccessToken.
  - Tạo Opaque String (random) cho RefreshToken, lưu thông tin vào bảng `user_sessions`.
- **Register:** Tạo user `UNVERIFIED`, sinh token (bảng `tokens`), gửi mail xác thực.

#### [MODIFY] `src/modules/auth/auth.controller.ts`
- **Login API:** Trả về `{ accessToken }` trong JSON, set `refreshToken` vào **httpOnly cookie**.
- **[NEW API] Logout:** Thu hồi phiên làm việc hiện tại, đưa JWT ID (`jti`) vào Redis Blacklist, xóa cookie.
- **[NEW API] Logout All / Logout by SessionId:** Xóa các bản ghi `user_sessions` tương ứng.
- **[NEW API] Refresh Token:** Validate `refreshToken` từ cookie, kiểm tra `user_sessions`, rotate refreshToken mới, và revoke accessToken cũ nếu cần.
- **[NEW API] Verify Email:** Xác nhận token, chuyển user sang `ACTIVE`.
- **[NEW API] Forgot & Reset Password.**

#### [NEW] `src/modules/auth/guards/jwt-blacklist.guard.ts`
- Middleware hoặc Guard kiểm tra `jti` của accessToken có nằm trong Redis blacklist hay không.

---

### RBAC (Permissions)
Hoàn thiện hệ thống phân quyền chi tiết.

#### [MODIFY] `src/modules/permissions/permissions.service.ts` & `permissions.controller.ts`
- Xóa các STUB, thay thế bằng logic CRUD thực sự tương tác với database.
- Cung cấp API gán permissions cho roles.

#### [MODIFY] `src/common/guards/roles.guard.ts`
- Mở rộng logic hoặc tạo thêm `PermissionsGuard` để check permissions (scopes) trong JWT Payload.

---

### Security & Rate Limiting
Triển khai các biện pháp bảo vệ hệ thống.

#### [MODIFY] `src/app.module.ts`
- Tích hợp `@nestjs/throttler` (Sử dụng Redis store nếu có).
- Đăng ký `ThrottlerGuard` ở mức global.

#### [NEW] `src/common/guards/custom-throttler.guard.ts` (Nếu cần)
- Custom rate limit theo IP (`req.ip`) và UserId (`req.user?.id`) đối với các API quan trọng (đăng nhập, reset password).

## Verification Plan

### Automated Tests
- Bổ sung unit tests cho các service tạo token, mã hóa, validate login.
- Cập nhật e2e tests cho luồng đăng ký -> xác thực email -> đăng nhập.

### Manual Verification
1. Dùng Swagger/Postman gọi API đăng ký, lấy token từ database/console giả lập email để verify.
2. Login thành công, kiểm tra xem `refreshToken` có được set ở `httpOnly` cookie không.
3. Giải mã JWT `accessToken` kiểm tra `scopes` và `jti`.
4. Gọi API refresh token và xác nhận `refreshToken` bị thay đổi.
5. Gọi API logout và kiểm tra `accessToken` cũ bị từ chối truy cập.
6. Test các API với quyền khác nhau để kiểm tra `PermissionsGuard`.
