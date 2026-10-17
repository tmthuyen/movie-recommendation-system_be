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
  | `gateway/` | Cấu hình Kong gateway (`kong.yml`) |

## Công nghệ hiện tại

Bảng tóm tắt nhanh (chi tiết trong `docs/BACKEND.md`, `docs/AI-SERVICE.md`, README):

  | Thành phần | Công nghệ / Cổng |
  |-----------|------------------|
  | backend | NestJS 11 + TypeORM + PostgreSQL (synchronize, không migration) — **:8081**, global prefix `api`, Swagger `/api`, Socket.IO cùng cổng |
  | ai-service | FastAPI — **:8082**, prefix `/api/recommendations` |
  | frontend | Next.js + TailwindCSS + Shadcn UI — **:3002**, gọi thẳng backend `http://localhost:8081/api` |
  | gateway | Kong (`gateway/kong.yml`) — **:8000**: `/api` → 8081, `/api/recommendations` → 8082 |
  | Hạ tầng | PostgreSQL, Redis (session/blacklist/rate-limit), RabbitMQ (exchanges movie/user/interaction + DLQ → `failed_events`), Chroma (ai-service), Docker |

- Backend ↔ ai-service giao tiếp **qua RabbitMQ**, không HTTP-call lẫn nhau.
- **Backend không có endpoint recommendation** — recommendation do ai-service cung cấp (`/api/recommendations`).

## Quy ước code & git

Dưới đây là quy ước chung cơ bản. Chi tiết các quy ước code (RULES) và các rule bắt buộc nằm trong `docs/BACKEND_RULES.md` — file đó chỉ được đọc, nếu sửa phải có developer yêu cầu (developer có thể tự sửa file đó).

- Không tự ý commit/push; chỉ commit khi được yêu cầu.

- Đảm bảo quy ước trả về của các API hợp lệ đúng format bao gồm các lỗi và thành công

- **Rule BẮT BUỘC khi làm client-server (frontend ↔ backend/ai-service)**: agent **PHẢI đọc endpoint trong `docs/BACKEND.md`** (và `docs/FRONTEND.md` nếu có) để đảm bảo method / path / auth / request DTO / response envelope đúng hiện trạng — **không bịa endpoint**, không suy đoán từ ký ức.

## Tài liệu & Quy tắc

- **Backend rules** → `docs/BACKEND_RULES.md`: **CHỈ ĐỌC**, không sửa khi chưa được developer yêu cầu.
- **Frontend rules** → `docs/FRONTEND_RULES.md`: chỉ trỏ dẫn, **KHÔNG sửa nội dung file đó**.
- **Mô tả service (hiện trạng, cập nhật theo code)**:
  - `docs/BACKEND.md` — backend NestJS: techstack, cấu trúc `src/`, quy ước response (envelope), **bảng endpoint đầy đủ từng module**, WebSocket events, RabbitMQ events, entities, port/CORS/rate-limit, lưu ý cho client.
  - `docs/FRONTEND.md` — frontend NextJS.
  - `docs/AI-SERVICE.md` — ai-service FastAPI.
- Quy ước code backend (RULES) và các rule bắt buộc: `docs/BACKEND_RULES.md` (chỉ đọc).

## Quy trình của agent

- Khi nhận task/yêu cầu, agent **phải lập plan và lưu vào `docs/plans/`** trước khi triển khai.
  - Đặt tên file plan theo định dạng: `V{index}_{scope}_{task_name}.md`
    - `{index}`: số thứ tự liên tục (integer), bắt đầu từ 0. Chỉ số được đánh số tuần tự dựa trên toàn bộ plans đã có trong `docs/plans/` (xem `PLAN_INDEX.md` để tra cứu index hiện tại và next index).
    - `{scope}`: phải thuộc enum `backend` | `frontend` | `cicd` | `ai` (thêm `cicd` vào scope enum). Lưu ý: các plan cũ có thể dùng `ai-service` trong slug nhưng scope được chuẩn hoá thành `ai` khi đặt tên mới.
    - `{task_name}`: tên task dạng slug (lowercase, dùng dấu `-` thay khoảng trắng), mô tả ngắn gọn công việc.
    - Ví dụ: `V0_init-plan.md`, `V1_cicd_ci-cd-split-workflows.md`, `V2_backend_retrieval-target-validation.md`, `V3_backend_retrieval-api.md`
  - Tiêu đề trong file: `# V{index} — <mô tả>`
  - Phải ghi đầy đủ: trạng thái, người thực hiện & thời gian thực hiện, các module được sửa hoặc liên quan, phạm vi (theo mẫu `docs/plans/V1_backend-plan.md`).
  - Khi tạo plan mới, agent **phải cập nhật `docs/plans/PLAN_INDEX.md`** để ghi lại mapping file ↔ index ↔ scope ↔ mô tả và tính toán `next_index = max(index)+1`.
  - Khi phát hiện sai số thứ tự (index trùng lặp, thiếu liên tục), cần đề xuất sắp xếp lại tên file theo thứ tự hợp lý, **chỉ thực hiện rename sau khi có xác nhận từ người dùng** và đồng thời cập nhật `PLAN_INDEX.md` tương ứng.

- Các task trong plan phải mô tả rõ ràng và chia nhỏ thành phase hay subtask viết rõ trong plan đó để thực hiện. Đánh dấu tiến độ đã hoàn thành hay chưa
- Khi làm việc với scope `cicd`, ưu tiên tạo nhánh Git có prefix `cicd/` (ví dụ: `cicd/split-workflows`, `cicd/update-deploy-action`).

## Tài liệu tham chiếu

### Plans

Đây là các tài liệu mô tả kế hoạch triển khai, **agent được phép sửa** khi có yêu cầu. Thêm mới khi có task mới. Quản lý tên file plan theo định dạng `V{index}_{scope}_{task_name}.md` với `scope` ∈ `backend` | `frontend` | `cicd` | `ai`. Index là số thứ tự liên tục (0,1,2,...), bắt đầu từ 0. Tiêu đề trong file: `# V{index} — <mô tả>`. Phải cập nhật `docs/plans/PLAN_INDEX.md` khi thêm/sửa/xoá hoặc đổi tên plan. Xem chi tiết quy trình tại mục "Quy trình của agent".

### Docs cho ai-service

Mô tả chi tiết các thao tác trong ai-service để agent hoặc dev tự thực hiện

- `ai-service/docs/**.md` hướng dẫn khởi động ai-service hoặc chạy các scripts python
