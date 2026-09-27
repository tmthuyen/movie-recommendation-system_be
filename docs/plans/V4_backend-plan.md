# Phase V4: Core Domain APIs & User Interactions

Mục tiêu của Phase này là xây dựng hoàn thiện hệ thống API phục vụ nội dung chính (Movies, Genres, Peoples, Countries), hệ thống lưu trữ tĩnh (Storage Service S3/R2) và nền tảng theo dõi tương tác người dùng (Interactions) để chuẩn bị dữ liệu cho AI Recommendation.

## 1. Dịch vụ lưu trữ (Storage Service)

- **Mục đích**: Cung cấp API upload hình ảnh (Avatar, Movie Poster) độc lập với ổ cứng server.
- **Task**:
  - Tạo Interface `IStorageService` chứa hàm `uploadFile(file, folder)`.
  - Triển khai `R2StorageService` hoặc `S3StorageService` tương thích AWS S3 SDK (sử dụng thư viện `@aws-sdk/client-s3`).
  - Viết module `FilesModule` và controller `POST /api/files/upload`.
  - Validate: Giới hạn kích thước file (ví dụ: < 5MB), chỉ cho phép định dạng ảnh (jpg, png, webp).

## 2. Các API CRUD Core Domain (Master Data)

Tuân thủ rule thiết kế Repository Design Pattern và Response Format.

- **Genres (`/api/genres`)**:
  - `GET /` - Lấy danh sách thể loại (có phân trang/tìm kiếm).
  - `POST /`, `PATCH /:id`, `DELETE /:id` - Dành cho ADMIN.
- **Countries (`/api/countries`)**:
  - Tương tự như Genres.
- **Peoples/Persons (`/api/peoples`)**:
  - CRUD thông tin đạo diễn, diễn viên (Tên, ngày sinh, quốc tịch, ảnh).
- **Movies (`/api/movies`)**:
  - `GET /` - Lấy danh sách phim hiển thị cho User. Hỗ trợ lọc (filter) nâng cao theo Thể loại, Năm, Quốc gia, Search text.
  - `GET /:id` - Lấy chi tiết phim (bao gồm quan hệ Genres, Peoples, Countries).
  - `POST /`, `PATCH /:id`, `DELETE /:id` - Dành cho ADMIN quản lý phim (Cập nhật thông tin, gán Thể loại, gán Diễn viên...).

## 3. Hệ thống Tương tác (User Interactions & Behavior)

Các hành vi của người dùng được tách thành từng domain nhỏ và đồng thời được log tập trung vào bảng `interactions` thông qua Event/Message Queue.

- **Comments (`/api/comments`)**:
  - `GET /movies/:movieId` - Lấy danh sách comment của phim (phân trang).
  - `POST /` - Thêm comment mới.
  - `PATCH /:id`, `DELETE /:id` - Sửa/xóa (chỉ chủ sở hữu hoặc Admin).
- **Ratings (`/api/ratings`)**:
  - `POST /` - Gửi đánh giá sao (1-10) cho phim. (Lưu ý upsert: nếu đã rate thì cập nhật).
  - *Sự kiện bất đồng bộ*: Khi có rating mới, tính toán lại `voteAverage` và `voteCount` của Movie tương ứng.
- **Favorites (`/api/favorites`)**:
  - `GET /` - Lấy danh sách phim yêu thích của người dùng hiện tại (My Favorites).
  - `POST /` - Thêm/Xóa phim khỏi danh sách yêu thích (Toggle).
- **Interaction Logging (Hệ thống ngầm)**:
  - Khi user thao tác: View phim, Rate, Comment, Favorite... hệ thống sẽ phát sinh một Event.
  - Sử dụng **RabbitMQ** để đẩy Message vào Queue nhằm xử lý bất đồng bộ, tránh block main thread.
  - `InteractionListener` (Consumer) sẽ xử lý ghi lịch sử vào bảng `interactions`. Điều này rất quan trọng để hệ thống AI học được sở thích thực sự của user.
- **Xử lý Message Queue Lỗi (DLQ & Retry)**:
  - Áp dụng pattern **Dead Letter Queue (DLQ)** trong RabbitMQ.
  - Nếu việc consume message (lưu log, tính toán lại rating, gửi email...) bị thất bại, hệ thống sẽ auto retry (ví dụ 3 lần).
  - Nếu vẫn thất bại, event sẽ được đẩy vào DLQ và Consumer DLQ sẽ lưu payload, type và lý do lỗi vào bảng `failed_events`.
  - Có API dành cho Admin/Dev (`GET /api/failed-events` và `POST /api/failed-events/:id/retry`) để dễ dàng giám sát, đọc lý do lỗi và thủ công retry lại các message bị rớt.

## 4. Khởi tạo Hồ sơ User (Onboarding / Profile)

- **Mục đích**: Lấy dữ liệu sở thích (Cold Start) ngay khi user mới đăng ký để gợi ý phim tốt hơn.
- **Task**:
  - API `POST /api/users/onboarding`: Cho phép user chọn một số Thể loại yêu thích (Favorite Genres) hoặc Phim yêu thích ban đầu.
  - API này sẽ tạo ra các record trong `interactions` hoặc lưu preference vào profile để làm mốc gợi ý.

## Thứ tự thực hiện đề xuất:
1. `FilesModule` (Storage).
2. Xây dựng nền tảng **RabbitMQ & Failed Event Management (DLQ, Retry API)**.
3. Khung CRUD cơ bản `Genres`, `Countries`, `Peoples`.
4. Khung CRUD phức tạp `Movies` (Có join nhiều bảng).
5. Module `Interactions`, `Comments`, `Ratings` (Tích hợp publish message lên RabbitMQ).
6. Module `Onboarding / Profile`.
