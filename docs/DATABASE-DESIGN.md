# Thiết kế cơ sở dữ liệu quan hệ (relational database) cho backend NestJS

## 1. Nguồn data

- Ban đầu lấy từ tập movieLens và latest TMDB (TMDB).
- MovieLens: có movieId, ratings có userId, movieId, score, timestamp. Có thể dùng để seed dữ liệu ban đầu. Không dùng rating đưa vào bảng chính
- TMDB: Chưa có movieId, phải thêm Movies từ MovieLens vào trước để latest TMDB có thể tự tăng id nếu thêm sau đó.

## 2. Các bảng chính

| Domain                  | Tên bảng            | Mô tả                                                                                  | Các cột chính                                                                                                  |
| ----------------------- | ------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Người dùng & phân quyền | `users`             | Người dùng                                                                             | `id`, `email`, `fullName`, `password`, `phoneNumber`, `createdAt`, `updatedAt`,                                |
| -                       | `roles`             | Vai trò (RBAC)                                                                         | `id`, `code`, `name`, `createdAt`, `updatedAt`                                                                 |
| -                       | `permissions`       | Quyền (RBAC)                                                                           | `id`, `code`, `name`, `createdAt`, `updatedAt`                                                                 |
| -                       | `user_roles`        | Bảng join ManyToMany `User ↔ Role`                                                     | `userId`, `roleId`                                                                                             |
| -                       | `role_permissions`  | Bảng join ManyToMany `Role ↔ Permission`                                               | `roleId`, `permissionId`                                                                                       |
| Phim                    | `movies`            | Phim                                                                                   | `id`, `title`, `description`, `releaseDate`, `duration`, `createdAt`, `updatedAt`                              |
| -                       | `genres`            | Thể loại phim                                                                          | `id`, `name`, `createdAt`, `updatedAt`                                                                         |
| -                       | `movie_genres`      | Bảng join ManyToMany `Movie ↔ Genre`                                                   | `movieId`, `genreId`                                                                                           |
| -                       | `peoples`            | Diễn viên / đạo diễn / nhân vật liên quan                                              | `id`, `fullName`, `birthDate`, `nationality`, `gender`, `main_role`, `createdAt`, `updatedAt`                                                        |
| -                       | `movie_peoples`      | Bảng join ManyToMany `Movie ↔ Person` (có thêm cột `role` để phân biệt actor/director) | `movieId`, `personId`, `role`                                                                                  |
| -                       | `countries`         | Quốc gia                                                                               | `id`, `name`, `code`, `createdAt`, `updatedAt`                                                                 |
| -                       | `movie_countries`   | Bảng join ManyToMany `Movie ↔ Country`                                                 | `movieId`, `countryId`                                                                                         |
| Tương tác               | `ratings`           | Đánh giá phim                                                                          | `id`, `userId`, `movieId`, `score`, `content`, `createdAt`, `updatedAt`                                                   |
| -                       | `comments`           | Bình luận phim                                                                         | `id`, `userId`, `movieId`, `content`, `createdAt`, `updatedAt`                                                 |
| -                       | `favorites`         | Danh sách yêu thích phim của người dùng                                                | `id`, `userId`, `movieId`, `createdAt`, `updatedAt`                                                            |
| -                       | `interactions`      | Tương tác khác (like, rating, save, view, comment, etc.)                                        | `id`, `userId`, `movieId`, `type` (enum: 'like', 'share', etc.), `createdAt`, `updatedAt`                      |
| -                       | `seed_interactions` | Bảng seed dữ liệu tương tác (có sẵn từ movieLens)                                      | `id`, `userId`, `movieId`, `type`, `createdAt`, `updatedAt`                                                    |
| Thông báo               | `notifications`     | Thông báo cho người dùng                                                               | `id`, `userId`, `type`, `content`, `link`, `isRead`, `createdAt`, `updatedAt`                                  |

## 3. Việc cần làm:

- [] Thêm các cột cần thiết khác
- [] Tạo các entity TypeORM cho các bảng: movies, genres, countries, ratings, interactions, seed_interactions
- [x] Tạo các entity TypeORM cho các bảng: users, roles, permissions, user_roles, role_permissions
- [] Tạo các entity TypeORM cho các bảng: reviews, watchlists, favorites, notifications, people, movie_people, movie_genres, movie_countries
