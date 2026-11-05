# V22 — Sửa cấu hình email boolean và RoleService trả đúng lỗi HTTP

## Thông tin chung

| Hạng mục | Nội dung |
|---|---|
| Trạng thái | ✅ Hoàn thành (2026-11-05) |
| Người thực hiện | AI Agent (main) |
| Thời gian | 2026-11-05 |
| Scope | `backend` |
| Nhánh | `ci-cd` |
| Module liên quan | `backend/src/config/env.validation.ts`, `backend/src/modules/auth/auth.service.ts`, `backend/src/infrastructure/mail/providers/nodemailer.provider.ts`, `backend/src/modules/roles/roles.service.ts` |
| Không sửa | `docs/BACKEND_RULES.md`; hành vi nghiệp vụ ngoài phạm vi 2 bug dưới đây |

## Bối cảnh

1. **Email boolean bị đảo giá trị**: `validateConfiguration()` dùng `enableImplicitConversion: true` của `class-transformer`. Với property type `boolean`, class-transformer ép bằng `Boolean(value)`, nên chuỗi `"false"` trong `.env` thành `true`.
   - Hệ quả: `ASYNC_MAIL_ENABLED=false` vẫn đẩy email qua RabbitMQ; `MAIL_SECURE=false` vẫn bật TLS trong `NodemailerProvider`.
   - Test hiện tại `env.validation.spec.ts` đang **khoá lại bug** (`expect(result.MAIL_SECURE).toBe(true)`), cần sửa test theo hành vi đúng.
2. **RoleService trả 500 thay vì 404**: `findOne()` và `remove()` ném `new Error(...)` thường, không phải `NotFoundException`; exception filter của Nest biến thành 500.

## Mục tiêu

- `.env` nhận đúng boolean: `true/false`, `1/0`, `TRUE/FALSE` (case-insensitive); giá trị không hợp lệ bị `@IsBoolean` chặn khi khởi động.
- Các service đọc boolean bằng kiểu `boolean`, không so sánh chuỗi `=== 'true'`.
- `RolesService.findOne/remove` ném `NotFoundException` → API trả 404 đúng envelope lỗi.
- Có test khoá lại cả 2 hành vi; full backend suite vẫn xanh.

## Phases

### Phase 0 — Chuẩn bị
- [x] Tạo plan V22 + cập nhật `PLAN_INDEX.md`.

### Phase 1 — Sửa email boolean
- [x] `env.validation.ts`: bỏ `enableImplicitConversion`; thêm `@Type(() => Number)` cho `APP_PORT`, `DB_PORT`, `REDIS_PORT`, `MAIL_PORT`; thêm `@Transform(toBoolean)` cho `ASYNC_MAIL_ENABLED`, `MAIL_SECURE`.
- [x] `auth.service.ts`: đọc `ASYNC_MAIL_ENABLED` dạng `boolean`.
- [x] `nodemailer.provider.ts`: đọc `MAIL_SECURE` dạng `boolean`.
- [x] Cập nhật `env.validation.spec.ts` + `nodemailer.provider.spec.ts` theo hành vi đúng (bỏ case "BUG tiềm ẩn").
- [x] Thêm case: `"false"` → `false`, `"true"` → `true`, `"FALSE"`/`"0"` → `false`, giá trị rác → lỗi `isBoolean`.

### Phase 2 — Sửa RoleService
- [x] `roles.service.ts`: `findOne/remove` ném `NotFoundException`.
- [x] Cập nhật `roles.service.spec.ts` assert `NotFoundException` (không chỉ message).
- [x] Bổ sung test controller: envelope thành công + lỗi 404 (nếu khả thi không cần HTTP server).

### Phase 3 — Kiểm tra & báo cáo
- [x] `npx jest --runInBand --coverage` xanh, coverage không tụt dưới ngưỡng.
- [x] `npm run type-check`, `npm run lint` không phát sinh error mới.
- [x] Ghi kết quả + rủi ro còn lại vào plan này.
- [x] Không commit.

## Acceptance

- [x] Không còn `enableImplicitConversion` cho boolean; `"false"` không còn bị đổi thành `true`.
- [x] `ASYNC_MAIL_ENABLED`/`MAIL_SECURE` được đọc đúng kiểu ở mọi nơi.
- [x] `GET/DELETE /api/roles/:id` với id không tồn tại trả 404 (qua `NotFoundException`).
- [x] Test mới khoá hành vi; full backend suite xanh.

## Kết quả thực hiện

| Hạng mục | Kết quả |
|---|---|
| Test | 45 suite / **335 test** pass (thêm 4 test controller) |
| Coverage | **72.58%** statements / **72.25%** lines (không tụt) |
| Type-check | ✅ `tsc --noEmit` sạch |
| Lint | ✅ **0 error** (208 warning có sẵn từ trước) |

Chi tiết thay đổi:

- `env.validation.ts`: thêm `toBoolean()` (nhận `true/false`, `1/0`, `yes/no`, `on/off`, case-insensitive; giá trị lạ giữ nguyên để `@IsBoolean` báo lỗi), bỏ `enableImplicitConversion`, dùng `@Type(() => Number)` cho các trường số.
- `auth.service.ts`: `ASYNC_MAIL_ENABLED` so sánh boolean trực tiếp.
- `nodemailer.provider.ts`: `MAIL_SECURE` đọc boolean; `port` ép number.
- `roles.service.ts`: `findOne/remove` ném `NotFoundException` → HTTP 404 đúng envelope.
- Test: `env.validation.spec.ts`, `nodemailer.provider.spec.ts`, `roles.service.spec.ts`, `roles.controller.spec.ts`.

Rủi ro còn lại:

- Giá trị boolean không hợp lệ (ví dụ `"maybe"`) làm app **không khởi động** (fail-fast) — đây là hành vi mong muốn; cần ghi rõ trong `.env.example` nếu có.
- Controller spec chỉ test ở tầng controller (không dựng HTTP server); envelope lỗi 404 thực tế do exception filter đảm bảo, đã có test filter riêng.

## Ghi chú

- Không sửa `docs/BACKEND_RULES.md` (read-only).
- Các follow-up khác trong V19 (storage delete, InteractionConsumer, EventPublisher...) nằm ngoài phạm vi plan này.
