# AGENTS.md

Hướng dẫn chung cho AI coding agent khi làm việc trong repo này. Đọc các tài liệu gốc trong `docs/` và `backend/docs/` và `ai-service/docs/` trước khi tin README (README mô tả cấu trúc _dự kiến_, không phải hiện trạng).

## Dự án

- Các mô tả tổng quát dự án nằm trong `README.md`. Mô tả về dự án, công nghệ, cấu trúc thư mục, cách chạy lệnh, các tài liệu và file _.md_ tham chiếu.
- Dự án : **Ứng dụng mô hình ngôn ngữ vào hệ thống gợi ý phim**
- Bảng mô tả thư mục code:
  | Thư mục | Mô tả |
  |---------|-------|
  | `backend/` | Backend NestJS + TypeORM + PostgreSQL |
  | `ai-service/` | Hệ thông gợi ý phim với Semantic Search và Collaborative Filtering (ALS model) + API |
  | `frontend/` | Frontend NextJS + TailwindCSS + Shadcn UI |
  | `docs/` | Tài liệu tổng quan, quy ước code, kế hoạch triển khai, tóm tắt các module |

## Quy ước code & git

Dưới đây là quy ước chung cơ bản. Chi tiết các quy ước code (RULES) và các rule bắt buộc nằm trong `docs/BACKEND_RULES.md` — file đó chỉ được đọc, nếu sửa phải có developer yêu cầu (developer có thể tự sửa file đó).

- Không tự ý commit/push; chỉ commit khi được yêu cầu.

- Đảm bảo quy ước trả về của các API hợp lệ đúng format bao gồm các lỗi và thành công

## Quy trình của agent

- Khi nhận task/yêu cầu, agent **phải lập plan và lưu vào `docs/plans/`** trước khi triển khai.
  - Đặt tên theo version: `V{n}_{slug}.md` (V1, V2, … Vn),
  - tiêu đề `# V{n} — <mô tả>`,
  - ghi trạng thái,
  - người thực hiện & thời gian thực hiện,
  - Các module được sửa hoăc liên quan,
  - phạm vi — theo mẫu `docs/plans/V1_backend_update_tasks.md`.

- Các task trong plan phải mô tả rõ ràng và chia nhỏ thành phase hay subtask viết rõ trong plan đó để thực hiện. Đánh dấu tiến độ đã hoàn thành hay chưa

## Tài liệu tham chiếu

### Plans

Đây là các tài liệu mô tả kế hoạch triển khai, **agent được phép sửa** khi có yêu cầu. Thêm mới khi có task mới. Quản lý phiên bản và tên plan theo quy ước `V{n}_{slug}.md` (V1, V2, … Vn). Tiêu đề `# V{n} — <mô tả>`; ghi trạng thái, người thực hiện, phạm vi.

### Docs cho ai-service

Mô tả chi tiết các thao tác trong ai-service để agent hoặc dev tự thực hiện

- `ai-service/docs/**.md` hướng dẫn khởi động ai-service hoặc chạy các scripts python
