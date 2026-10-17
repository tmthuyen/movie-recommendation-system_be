# BACKEND — NestJS API Service (Hiện trạng)

> Tài liệu mô tả service `backend/` trong dự án **Ứng dụng mô hình ngôn ngữ vào hệ thống gợi ý phim**.
> Viết lại từ code thật trong `backend/src/` (đọc controller/service/DTO/entity trực tiếp). Nếu code thay đổi, cập nhật tài liệu này.

## About

`backend/` là **API server chính của hệ thống**, xây bằng **NestJS 11** (Express platform), đóng vai trò:

- REST API cho toàn bộ nghiệp vụ: auth, users/RBAC, movies, genres/countries/peoples, ratings, comments, interactions, files, failed-events, health.
- Xác thực bằng **JWT (Bearer)** + **refresh token trong cookie (httpOnly)** + session lưu trên **Redis**; OAuth **Google**.
- Real-time qua **Socket.IO** (comment/rating/viewCount/typing theo phim).
- Đồng bộ dữ liệu với `ai-service/` **hoàn toàn qua RabbitMQ** (không HTTP-call giữa backend ↔ ai-service).
- **Không có endpoint recommendation trong backend** — recommendation do `ai-service/` cung cấp (`/api/recommendations`).

| Thông số | Giá trị |
|---|---|
| Port | `8081` (HTTP API + Socket.IO cùng cổng) |
| Global prefix | `api` → mọi route REST là `/api/...` |
| Swagger UI | `http://localhost:8081/api` (Bearer Auth đã cấu hình) |
| Health | `GET /api/health` (Terminus) |
| DB | PostgreSQL + TypeORM, `synchronize: true` (**không dùng migration**) |
| Môi trường | biến bắt buộc validate trong `src/config/env.validation.ts` (APP_PORT, DB_*, ACCESS_SECRET_KEY, MAIL_*, S3_*…) |

## Techstacks

Bảng library thật lấy từ `backend/package.json`:

| Thành phần | Library |
|---|---|
| Framework | `@nestjs/common` / `@nestjs/core` / `@nestjs/platform-express` (NestJS 11) |
| Database | `@nestjs/typeorm` + `typeorm` + `pg` (PostgreSQL) |
| Auth | `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `passport-google-oauth20`, `bcrypt` |
| Validation | `class-validator`, `class-transformer`, `@nestjs/mapped-types` |
| API docs | `@nestjs/swagger` + `swagger-ui-express` |
| Redis | `ioredis` (session, blacklist token, rate-limit) |
| Message queue | `amqplib` + `amqp-connection-manager` (producer/consumer RabbitMQ) |
| WebSocket | `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io` |
| Cron | `@nestjs/schedule` (batch training interactions) |
| Health | `@nestjs/terminus` + `@nestjs/axios` |
| Tracing | `@opentelemetry/sdk-node`, `@opentelemetry/exporter-trace-otlp-http`, `@opentelemetry/auto-instrumentations-node` |
| Logging | `winston`, `nest-winston`, `winston-daily-rotate-file` |
| Per-request context | `nestjs-cls` |
| Config | `@nestjs/config` (`dotenv`, validate bằng class-validator) |
| Storage | `@aws-sdk/client-s3` (S3 / Cloudflare R2) |
| Mail | `nodemailer` |
| HTTP client | `axios` |
| Cookie | `cookie-parser` |
| Khác | `rxjs`, `lodash`, `uuid`, `module-alias` |
| Test / tooling | Jest + Supertest (`*.spec.ts`), ESLint, Prettier, ts-jest |

Scripts chính: `npm run dev` (watch), `npm run build`, `npm run start:prod`, `npm run lint`, `npm test`.

## Kiến trúc & Cấu trúc thư mục

```
backend/src/
├── main.ts                        # bootstrap: cookie-parser, global prefix 'api', ValidationPipe,
│                                  # CamelCaseInterceptor, LoggingInterceptor, HttpExceptionFilter,
│                                  # CORS (FRONTEND_ORIGINS), Swagger tại /api, listen APP_PORT
├── app.module.ts                  # Config(validate), TypeORM(synchronize:true, autoLoadEntities),
│                                  # ClsModule, WinstonModule, ScheduleModule + infra + domain modules
├── app.controller.ts              # GET /api -> plain text "Hello World!" (không envelope)
├── config/
│   ├── env.validation.ts          # schema bắt buộc của biến môi trường
│   ├── logger.config.ts           # Winston (console dev / JSON + rotate file prod)
│   └── tracing.config.ts          # OpenTelemetry (import trước khi bootstrap)
├── common/
│   ├── audits/                    # BaseAuditEntity (createdAt/createdBy/updatedAt/updatedBy) + subscriber
│   ├── custom-exception/          # AppException (statusCode, errorCode, detailMessage)
│   ├── decorators/                # @Public(), @Roles(), @CurrentUser()
│   ├── dtos/                      # ApiResponse, ApiResponseWithPagination, PaginatedResult, PaginationDto
│   ├── filters/http-exception.filter.ts   # envelope lỗi thống nhất
│   ├── guards/                    # roles.guard.ts (common — KHÔNG được đăng ký global)
│   ├── interceptors/              # camel-case, logging, correlation-id
│   ├── middlewares/               # logger.middleware
│   ├── rate-limit/                # RateLimitGuard (APP_GUARD global), @RateLimit, service (Redis)
│   ├── interfaces/                # JwtPayload (sub, fullName, email, scopes, sessionId, jti)
│   └── utlils/                    # date / hash / token-generator
├── infrastructure/
│   ├── redis/                     # RedisService (ioredis): session, blacklist, verify/reset token, rl:
│   ├── mail/                      # MailService + NodemailerProvider
│   ├── storage/                   # IStorageService: upload file lên S3/R2
│   └── messaging/                 # EventPublisherService, producers (movie/user/interaction),
│                                  # consumers DLQ (recommendation-dlq, interaction-dlq),
│                                  # event.types.ts (EventEnvelope), messaging.constants.ts
├── modules/
│   ├── auth/          # controller, service, session.service (Redis), JWT/Google/Optional guards, strategies
│   ├── users/         # controller, service, repository, user.mapper, entities (User, UserProvider)
│   ├── roles/          # CRUD roles (module duy nhất gắn RolesGuard)
│   ├── permissions/    # STUB placeholder (chưa triển khai thật)
│   ├── movies/         # CRUD + view count + RabbitMQ movie.*; entities Movie, MoviePeople
│   ├── genres/ countries/ peoples/     # CRUD đồng nhất
│   ├── ratings/        # CRUD rating + transaction cập nhật voteAverage/voteCount + WS; entities Rating, SeedRating
│   ├── comments/       # CRUD comment phân cấp (parentId) + WS; entity Comment
│   ├── interactions/   # TOGGLE tương tác + publish interaction.event; entity Interaction; interaction.cron.ts
│   ├── files/          # upload file chung (S3/R2)
│   ├── failed-events/  # danh sách message rớt DLQ + retry thủ công
│   ├── events/         # EventsGateway (Socket.IO)
│   └── health/         # Terminus health check
└── seed/               # import-data.seed.ts, ratings.csv, SEED_DATA_GUILDE.md
```

Mẫu thiết kế: **Controller tự trả envelope** → Service (business) → Repository (interface `I*Repository` + token Symbol, DI bằng `@Inject`).

## Quy ước Response

**Envelope do TỪNG controller tự trả** — KHÔNG có response interceptor đóng gói. Interface ở `src/common/dtos/api-response.dto.ts` (`ApiResponse<T>`, `ApiResponseWithPagination<T>`, `PaginatedResult<T>`); service trả `PaginatedResult{data,total,page,limit,totalPages}`.

Thành công — bản ghi đơn (ví dụ `GET /api/auth/me`):

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Lấy thông tin thành công",
  "result": { "id": "...", "email": "...", "roles": ["user"] }
}
```

Thành công — danh sách có phân trang (ví dụ `GET /api/movies?page=1&limit=10`):

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Get movies successfully",
  "result": [ { "id": 1, "title": "The Matrix" } ],
  "pagination": { "total": 100, "page": 1, "limit": 10, "totalPages": 10 }
}
```

Lỗi — từ `src/common/filters/http-exception.filter.ts` (bắt `HttpException` và `AppException`):

```json
{
  "success": false,
  "statusCode": 401,
  "message": "Chưa đăng nhập hoặc token không hợp lệ",
  "errorCode": "Unauthorized",
  "timestamp": "2026-10-17T08:00:00.000Z",
  "path": "/api/auth/me"
}
```

- `errorCode` chỉ xuất hiện khi có (AppException.errorCode, hoặc `error` trong response của HttpException). Mảng `message` của ValidationPipe được join bằng `, `.
- Tạo mới thành công dùng `statusCode: 201`; `POST /api/auth/login`, `/refresh`, `/logout`, `/view` dùng `200` (có `@HttpCode`).
- **Ngoại lệ (KHÔNG theo envelope)**:
  - `GET /api/health` → format Terminus của `@nestjs/terminus`.
  - `POST /api/failed-events/:id/retry` → `{success, statusCode, message}` — **không có `result`**.
  - `GET /api` (AppController) → plain text.
  - Swagger UI `/api`.

### Validation & transform

- `ValidationPipe`: `whitelist: true`, `forbidNonWhitelisted: true`, `forbidUnknownValues: true`, `transform: true` → field lạ trong body/query bị **400 Bad Request**.
- `CamelCaseInterceptor` (global): chuyển **key của request body/query** sang camelCase (client gửi `preference_data` vẫn nhận `preferenceData`). Response KHÔNG bị đổi key.

## Các API hiện có

Ký hiệu cột **Auth**:
- `Public` = không cần token (`@Public()` hoặc không gắn guard).
- `JWT` = cần `Authorization: Bearer <accessToken>`.
- `Optional JWT` = có thể không có token.
- `@Roles(...)` = có decorator role; **⚠ xem ghi chú RolesGuard bên dưới**.

> ⚠ **RolesGuard CHỈ được gắn ở `RolesController`** (`@UseGuards(JwtAuthGuard, RolesGuard)`). Các controller khác có ghi `@Roles(...)` (users, movies, genres, countries, peoples, ratings, comments, files, failed-events) **chỉ có JwtAuthGuard (hoặc không guard) → decorator @Roles KHÔNG được enforce**. Module `permissions`, `failed-events`, `health`, `app` thậm chí **không có JwtAuthGuard**. Xem mục `## Lưu ý cho Frontend/Client` trước khi giả định phân quyền.

### Module `auth` — `/api/auth` (class-level `JwtAuthGuard`, route public đánh dấu `@Public()`)

| Method | Path | Auth | Rate limit | Request | Response `result` | Ghi chú |
|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | Public | 5/phút (sliding-window/IP) | `LoginRequestDto` `{username, password}` — **`username` là email** | `{accessToken, refreshToken}` | set cookie `refreshToken` (httpOnly, 30 ngày) + `deviceId` (365 ngày), `sameSite: strict`; chặn user `BLOCKED`/`INACTIVE` |
| POST | `/api/auth/register` | Public | 5/phút (sliding-window/IP) | `RegisterDto` `{email, fullName, phoneNumber?, password, confirmPassword}` | `{}` | gán role mặc định `user`, gửi email xác thực (token Redis 24h); `201` |
| POST | `/api/auth/refresh` | Public | 10/phút (token-bucket/IP) | cookie `refreshToken` + `deviceId` (không body) | `{accessToken, refreshToken}` | revoke session cũ, giữ nguyên `sessionId`, jti mới |
| GET | `/api/auth/sessions` | JWT | global | — | `SessionData[]` — `{userId, refreshToken, deviceId, ip, userAgent, createdAt, expiresAt, lastActivityAt, sessionId, jti, isCurrentSession}` | đánh dấu phiên hiện tại |
| POST | `/api/auth/logout` | JWT | global | — | `{}` | xóa session theo `sessionId` trong token, clear cookie |
| POST | `/api/auth/logout-all` | JWT | global | — | `{}` | xóa mọi session của user, clear cookie |
| POST | `/api/auth/logout-session/:sessionId` | JWT | global | path `sessionId` | `{}` | đăng xuất 1 phiên |
| POST | `/api/auth/forgot-password` | Public | 3/phút | `{email}` | `{}` | token reset Redis 15 phút, gửi qua email |
| POST | `/api/auth/reset-password` | Public | 3/phút | `ResetPasswordDto` `{token, password, confirmPassword}` | `{}` | xóa toàn bộ session của user |
| POST | `/api/auth/send-verification-email` | JWT | global | — | `{}` | token verify Redis 24h; nếu `ASYNC_MAIL_ENABLED=true` → publish `user.email_verification.requested` |
| POST | `/api/auth/verify-email` | Public | global | `{token}` | `{}` | set `status=ACTIVE`, `isVerified=true`, publish `user.email_verified` |
| GET | `/api/auth/me` | JWT | global | — | user không có `password`, kèm `roles` | |
| PATCH | `/api/auth/change-password` | JWT | global | `ChangePasswordDto` `{oldPassword, newPassword, confirmPassword}` | `{}` | xóa cookie + logout toàn bộ phiên |
| GET | `/api/auth/google` | Public | global | — | redirect sang Google (GoogleAuthGuard) | |
| GET | `/api/auth/google/callback` | Public | global | — | redirect `${FRONTEND_URL}/auth/google-success` | set cookie `refreshToken`; tạo user mới với role `user`, `status=ACTIVE`, `isVerified=true` |

JWT payload: `{sub, fullName, email, scopes, sessionId, jti}`. `JwtStrategy` kiểm tra **blacklist `auth:blacklist:{jti}`** và **session `auth:session:{sessionId}`** trong Redis trước khi cho qua.

### Module `users` — `/api/users` (class-level `JwtAuthGuard`)

| Method | Path | Auth | Request | Response `result` | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/users/me` | JWT | — | user (không `password`) | |
| PUT | `/api/users/me` | JWT | `UpdateProfileDto` `{fullName?, avatarUrl?, phoneNumber?, birthDate?, gender?, preferenceData?}` | user | `preferenceData` là `jsonb` (sở thích: thể loại, đạo diễn...) |
| POST | `/api/users` | JWT + `@Roles(ADMIN, SUPERADMIN)` **⚠ không enforce** | `CreateUserDto` `{email, fullName, avatarUrl?, phoneNumber?, password, confirmPassword, roleIds[]}` | user | `201`; publish `user.created` |
| GET | `/api/users` | JWT + `@Roles` **⚠** | query `PaginationDto` `{page=1, limit=10, keyword}` (keyword ILIKE `fullName`/`email`) | user[] + `pagination` | |
| GET | `/api/users/:id` | JWT + `@Roles` **⚠** | path `id` (uuid) | user | |
| PUT | `/api/users/:id` | JWT + `@Roles` **⚠** | `UpdateProfileDto` | user | publish `user.updated` |
| DELETE | `/api/users/:id` | JWT + `@Roles` **⚠** | path `id` | user | publish `user.deleted` |
| PATCH | `/api/users/:id/roles` | JWT + `@Roles` **⚠** | body `{roleIds: number[]}` | user | |
| POST | `/api/users/avatar` | JWT + `@Roles(ADMIN, SUPERADMIN, USER)` **⚠** | `multipart/form-data`, field `file`, ≤5MB, `jpg/jpeg/png/webp` | `{url}` | `201`; upload lên S3/R2 thư mục `uploads/avatars` |

`UserMapper.toResponse` chỉ loại bỏ `password` (các field khác trả nguyên).

### Module `roles` — `/api/roles` (`JwtAuthGuard` + **`RolesGuard`** — module duy nhất có RolesGuard)

| Method | Path | Auth | Request | Response `result` | Ghi chú |
|---|---|---|---|---|---|
| POST | `/api/roles` | JWT (không `@Roles`) | `CreateRoleDto` `{code, name, description?}` | role | `201` |
| GET | `/api/roles` | JWT + `@Roles(ADMIN, MANAGER)` | — | role[] | |
| GET | `/api/roles/:id` | JWT | — | role | |
| PATCH | `/api/roles/:id` | JWT | `UpdateRoleDto` (Partial của Create) | role | |
| DELETE | `/api/roles/:id` | JWT | — | role | |

### Module `permissions` — `/api/permissions` — **STUB placeholder**

| Method | Path | Auth | Response `result` |
|---|---|---|---|
| POST/GET/GET :id/PATCH/DELETE | `/api/permissions[...]` | **Public (không guard)** | chuỗi string kiểu `"This action returns all permissions"` |

⚠ Chưa triển khai thật (service chỉ trả string). Không dùng cho tích hợp.

### Module `movies` — `/api/movies`

| Method | Path | Auth | Request | Response `result` | Ghi chú |
|---|---|---|---|---|---|
| POST | `/api/movies` | JWT + `@Roles(ADMIN, SUPERADMIN)` **⚠ không enforce** | `CreateMovieDto` (xem dưới) | movie | `201`; validate genreIds/countryId/peopleIds tồn tại; publish `movie.created` |
| POST | `/api/movies/test-created` | **Public** (guard bị comment) | `CreateMovieDto` | `result: undefined` (bị lược khỏi JSON) | test publish event (movieId cứng 101000) |
| GET | `/api/movies` | Public | query `{page, limit, keyword}` — keyword ILIKE `title` OR `titleVi` | movie[] + `pagination` | join `genres`, `country`, `moviePeoples.people`; sort `createdAt DESC` |
| GET | `/api/movies/:id` | Public | path `id` (number) | movie (kèm relations) | `404` nếu không thấy |
| POST | `/api/movies/:id/view` | **Optional JWT** | path `id` | `{viewCount}` | transaction: +`viewCount`; nếu đã đăng nhập ghi Interaction `click` (anti-spam: tối đa 1 lần/user/movie); WS `movie-{id}-viewCount` |
| PATCH | `/api/movies/:id` | JWT + `@Roles` **⚠** | `UpdateMovieDto` = Partial(`CreateMovieDto`) | movie | publish `movie.updated` nếu đổi title/titleVi/overview/overviewVi/genreIds/peopleIds |
| DELETE | `/api/movies/:id` | JWT + `@Roles` **⚠** | path `id` | `{success: true}` | publish `movie.deleted` |

`CreateMovieDto` fields: `title` (bắt buộc, ≤255), `titleVi?`, `overview?`, `overviewVi?`, `releaseDate?` (string ≤20), `posterPath?`, `backdropPath?`, `originCountry?`, `originalLanguage?`, `budget?`, `revenue?`, `status?`, `video?` (boolean), `voteAverage?`, `voteCount?`, `genreIds?` (number[]), `countryId?` (number), `peopleIds?` (number[]).

### Module `genres` — `/api/genres`

| Method | Path | Auth | Request | Response `result` |
|---|---|---|---|---|
| POST | `/api/genres` | JWT + `@Roles(ADMIN, SUPERADMIN)` **⚠** | `CreateGenreDto` `{name, enName?}` | genre (`201`) |
| GET | `/api/genres` | Public | `{page, limit, keyword}` (keyword ILIKE `name`) | genre[] + `pagination` |
| GET | `/api/genres/:id` | Public | — | genre |
| PATCH | `/api/genres/:id` | JWT + `@Roles` **⚠** | Partial | genre |
| DELETE | `/api/genres/:id` | JWT + `@Roles` **⚠** | — | genre |

### Module `countries` — `/api/countries` (cấu trúc y hệt genres)

| Method | Path | Auth | Request | Response `result` |
|---|---|---|---|---|
| POST | `/api/countries` | JWT + `@Roles` **⚠** | `CreateCountryDto` `{name, code}` | country (`201`) |
| GET | `/api/countries` | Public | `{page, limit, keyword}` | country[] + `pagination` |
| GET | `/api/countries/:id` | Public | — | country |
| PATCH | `/api/countries/:id` | JWT + `@Roles` **⚠** | Partial | country |
| DELETE | `/api/countries/:id` | JWT + `@Roles` **⚠** | — | country |

### Module `peoples` — `/api/peoples` (diễn viên/đạo diễn, cấu trúc y hệt genres)

| Method | Path | Auth | Request | Response `result` |
|---|---|---|---|---|
| POST | `/api/peoples` | JWT + `@Roles` **⚠** | `CreatePeopleDto` `{fullName, birthDate?, nationality?, gender?, mainRole?}` | people (`201`) |
| GET | `/api/peoples` | Public | `{page, limit, keyword}` | people[] + `pagination` |
| GET | `/api/peoples/:id` | Public | — | people |
| PATCH | `/api/peoples/:id` | JWT + `@Roles` **⚠** | Partial | people |
| DELETE | `/api/peoples/:id` | JWT + `@Roles` **⚠** | — | people |

### Module `ratings` — `/api/ratings`

| Method | Path | Auth | Request | Response `result` | Ghi chú |
|---|---|---|---|---|---|
| POST | `/api/ratings` | JWT | `CreateRatingDto` `{rating: 0–5, movieId}` | rating đã lưu | `201`; **transaction**: tạo Rating + Interaction (`type=rating`, `score=rating`) + cập nhật lại `voteAverage`/`voteCount` của movie; WS `movie-{id}-rating` (payload kèm `movieStats`) |
| GET | `/api/ratings` | Public | `{page, limit}` | rating[] + `pagination` | join `user`, `movie` |
| GET | `/api/ratings/movie/:movieId` | Public | `{page, limit}` | rating[] + `pagination` | join `user` |
| GET | `/api/ratings/:id` | Public | — | rating (user + movie) | |
| PATCH | `/api/ratings/:id` | JWT | `UpdateRatingDto` (Partial) | rating | ⚠ không kiểm tra rating thuộc về user |
| DELETE | `/api/ratings/:id` | JWT + `@Roles(ADMIN, SUPERADMIN)` **⚠** | — | rating | ⚠ không kiểm tra chủ sở hữu |

Rating unique theo (user, movie).

### Module `comments` — `/api/comments`

| Method | Path | Auth | Request | Response `result` | Ghi chú |
|---|---|---|---|---|---|
| POST | `/api/comments` | JWT | `CreateCommentDto` `{content, movieId, parentId?}` | comment đã lưu | `201`; **transaction**: Comment + Interaction (`comment`, score 5); WS `movie-{id}-comment` |
| GET | `/api/comments` | Public | `{page, limit}` | comment[] + `pagination` | join `user`, `movie`; sort `createdAt DESC` |
| GET | `/api/comments/movie/:movieId` | Public | `{page, limit}` + query `parentId?` | comment[] + `pagination` | không truyền `parentId` → lấy root (`parentId IS NULL`); mỗi item có thêm **`replyCount`** (số reply trực tiếp) |
| GET | `/api/comments/:id` | Public | — | comment (user + movie) | |
| PATCH | `/api/comments/:id` | JWT | `UpdateCommentDto` (Partial) | comment | ⚠ không kiểm tra chủ sở hữu |
| DELETE | `/api/comments/:id` | JWT + `@Roles(ADMIN, SUPERADMIN)` **⚠** | — | comment | |

### Module `interactions` — `/api/interactions`

| Method | Path | Auth | Request | Response `result` | Ghi chú |
|---|---|---|---|---|---|
| POST | `/api/interactions` | JWT | `CreateInteractionDto` `{score, type, movieId}` — `type` ∈ `like, dislike, favorite, watchlist, rating, comment, click` | **`{success, action: 'added'\|'removed', type, data?}`** | **TOGGLE**: đã tồn tại (user+movie+type) → xóa, `action='removed'`; chưa → tạo với `score = InteractionScoreMap[type]`, publish `interaction.event` (chỉ khi thêm), `action='added'` + `data` |
| GET | `/api/interactions` | Public | `{page, limit}` | interaction[] + `pagination` | join `user`, `movie` |
| GET | `/api/interactions/my-history` | JWT | `{page, limit}` | interaction[] + `pagination` | chỉ `type=click` (lịch sử xem), join `movie` |
| GET | `/api/interactions/my-favorites` | JWT | `{page, limit}` | interaction[] + `pagination` | `type ∈ like, favorite, watchlist` |
| GET | `/api/interactions/:id` | Public | — | interaction | |
| DELETE | `/api/interactions/:id` | JWT | — | `{success: true}` | |

`InteractionScoreMap`: `like=10`, `favorite=7`, `comment=5`, `watchlist=3`, `click=2`, `dislike=1`, `rating=0` (động, lấy đúng điểm user nhập).

### Module `files` — `/api/files` (class-level `JwtAuthGuard`)

| Method | Path | Auth | Request | Response `result` | Ghi chú |
|---|---|---|---|---|---|
| POST | `/api/files/upload` | JWT + `@Roles(ADMIN, SUPERADMIN, USER)` **⚠** | `multipart/form-data` field `file`, ≤5MB, `jpg/jpeg/png/webp` | `{url}` | `201`; S3/R2, thư mục `uploads` |

### Module `failed-events` — `/api/failed-events` (⚠ **KHÔNG có JwtAuthGuard**, `@Roles` không được enforce)

| Method | Path | Auth | Request | Response | Ghi chú |
|---|---|---|---|---|---|
| GET | `/api/failed-events` | ⚠ Public (chỉ rate-limit) | query `{page=1, limit=10, status?}` — `status` ∈ `PENDING`, `RETRIED_SUCCESS`, `RETRIED_FAILED` | envelope chuẩn: `result` = FailedEvent[] + `pagination` | danh sách message rớt DLQ |
| POST | `/api/failed-events/:id/retry` | ⚠ Public (chỉ rate-limit) | path `id` (uuid) | `{success: boolean, statusCode: 200, message}` — **KHÔNG có `result`** | publish lại payload về `movie.exchange` (hoặc `user.exchange` nếu routingKey bắt đầu `user.`); đánh dấu status + tăng `retryCount`; `404` nếu không thấy |

### Module `health` — `/api/health`

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/api/health` | Public | format **Terminus** của `@nestjs/terminus` — **KHÔNG envelope** `{status, info: {database: {...}}, error...}` — chỉ ping database |

## WebSocket events

Socket.IO server chạy **cùng cổng 8081**, CORS `origin: '*'` (`src/modules/events/events.gateway.ts`). Không bắt buộc authenticate khi kết nối.

| Hướng | Event | Payload | Khi nào |
|---|---|---|---|
| Server → Client | `movie-{movieId}-comment` | `Comment` vừa tạo (đã lưu) | sau `POST /api/comments` thành công |
| Server → Client | `movie-{movieId}-rating` | `Rating` + `movieStats: {voteCount, voteAverage}` | sau `POST /api/ratings` thành công |
| Server → Client | `movie-{movieId}-viewCount` | `{movieId, viewCount}` | sau `POST /api/movies/:id/view` |
| Server → Client | `movie-{movieId}-typing` | `{isTyping: boolean, userFullName: string}` | khi client khác gửi `typingComment` (broadcast) |
| Client → Server | `typingComment` | `{movieId: number, isTyping: boolean, userFullName?: string}` | người dùng đang gõ bình luận |

## RabbitMQ events

Backend là **producer** cho 3 exchange topic (durable, `assertExchange` trong `MessagingModule`) và **consumer cho 2 DLQ**. Kết nối qua `amqp-connection-manager`, `RABBITMQ_URL` (mặc định `amqp://guest:guest@localhost:5672`), `publishTimeout: 3000`.

**Envelope sự kiện** (`EventEnvelope<T>`): `{eventId, eventType, eventVersion, source, occurredAt, correlationId?, payload}`.

| Exchange (topic) | Routing key | Producer (backend) | Nội dung payload | Người tiêu thụ |
|---|---|---|---|---|
| `movie.exchange` | `movie.created` | `POST /api/movies` (MoviesService.create) | `{movieId, title, titleVi, overview, overviewVi, genres[]}` | ai-service (`recommendation.queue`) |
| `movie.exchange` | `movie.updated` | `PATCH /api/movies/:id` (khi đổi field AI) | như trên | ai-service |
| `movie.exchange` | `movie.deleted` | `DELETE /api/movies/:id` | `{movieId}` | ai-service |
| `user.exchange` | `user.created` | `UsersService.create` | `{userId, email, fullName, status}` | ai-service |
| `user.exchange` | `user.updated` | `UsersService.update` | user payload | ai-service |
| `user.exchange` | `user.deleted` | `UsersService.remove` | `{userId}` | ai-service |
| `user.exchange` | `user.email_verification.requested` | register / send-verification-email (khi `ASYNC_MAIL_ENABLED=true`) | `{userId, email, verificationToken}` | (mail worker) |
| `user.exchange` | `user.email_verified` | `POST /api/auth/verify-email` | `{userId, email?}` | ai-service |
| `interaction.exchange` | `interaction.event` | `POST /api/interactions` (toggle ON) | `{userId, movieId, action, rating}` | ai-service (cập nhật vector real-time) |
| `interaction.exchange` | `training.batch` | cron `InteractionCronService` | `{interactions: [{userId, movieId, action, rating, createdAt}]}` | ai-service (training ALS) |

**Routing key / binding (hằng trong `messaging.constants.ts`)**: `movie.#` → `movie.queue`, `user.#` → `user.queue`, `interaction.event` / `training.batch` → `interaction.queue` (queue do ai-service/infra định nghĩa).

**DLQ flow (backend là consumer DLQ, ghi vào bảng `failed_events`)**:

| DLX (exchange) | DLQ (queue) | Routing key DLQ | Consumer backend | Hậu quả |
|---|---|---|---|---|
| `recommendation.queue.dlx` | `recommendation.queue.dlq` | `recommendation.queue.dlq.rk` | `RecommendationConsumer` | lưu `FailedEvent` (`status=PENDING`) → xem tại `GET /api/failed-events`, retry tại `POST /api/failed-events/:id/retry` |
| `interaction.queue.dlx` | `interaction.queue.dlq` | `interaction.queue.dlq.rk` | `InteractionConsumer` | như trên |

Consumer đọc header `x-death` / `x-first-death-*` để khôi phục routing key/queue gốc. (Trong quá trình thử còn có `recommendation.queue.retry.10s` + `movie.exchange.retry.10s` do ai-service cấu hình retry.)

**Cron**: `@Cron('0 */1440 * * * *')` (**mỗi 24 giờ**) — `interaction.cron.ts`: gửi `training.batch` gồm seed ratings (chunk 10.000, tối đa 10.000 dòng) + toàn bộ interactions của app (chunk 10.000); có cờ chống chạy chồng.

**Backend KHÔNG consume `movie.queue`/`user.queue`/`interaction.queue` business và KHÔNG HTTP-call ai-service** — chỉ publish + consume DLQ.

## Database entities

TypeORM + PostgreSQL, `synchronize: true` (**không migration**). Mọi entity kế thừa `BaseAuditEntity`: `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

| Entity (bảng) | PK | Fields chính / quan hệ |
|---|---|---|
| `User` (`users`) | `id` uuid | `status` enum `UNVERIFIED/ACTIVE/INACTIVE/BLOCKED` (mặc định UNVERIFIED), `email` unique, `isVerified`, `password`, `fullName`, `phoneNumber`, `avatarUrl`, `preferenceData` jsonb, `birthDate`, `gender`; M2M `roles` (bảng `user_roles`); 1-n `ratings`, `comments`, `interactions` |
| `UserProvider` (`user_providers`) | `id` uuid | `userId`, `provider`, `providerId`; unique (provider, providerId) — OAuth Google |
| `Role` (`roles`) | `id` number | `code` unique, `name`, `description`; M2M `users` |
| `Movie` (`movies`) | `id` **bigint** | `tmdbId` (bigint, unique), `imdbId` (varchar, unique), `title`, `titleVi`, `overview`, `overviewVi`, `releaseDate` **varchar(20)**, `posterPath`, `backdropPath`, `homepage`, `originCountry`, `originalLanguage`, `budget`, `revenue`, `status`, `video`, `isAiTranslated`, `voteAverage`, `voteCount`, `viewCount`; M2M `genres` (bảng `movie_genres`); 1-n `moviePeoples`; n-1 `country`; 1-n `ratings`, `comments`, `interactions` |
| `Genre` (`genres`) | `id` number | `name`, `enName?`; M2M `movies` |
| `Country` (`countries`) | `id` number | `name`, `code`; 1-n `movies` |
| `People` (`peoples`) | `id` number | `fullName`, `birthDate`, `nationality`, `gender`, `mainRole` (mặc định `actor`); 1-n `moviePeoples` |
| `MoviePeople` (`movie_peoples`) | kép `movieId` + `peopleId` | n-1 `movie`, n-1 `people`, `role` varchar(50) |
| `Rating` (`ratings`) | `id` number | `rating` float, `timestamp`; n-1 `user`, `movie`; **unique (user, movie)** |
| `SeedRating` (`seed_ratings`) | `id` number | `score` (float, base 10), `userId` varchar, `movieId` bigint; unique (movieId, userId) — dữ liệu seed cho training |
| `Comment` (`comments`) | `id` number | `content` text, `parentId` bigint (null = root); n-1 `user`, `movie` |
| `Interaction` (`interactions`) | `id` number | `score`, `type` enum `like/dislike/favorite/watchlist/rating/comment/click`; n-1 `user`, `movie`; **unique (user, movie, type)** |
| `FailedEvent` (`failed_events`) | `id` uuid | `source`, `queueName`, `routingKey`, `eventId` unique, `eventType`, `correlationId`, `payload` json, `errorReason`, `status` `PENDING/RETRIED_SUCCESS/RETRIED_FAILED`, `retryCount` |
| `Permission` (`permissions`) | — | entity có trong module permissions nhưng **chưa dùng** (module là stub) |

Redis keys liên quan: `auth:session:{sessionId}`, `auth:blacklist:{jti}`, `auth:user:{userId}:sessions`, `auth:verify_email:{token}`, `auth:reset_password:{token}`, `rl:{strategy}:...` (rate-limit).

## Port & CORS & Rate limit

| Service | Port | Đường dẫn / ghi chú |
|---|---|---|
| backend (NestJS) | **8081** | REST `/api/*`, Swagger `/api`, Socket.IO cùng cổng |
| ai-service (FastAPI) | **8082** | prefix `/api/recommendations` |
| Kong gateway | **8000** | `/api` → 8081, `/api/recommendations` → 8082 (`gateway/kong.yml`) |
| frontend (Next.js) | **3002** | `NEXT_PUBLIC_API_BASE_URL=http://localhost:8081/api` (gọi thẳng backend) |
| PostgreSQL / Redis / RabbitMQ | env (`DB_PORT`, `REDIS_PORT`, 5672) | |

**CORS backend** (`main.ts`): origin = `FRONTEND_ORIGINS` (env, phân tách `,` — gồm `http://localhost:3000`, `3001`, `3002`), `credentials: true`.
**CORS Kong**: origins `http://localhost:5173`, `http://localhost:3002`, methods GET/POST/PUT/PATCH/DELETE/OPTIONS, header `Authorization`, `credentials: true`, gắn `X-Request-ID` (uuid).

**Rate limit** (Redis, `RateLimitGuard` đăng ký global qua `APP_GUARD`):

| Phạm vi | Strategy | Limit |
|---|---|---|
| **Global (mọi request, không có `@RateLimit`)** | fixed-window / IP | **100 request/phút** |
| `POST /api/auth/login` | sliding-window / IP | 5/phút |
| `POST /api/auth/register` | sliding-window / IP | 5/phút |
| `POST /api/auth/refresh` | token-bucket / IP | 10/phút |
| `POST /api/auth/forgot-password` | sliding-window | 3/phút |
| `POST /api/auth/reset-password` | sliding-window | 3/phút |
| Kong (toàn cục gateway) | local policy | 120 request/phút |

Vượt limit → HTTP **429 Too Many Requests** với message của decorator (hoặc `"Quá nhiều request, vui lòng thử lại sau"`).

## Lưu ý cho Frontend/Client

1. **Envelope**: mọi response thành công có `{success, statusCode, message, result}`; list phân trang có thêm `pagination: {total, page, limit, totalPages}`; lỗi có `{success:false, statusCode, message, errorCode?, timestamp, path}`. **Ngoại lệ**: `GET /api/health` (Terminus), `POST /api/failed-events/:id/retry` (không có `result`), `GET /api` (text).
2. **Phân trang**: query `{page=1, limit=10, keyword?}` (đã convert number, `keyword` optional). Response `result` là **mảng data thuần**, phân trang nằm ở key `pagination` (không nằm trong `result`).
3. **Auth flow**:
   - Login `POST /api/auth/login` với `{username, password}` (**`username` = email**) → nhận `accessToken` trong JSON + cookie `refreshToken` httpOnly (không đọc được bằng JS).
   - Gọi API bảo mật: header `Authorization: Bearer <accessToken>`.
   - Hết hạn → `POST /api/auth/refresh` (gửi kèm cookie, không cần body) → token mới; `401` nếu session bị thu hồi (đã logout / blacklist jti).
   - Quy tắc: `401` = chưa đăng nhập/token sai/hết hạn; `403` = sai quyền (chỉ xảy ra thật ở `GET /api/roles`).
   - Google OAuth: `GET /api/auth/google` → callback set cookie → redirect `${FRONTEND_URL}/auth/google-success`.
4. **Validation strict**: `forbidNonWhitelisted` → không gửi field thừa; field body/query có thể gửi snake_case (interceptor đổi sang camelCase).
5. **Interactions là TOGGLE**: `POST /api/interactions` gọi 1 lần để bật, gọi lại để tắt — đọc `result.action` (`added`/`removed`) thay vì giả định luôn tạo mới. `POST /api/movies/:id/view` là Optional JWT (tăng view kể cả khi chưa đăng nhập).
6. **Real-time**: kết nối Socket.IO tới `http://localhost:8081` rồi subscribe `movie-{id}-comment`, `movie-{id}-rating`, `movie-{id}-viewCount`, `movie-{id}-typing`; gửi `typingComment` khi người dùng gõ.
7. **Không có endpoint recommendation trong backend**: gợi ý nằm ở ai-service — gọi qua Kong `http://localhost:8000/api/recommendations/...` hoặc trực tiếp `http://localhost:8082/api/recommendations/...`. Backend chỉ trao đổi với ai-service qua RabbitMQ.
8. **Phân quyền thực tế**: `@Roles` chưa được enforce ở hầu hết module (RolesGuard chỉ gắn ở `/api/roles`). Đừng dựa vào `@Roles` để bảo vệ UI/API phía client — kiểm tra `roles` trong `GET /api/auth/me`.
9. **Đổi mật khẩu** (`PATCH /api/auth/change-password`) sẽ logout toàn bộ phiên → client cần đăng nhập lại.
10. **Upload ảnh**: `POST /api/files/upload` và `POST /api/users/avatar` — multipart field `file`, ≤5MB, chỉ `jpg/jpeg/png/webp` → `{result: {url}}`.
