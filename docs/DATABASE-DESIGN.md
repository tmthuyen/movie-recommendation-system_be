# Thiết kế cơ sở dữ liệu quan hệ — backend NestJS

> **Ngày xác minh: 2026-11-04.** Tài liệu này được viết lại từ **entity TypeORM thực tế** trong `backend/src/**/entities/*.entity.ts` và cấu hình `synchronize: true`. Không còn dùng bản thiết kế khái niệm cũ.

## 1. Cách DB được tạo

- PostgreSQL + TypeORM, cấu hình `synchronize: true`, **không dùng migration** (`backend/src/app.module.ts`) — bảng/cột được TypeORM tự đồng bộ từ entity khi khởi động.
- Mọi entity kế thừa `BaseAuditEntity` (`backend/src/common/audits/baseaudit.entity.ts:3-15`):
  - `created_at` (timestamp), `created_by` (nullable), `updated_at` (timestamp), `updated_by` (nullable).
- Tên cột trong DB dùng **snake_case**; property trong code dùng camelCase (ánh xạ qua `@Column({name: ...})`).

## 2. Nguồn dữ liệu

- Ban đầu lấy từ **MovieLens** + **TMDB** (metadata tiếng Việt).
- MovieLens: `movieId`, `ratings` (`userId`, `movieId`, `rating`, `timestamp`) — dùng để **seed** dữ liệu huấn luyện, không đưa rating gốc vào bảng `ratings` nghiệp vụ.
- TMDB: join với MovieLens qua `links.csv` (`tmdbId`) để lấy metadata; backend lưu `tmdb_id` trên `movies`.
- Dữ liệu seed rating nằm ở bảng riêng `seed_ratings` (không trộn với `ratings` của user thật).

## 3. Danh sách bảng thực tế

| Domain | Bảng | Mô tả | Cột / quan hệ chính |
|---|---|---|---|
| Người dùng & phân quyền | `users` | Tài khoản | `id` uuid PK, `status` enum `UNVERIFIED/ACTIVE/INACTIVE/BLOCKED` (mặc định `UNVERIFIED`), `email` unique, `is_verified`, `password`, `full_name`, `phone_number`, `avatar_url`, `preference_data` jsonb, `birth_date` date, `gender`; M2M `roles` qua `user_roles`; 1-n `ratings`, `comments`, `interactions` (`user.entity.ts:16-89`) |
| - | `user_providers` | Liên kết OAuth (Google) | `id` uuid PK, `user_id`, `provider`, `provider_id`; unique `(provider, provider_id)` (`user-provider.entity.ts:4-18`). Lưu ý: `user_id` là cột thường, **không khai báo FK quan hệ** trong entity. |
| - | `roles` | Vai trò RBAC | `id` number PK, `code` unique, `name`, `description`; M2M `users` (`role.entity.ts:12-30`) |
| - | `user_roles` | Join M2M User ↔ Role | `user_id`, `role_id` (`user.entity.ts:66-78`) |
| Phim | `movies` | Phim | `id` **bigint** PK; `tmdb_id` bigint unique nullable; `imdb_id` varchar(50) unique nullable; `title`, `title_vi`, `overview`, `overview_vi`, `release_date` **date** nullable (indexed), `poster_path`, `backdrop_path`, `homepage`, `origin_country`, `original_language`, `budget` bigint, `revenue` bigint, `status`, `video`, `is_ai_translated`, `tmdb_rating` float, `vote_average` float, `vote_count` bigint, `view_count` bigint (indexed), `like_count` bigint (indexed); M2M `genres` qua `movie_genres`; M2M `countries` qua `movie_countries`; 1-n `movie_peoples`, `ratings`, `comments`, `interactions` (`movie.entity.ts:42-186`) |
| - | `genres` | Thể loại | `id` number PK, `name` varchar(100), `en_name` varchar(100) nullable; M2M `movies` (`genre.entity.ts:5-17`) |
| - | `movie_genres` | Join M2M Movie ↔ Genre | `movie_id` bigint, `genre_id` number (tạo bởi `@JoinTable`, `movie.entity.ts:143-155`) |
| - | `countries` | Quốc gia | `id` number PK, `vi_name` varchar(50) (indexed), `en_name` varchar(50) unique nullable, `code` varchar(2) unique nullable (indexed), `region` varchar(50) nullable, `subregion` varchar(50) nullable; M2M `movies` (`country.entity.ts:11-51`) |
| - | `movie_countries` | Join M2M Movie ↔ Country | `movie_id` bigint, `country_id` number (`movie.entity.ts:161-173`) |
| - | `peoples` | Diễn viên / đạo diễn | `id` number PK, `full_name` varchar(100), `birth_date` date nullable, `nationality` varchar(50) nullable, `gender` varchar(20) nullable, `main_role` varchar(50) default `actor` nullable; 1-n `movie_peoples` (`people.entity.ts:5-32`) |
| - | `movie_peoples` | Join Movie ↔ People (có vai trò) | PK kép `movie_id` bigint + `people_id` bigint; `role` varchar(50) default `actor`; n-1 `movie`, n-1 `people` (`movie-people.entity.ts:6-33`) |
| Tương tác | `ratings` | Đánh giá của user | `id` number PK, `rating` float, `content` varchar(255) nullable, `timestamp` timestamp nullable; n-1 `user`, `movie`; **unique `(user, movie)`** (`rating.entity.ts:13-42`) |
| - | `seed_ratings` | Rating seed từ MovieLens (band 5) | `id` number PK, `score` float, `user_id` varchar (MovieLens userId), `movie_id` bigint; **unique `(movie_id, user_id)`** (`seed-rating.entity.ts:4-17`) |
| - | `comments` | Bình luận phân cấp | `id` number PK, `content` text, `parent_id` bigint nullable (null = root); n-1 `user`, `movie` (`comment.entity.ts:13-30`) |
| - | `interactions` | Tín hiệu tương tác | `id` number PK, `score` float default 0 (band 5 = độ tin cậy), `type` enum `like/rating/comment/click`; n-1 `user`, `movie`; index `(user, movie, type)` **không unique** (`interaction.entity.ts:13-48`) |
| Vận hành | `failed_events` | Message rớt DLQ | `id` uuid PK, `source` nullable, `queue_name`, `routing_key`, `event_id` unique nullable, `event_type` nullable, `correlation_id` nullable, `payload` json, `error_reason` text nullable, `status` enum `PENDING/RETRIED_SUCCESS/RETRIED_FAILED` (mặc định `PENDING`), `retry_count` int default 0 (`failed-event.entity.ts:4-43`) |

## 4. Bảng **không tồn tại** (khác bản thiết kế cũ)

Các bảng sau **không có** trong code/DB hiện tại — không dùng để viết query/tài liệu:

- `permissions` — module `permissions` chỉ là stub; `Permission` là **class rỗng** `export class Permission {}` (`backend/src/modules/permissions/entities/permission.entity.ts:1`), không phải entity TypeORM.
- `role_permissions` — không có quan hệ Role ↔ Permission.
- `favorites` / `watchlists` — “yêu thích” được biểu diễn bằng `interactions.type='like'`; “lịch sử xem” bằng `interactions.type='click'`.
- `seed_interactions` — thay bằng `seed_ratings`.
- `notifications` — chưa có bảng; trang `/notification` ở frontend là placeholder.
- `reviews` — đánh giá dùng `ratings` (có `content`), bình luận dùng `comments`.

## 5. Quan hệ tóm tắt

```
users 1─n ratings n─1 movies
users 1─n comments n─1 movies
users 1─n interactions n─1 movies
users n─n roles            (user_roles)
movies n─n genres          (movie_genres)
movies n─n countries       (movie_countries)
movies 1─n movie_peoples n─1 peoples
movies 1─n ratings/comments/interactions
seed_ratings: bảng độc lập (user_id varchar + movie_id bigint), dùng cho training ALS
failed_events: bảng độc lập, ghi message DLQ
```

## 6. Ghi chú nghiệp vụ / kỹ thuật

- **`InteractionScoreMap`** (band 5): `like=5`, `comment=4`, `click=1` (tăng dần tối đa 5 khi xem lại), `rating=0` (điểm động = số sao user nhập). Enum chỉ có `like/rating/comment/click`.
- **`ratings`** có unique `(user, movie)` — mỗi user chỉ 1 rating/phim; `interactions` **không unique** để cho phép nhiều comment/click/rating cùng phim.
- **`MovieResponseDto`** trả `countries: Country[]` (M2M), không phải `country` đơn (`backend/src/modules/movies/dto/movie-response.dto.ts:82-84`).
- **`CreateMovieDto`** vẫn nhận `countryId` đơn, nhưng service gán `entity.country` trong khi entity không còn quan hệ này (`movies.service.ts:49-57`) — hành vi lưu quốc gia khi tạo phim **cần xác minh runtime**.
- **`movie_peoples`** dùng `people_id` (không phải `person_id`); `peoples` là tên bảng (không phải `people`).
- **`user_providers.user_id`** chưa có FK constraint trong entity — cần cân nhắc khi thêm ràng buộc.
