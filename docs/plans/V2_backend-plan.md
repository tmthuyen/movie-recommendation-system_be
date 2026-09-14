# Kế hoạch Thiết kế và Phát triển Backend V2 (Netflix-like Architecture)

Tài liệu này thay thế cho bản kế hoạch backend đơn giản trước đó. Backend hiện tại được định hướng thiết kế theo chuẩn hệ sinh thái xem phim trực tuyến lớn (tương tự Netflix) với các tính năng như quản lý gói cước (Subscription), phim đa cấp (Movie -> Season -> Episode), phân quyền nâng cao, hệ thống Tracking A/B testing cho AI, và đặc biệt là **khả năng phân biệt dữ liệu mồi (Data Seeding) với dữ liệu hệ thống tự tạo**.

## 1. Kiến trúc Hệ thống (System Architecture)

### 1.1 Hạ tầng & Công nghệ
- **API Server:** NestJS (Node.js) - Modular Monolith, có thể tách Microservices nếu cần trong tương lai.
- **Database (Relational):** PostgreSQL. Áp dụng Master-Slave replication để giảm tải Read.
- **Database (NoSQL/Cache):** Redis (Quản lý phiên đăng nhập, Rate Limiting, Caching catalog phim).
- **Message Broker:** RabbitMQ hoặc Kafka (Xử lý bất đồng bộ: Event streaming cho AI, Notification, Email).
- **Object Storage & CDN:** AWS S3 / MinIO + Cloudflare CDN để lưu trữ và phân phối phim tự tải lên (MANUAL source).
- **Observability:** OpenTelemetry (đã tích hợp), ELK Stack (Logs), Jaeger (Tracing).

### 1.2 Chiến lược xử lý Data Seeding & Tích hợp AI
Do dữ liệu mồi lấy từ public datasets (TMDB, MovieLens):
- Hệ thống cần import hàng chục ngàn "Virtual Users" từ `ratings.csv` để mô phỏng tương tác.
- Phim từ TMDB chỉ có link `trailer_url`, không có video full. Hệ thống phải đánh dấu nguồn phim (`source = 'TMDB'`) để UI xử lý tương ứng (chỉ cho xem trailer).
- Các tương tác mồi (`is_seeded = true`) sẽ được AI học ban đầu. Tương tác thật của user sau này sẽ tiếp tục được feed sang AI theo luồng thời gian thực.

---

## 2. Thiết kế Cơ sở dữ liệu (Database Schema)

Cấu trúc DB chia thành các phân hệ độc lập. Lưu ý các cờ (flags) để phân biệt dữ liệu mồi.

### 2.1 Phân hệ IAM & Subscription (Identity & Access)
- **users**
  - `id, email, password, full_name, avatar, created_at, updated_at`
  - `source` (ENUM: `'SYSTEM'`, `'MOVIELENS'`)
  - `is_virtual` (BOOLEAN): Đánh dấu user ảo sinh từ data MovieLens. (User ảo có thể đăng nhập bằng mật khẩu mặc định nếu được config).
- **sessions**: Quản lý phiên đăng nhập (`device_info`, `ip_address`, `refresh_token`, `is_active`). Hỗ trợ đá session khác nếu vượt quá giới hạn thiết bị.
- **roles**, **permissions**, **user_roles**, **role_permissions**: Phân quyền RBAC.
- **plans**: Gói xem phim (`name`, `price`, `max_devices`, `resolution`).
- **user_subscriptions**: Mua gói (`user_id`, `plan_id`, `start_date`, `end_date`, `status`).

### 2.2 Phân hệ Catalog (Nội dung phim)
- **movies**
  - `id, tmdb_id (unique, nullable), title, original_title, slug, overview`
  - `type` (ENUM: `'SINGLE'`, `'SERIES'`)
  - `source` (ENUM: `'TMDB'`, `'MANUAL'`)
  - `has_full_video` (BOOLEAN): TMDB = false, MANUAL = true.
  - `release_date, poster_path, backdrop_path, trailer_url`
  - `age_rating, view_count, is_premium, status`
- **series_seasons**: Dành cho phim bộ (`movie_id`, `season_number`, `title`).
- **episodes**: Tập phim chi tiết (`season_id`, `movie_id`, `episode_number`, `video_url` - HLS CDN).
- **genres**, **movie_genres**: Thể loại.
- **tags**, **movie_tags**: Từ khóa.
- **countries**, **movie_countries**: Quốc gia sản xuất.
- **persons**: Diễn viên, đạo diễn.
- **movie_cast**: Phân vai (`movie_id`, `person_id`, `role: ACTOR/DIRECTOR`, `character_name`).

### 2.3 Phân hệ Social & Tương tác (Tích hợp AI)
- **interactions**
  - `id, user_id, movie_id`
  - `action` (ENUM: `'CLICK'`, `'VIEW'`, `'LIKE'`, `'FAVORITE'`)
  - `model_version` (VARCHAR): Dấu vết model AI nào đã gợi ý ra bộ phim dẫn đến tương tác này (A/B testing).
  - `is_seeded` (BOOLEAN): Bằng `true` nếu được sinh từ data mồi.
  - `context` (JSONB): Metadata phụ.
- **ratings**
  - `user_id, movie_id, score, is_seeded (BOOLEAN)`
- **watch_history**
  - `user_id, movie_id, episode_id, progress_seconds, is_completed, last_watched_at` (Lưu lịch sử "Tiếp tục xem").
- **comments**
  - Tương tác bình luận (`parent_id` cho trả lời lồng nhau).
- **notifications**
  - Quản lý thông báo (tập phim mới, thanh toán).

---

## 3. Các Luồng Hoạt động Cốt lõi (Workflows)

### Luồng 1: Data Seeding (Khởi tạo Dữ liệu Mồi)
- Script (CLI/API) đọc dữ liệu từ `ratings.csv` (MovieLens).
- Tạo các bản ghi vào `users` với `source = 'MOVIELENS'`, `is_virtual = true`.
- Import phim từ TMDB vào bảng `movies` với `source = 'TMDB'`, `has_full_video = false`. Lưu `trailer_url`.
- Generate dữ liệu vào `ratings` và `interactions` với `is_seeded = true`.

### Luồng 2: Quản lý Phiên & Phân quyền
- User login -> Backend tạo record trong `sessions`. Lưu Refresh Token dạng HttpOnly Cookie, Access Token trả về bộ nhớ Frontend.
- Middleware kiểm tra gói `user_subscriptions` của user đó cho phép tối đa bao nhiêu `sessions` đang active. Nếu vượt giới hạn, từ chối hoặc bắt buộc đăng xuất thiết bị cũ.

### Luồng 3: Xem Phim & Tracking Streaming
- User click phim:
  - Kiểm tra `has_full_video`. Nếu `false` (phim mồi), frontend hiển thị UI "Phim này hiện chỉ có Trailer".
  - Nếu `true` (phim hệ thống), backend trả về URL stream (HLS/DASH) sau khi kiểm tra gói cước (`is_premium`).
- Frontend liên tục gửi ping heartbeat 30s một lần lên `POST /api/watch-history` để cập nhật thời gian đã xem.
- Khi hoàn thành (hoặc đủ tỉ lệ xem nhất định), backend publish event `interaction.tracked` (action=VIEW) sang RabbitMQ.

### Luồng 4: A/B Testing Gợi Ý (Recommendation Integration)
- Frontend gọi `GET /api/me/home` hoặc `/api/movies/recommendations`.
- Backend gọi gRPC/HTTP nội bộ tới AI Service để lấy danh sách gợi ý.
- AI Service trả về `[movie_ids]` và chuỗi `model_version` (VD: `svd_v1` hoặc `phobert_v2`).
- Backend query CSDL chi tiết phim, đính kèm `model_version` trả về Frontend.
- Khi user click vào phim từ danh sách này, Frontend gọi API lưu tương tác kèm lại `model_version` đó, giúp đánh giá hiệu quả thuật toán.

### Luồng 5: Realtime Notifications
- Admin tạo `episode` mới cho phim bộ đang hot.
- Backend publish event `episode.released` lên Message Broker.
- Notification Consumer nhận event, ghi vào DB `notifications`.
- Push realtime qua WebSockets hoặc Server-Sent Events (SSE) cho user online; push Notification qua Firebase (Mobile app).

---

## 4. Lộ trình Triển khai (Roadmap)

Giai đoạn phát triển Backend được chia thành các phase cụ thể:

- **Phase 1: Core Architecture & Setup (1.5 tuần)**
  - Cấu trúc module NestJS. DB PostgreSQL, Redis, ELK/Otel.
  - Auth JWT, Session Management nâng cao.
- **Phase 2: Data Seeding Pipeline (1 tuần)**
  - Viết CLI jobs hoặc API để import data mồi (TMDB, MovieLens).
  - Khởi tạo users ảo và kho phim mồi.
- **Phase 3: Content Catalog (CRUD) (1.5 tuần)**
  - Movies, Seasons, Episodes, Cast, Crew.
  - Logic phân quyền phim Premium / Basic, Trailer / Full Video.
- **Phase 4: Social & Video Tracking (1 tuần)**
  - Watch History ping hệ thống, Ratings, Comments.
- **Phase 5: Event-Driven & AI Integration (1 tuần)**
  - Setup RabbitMQ, event emitters. Giao tiếp HTTP với AI Service. Đính kèm metadata tracking A/B test.
- **Phase 6: Subscription, Payment & Realtime (1.5 tuần)**
  - Tích hợp cổng thanh toán mô phỏng.
  - WebSockets cho Notifications.
