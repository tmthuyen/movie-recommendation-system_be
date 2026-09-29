# V6-message-queue: RabbitMQ Messaging Architecture Refactoring

## 1. Tình trạng hiện tại (Current Flaws)
- Cấu hình RabbitMQ ở backend (NestJS) và AI-service (Python) đang bị phân mảnh, chưa quy hoạch chuẩn theo Domain-Driven Design (DDD).
- Routing keys, Exchange, Queue đặt tên chưa thống nhất (`movie.exchange`, `movie.#` nhưng lại dùng cho cả user).
- Backend chưa publish đầy đủ các sự kiện quan trọng của User (như created, updated, deleted, security_updated).
- Xử lý Dead Letter Queue (DLQ) và Retry ở Python hiện tại đang dùng `x-death` từ việc nack+requeue, dễ gây loop vô tận hoặc block queue nếu code lỗi cố định. Chưa có kiến trúc DLX chuẩn chỉ.

## 2. Kiến trúc đề xuất (Proposed Architecture)

### 2.1. Naming Conventions & Exchanges
- **Exchange Chính (Topic):** `movie_rec.events.topic` (Sẽ dùng chung cho toàn bộ system, thay vì tạo exchange riêng lẻ).
- **Dead Letter Exchange (Topic):** `movie_rec.dlx`
- **Routing Key Pattern:** `<domain>.<entity>.<action>`

### 2.2. Phân loại Domain & Events
| Domain | Event / Routing Key | Payload (Ví dụ) |
| :--- | :--- | :--- |
| **Movie** | `movie.movie.created` | `{ id, title, genres, overview }` |
| | `movie.movie.updated` | `{ id, title, genres, overview }` |
| | `movie.movie.deleted` | `{ id }` |
| **User** | `user.user.created` | `{ id, email, username }` |
| | `user.user.updated` | `{ id, email, preferences }` |
| | `user.user.deleted` | `{ id }` |
| | `user.security.updated`| `{ id, action: 'password_changed' }` |
| **Interaction** | `interaction.movie.clicked` | `{ user_id, movie_id, score }` |
| | `interaction.movie.rated` | `{ user_id, movie_id, rating, score }` |

### 2.3. Cấu hình Queue (Consumer - AI Service)
AI Service sẽ lắng nghe các event liên quan để cập nhật VectorDB và retrain model.
- **Queue Name:** `ai_service.recommendation.queue`
- **Routing Keys (Bindings):**
  - `movie.movie.#` (Lắng nghe mọi thay đổi của phim)
  - `user.user.#` (Lắng nghe mọi thay đổi của user)
  - `interaction.#` (Tùy chọn cho luồng real-time training)
- **Dead Letter Setup:**
  - Config `x-dead-letter-exchange`: `movie_rec.dlx`
  - Config `x-dead-letter-routing-key`: `<nguyên_bản>`
- **DLQ Name:** `ai_service.recommendation.dlq` (Bind vào DLX bằng `#`)

## 3. Lộ trình thực hiện (Implementation Tasks)

### Pha 1: Refactor NestJS (Producer)
1. **Sửa đổi `messaging.module.ts`**:
   - Cấu hình lại `ClientsModule` để trỏ vào `movie_rec.events.topic`.
2. **Cập nhật `event-publisher.service.ts`**:
   - Viết lại hàm `publishEvent(routingKey, payload)`.
   - Đảm bảo có Typing rõ ràng cho từng loại Event (MovieEvent, UserEvent).
3. **Inject vào các Services (UsersService, MoviesService)**:
   - Chèn logic publish cho User: `created`, `updated`, `deleted`, `security_updated`.
   - Review lại logic publish cho Movie.

### Pha 2: Refactor FastAPI (Consumer & DLQ)
1. **Sửa đổi `core/config.py`**:
   - Cập nhật các biến môi trường cho Exchange mới (`movie_rec.events.topic`), Queue (`ai_service.recommendation.queue`), và DLX (`movie_rec.dlx`).
2. **Cập nhật `core/message_queue.py`**:
   - Khai báo Exchange, DLX, Queue, DLQ đúng chuẩn.
   - Bind Queue với nhiều Routing Keys (`movie.#`, `user.#`).
   - Tinh chỉnh logic Retry: 
     - Lỗi validate dữ liệu -> Vào DLQ ngay (Reject/Nack `requeue=False`).
     - Lỗi kết nối -> Retry tối đa N lần rồi vào DLQ.
3. **Cập nhật Handlers (`movie_event_handler.py`, tạo thêm `user_event_handler.py`)**:
   - Xây dựng Factory pattern (hoặc Dictionary map) để định tuyến xử lý dựa trên `routing_key`. Thay vì đọc `eventType` trong body, dùng thẳng `routing_key` của RabbitMQ để phân loại.

## 4. Xin ý kiến duyệt
Nếu sếp đồng ý với bản thiết kế này, tôi sẽ tiến hành code từng pha, bắt đầu từ **Pha 1 (NestJS)** trước nhé!
