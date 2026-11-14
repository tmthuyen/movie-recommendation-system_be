# V33 — Tách consumer user/auth và xử lý email qua event

## Trạng thái

✅ Hoàn thành

## Người thực hiện & thời gian

- Người thực hiện: Copilot
- Thời gian thực hiện: 2026-11-14

## Phạm vi

- Tách `user.queue` và `auth.queue` theo đúng exchange/routing key.
- Validate và chuyển message về `EventEnvelope<TPayload>` trước khi dispatch.
- Xử lý các event auth cần gửi email thông qua `IMailService`.
- Dùng một khung email neumorphism dùng chung cho verification, verified và reset password.
- Loại bỏ logic DLQ bị đặt nhầm trong business user consumer.

## Phases

- [x] Phase 1 — Chuẩn hóa parser và payload event.
- [x] Phase 2 — Hoàn thiện user consumer.
- [x] Phase 3 — Thêm auth consumer và email templates.
- [x] Phase 4 — Đăng ký topology/providers và rà soát wiring.
- [x] Phase 5 — Kiểm tra diff/type contract; còn một lỗi type có sẵn tại `comments.service.spec.ts`.
