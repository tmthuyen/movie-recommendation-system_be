# V32 — Luồng user profile và vector qua RabbitMQ

## Trạng thái

✅ Hoàn thành

## Người thực hiện & thời gian

- Người thực hiện: Copilot
- Thời gian: 2026-11-14

## Phạm vi

- Backend NestJS: chuẩn hóa payload và routing key cho user profile, user created và user deleted.
- Frontend Next.js: gửi preferences onboarding/profile qua endpoint user hiện có.
- AI service: hoàn thiện `UserQueue`, `UserEventHandler`, embedding profile và xóa vector.
- Kiểm thử contract, queue handler và vector profile.

## Phases

- [x] Phase 1 — Chuẩn hóa event contract giữa NestJS và ai-service.
- [x] Phase 2 — Phát event từ user create/update/delete trong backend.
- [x] Phase 3 — Xử lý user events và vector profile trong ai-service.
- [x] Phase 4 — Kiểm tra frontend onboarding và cập nhật contract test hiện có.
- [x] Phase 5 — Chạy kiểm tra liên quan; type-check còn một lỗi có sẵn ngoài phạm vi tại `comments.service.spec.ts`.
