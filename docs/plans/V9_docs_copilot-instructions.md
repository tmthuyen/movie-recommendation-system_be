# V9 — Tạo hướng dẫn Copilot cho repository

## Trạng thái

Hoàn thành

## Người thực hiện & thời gian

- Người thực hiện: Copilot
- Thời gian: 2026-10-17

## Các module liên quan

- `.github/copilot-instructions.md`
- `backend/`
- `ai-service/`
- `frontend/`
- `docs/`
- `AGENTS.md` và các cấu hình AI assistant hiện có

## Phạm vi

1. Khảo sát cấu trúc repository, package manifests, tài liệu kiến trúc, quy ước và cấu hình trợ lý.
2. Xác nhận các lệnh build, test, lint và cú pháp chạy test đơn lẻ từ cấu hình hiện tại.
3. Tóm tắt kiến trúc liên service và các convention đặc thù cần cung cấp cho Copilot.
4. Tạo `.github/copilot-instructions.md` mà không ghi đè các hướng dẫn AI hiện có.
5. Kiểm tra file mới, diff và trạng thái worktree; không commit.

## Tiến độ

- [x] Tạo plan
- [x] Khảo sát tài liệu gốc và manifests
- [x] Khảo sát source/test để xác nhận convention thực tế
- [x] Tạo Copilot instructions
- [x] Kiểm tra nội dung và cập nhật trạng thái plan

## Kết quả

- Đã tạo `.github/copilot-instructions.md` với lệnh chạy theo từng service, lệnh test đơn lẻ, kiến trúc liên service, convention API/backend/AI/frontend và các ranh giới cần kiểm tra.
- Không có file `.github/copilot-instructions.md` cũ để hợp nhất; các hướng dẫn hiện có trong `AGENTS.md`, `ai-service/AGENTS.md`, `frontend/AGENTS.md` và `frontend/CLAUDE.md` đã được tham chiếu.
- Không commit hoặc push thay đổi.
