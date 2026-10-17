# V12 — Backend Docs & AGENTS.md cập nhật

- **Trạng thái**: ✅ Hoàn thành
- **Người thực hiện**: AI Agent (subagent)
- **Thời gian thực hiện**: 2026-10-17
- **Module liên quan**: `docs/` (không sửa code), `AGENTS.md`
- **Phạm vi**: `docs/BACKEND.md` (viết lại toàn bộ) + `AGENTS.md` (mở rộng) — **KHÔNG sửa file code**, KHÔNG sửa `docs/BACKEND_RULES.md`, KHÔNG sửa `docs/FRONTEND_RULES.md`.

## Bối cảnh

`docs/BACKEND.md` cũ chỉ mô tả thời điểm backend mới có auth/users/roles và ghi sai rằng Redis/RabbitMQ chưa được kết nối. Hiện trạng backend đã có đầy đủ movies, genres/countries/peoples, ratings, comments, interactions, files, failed-events, WebSocket gateway, RabbitMQ producers + DLQ consumers, rate-limit, S3/R2, mail... Cần viết lại tài liệu theo code thật và cập nhật `AGENTS.md` để agent sau đọc đúng.

## Task checklist

- [x] Đọc toàn bộ `backend/src` (main.ts, app.module, từng controller/service/DTO/repository/entity, guards, filters, interceptors, rate-limit, messaging, cron, gateway, config)
- [x] Verify `docs/BACKEND_RULES.md` tồn tại và **không sửa**
- [x] Viết lại toàn bộ `docs/BACKEND.md` theo cấu trúc: About / Techstacks / Kiến trúc & Cấu trúc thư mục / Quy ước Response / Các API hiện có (bảng từng module) / WebSocket events / RabbitMQ events / Database entities / Port & CORS & Rate limit / Lưu ý cho Frontend-Client
- [x] Ghi rõ các điểm cần chú ý: envelope do controller tự trả; `RolesGuard` chỉ gắn ở `/api/roles` nên `@Roles` tại movies/users/... không được enforce; `POST /api/failed-events/:id/retry` không có `result`; `GET /api/health` không envelope; module `permissions` là stub
- [x] Cập nhật `AGENTS.md`: thêm mục `## Công nghệ hiện tại`, `## Tài liệu & Quy tắc`, rule bắt buộc đọc `docs/BACKEND.md`/`docs/FRONTEND.md` khi làm client-server; đổi quy ước tên plan sang `V{n}_{scope}_{slug}.md` (scope ∈ frontend|backend|ai); giữ nguyên git rules và quy trình plan
- [x] Kiểm tra lại nội dung 3 file sau khi ghi

## Ghi chú

- Plan này chỉ phục vụ task tài liệu; không thay đổi runtime backend.
- Endpoint/path/field trong `docs/BACKEND.md` đối chiếu trực tiếp từ code — khi code thay đổi phải cập nhật lại tài liệu tương ứng.
