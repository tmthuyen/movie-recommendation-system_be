# V5 Plan: Realtime Interactions & User Activity

## 1. Mục tiêu
- Xây dựng hoàn chỉnh tính năng Real-time bằng WebSockets cho các tương tác người dùng.
- Thêm cơ chế log hành vi tương tác và tính toán lượt xem (View Count) chuẩn ACID.
- Tạo các API phục vụ hiển thị dữ liệu lịch sử cho cá nhân người dùng.

## 2. Các Task Cụ Thể

### Task 1: Nâng cấp Movie Entity & Tính năng Lượt xem (View Count)
- Thêm trường `viewCount` (kiểu số nguyên, mặc định là 0) vào `Movie` entity.
- Tạo API "Cập nhật lượt xem" khi user xem chi tiết phim (GET) hoặc xem video.
- Sử dụng Database Transaction và WebSockets để vừa tăng `viewCount` trong DB, vừa emit sự kiện real-time `movie.viewCount.updated` cho các client đang xem trang đó.

### Task 2: Hoàn thiện Real-time Comments & Ratings
- **Comments (Bình luận):**
  - Hỗ trợ sự kiện **typing** (đang gõ phím).
  - Hoàn thiện luồng emit message sau khi đăng comment thành công.
  - Phân cấp (Hierarchy): Trả về số lượng comment cha và số lượng reply con.
  - Phân trang (Load more): Implement cơ chế Pagination (dùng query `page`, `limit`), không dùng infinite scroll cuộn liên tục.
- **Ratings (Đánh giá):**
  - Cập nhật Real-time và hiển thị tổng lượt đánh giá (count) cùng điểm trung bình (average rating) của bộ phim mỗi khi có user rating.

### Task 3: Tracking Hành vi (Logging) & ACID
- Ghi log rõ ràng cho các hành vi (View, Click, Like, Favorite, Comment, Rating) vào bảng `interactions`.
- Các hành động "Click", "Like", "Favorite" có thể chỉ cần xử lý REST API tĩnh (chưa cần Real-time) nhưng vẫn phải đảm bảo tính nhất quán (ACID).
- Đảm bảo khi tạo Rating hay Comment thì bản ghi tương ứng trong `interactions` phải được cập nhật đồng thời trong 1 Transaction.

### Task 4: API Danh sách Cá nhân (User History APIs)
- **Danh sách phim đã xem:** API lấy lịch sử truy cập (View history) của người dùng.
- **Danh sách phim yêu thích:** API danh sách các bộ phim user đã "Favorite" hoặc "Like".
- Truy xuất thông qua bảng `interactions` đã được lưu log, kết hợp (Join) với thông tin phim cơ bản.
