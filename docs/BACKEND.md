# BACKEND — NestJS API Service

> Tài liệu mô tả service `backend/` trong dự án **Movie App - Recommendation System**.

## 1. Tổng quan / Mục tiêu của service

`backend/` là **API server của hệ thống**, được xây dựng bằng **NestJS 11** (Node.js), đóng vai trò là nền tảng API + xác thực (auth) + phân quyền (RBAC) cho toàn hệ thống gợi ý phim.

Mục tiêu hiện tại:

- Cung cấp REST API với global prefix `/api` (Swagger UI tại `http://localhost:8081/api`).
- Xác thực người dùng bằng **JWT** (`POST /api/auth/login`) và mã hóa mật khẩu bằng **bcrypt**.
- Quản lý **Người dùng** (Users), **Vai trò** (Roles) theo mô hình RBAC (role → scope được nhúng vào token).
- Kiểm tra sức khỏe hệ thống (`GET /api/health`) — kiểm tra kết nối database.
- Hạ tầng quan sát: **OpenTelemetry** (trace → Jaeger), **Winston** (log, xoay file theo ngày), **CLS** (context theo request).
- **Lưu trữ**: PostgreSQL (TypeORM, `synchronize: true`).

> ⚠️ Lưu ý quan trọng: Đây là một **base scaffold**. Phần "Movie domain / Recommendation / Semantic search" và kết nối **Redis/RabbitMQ** vẫn chưa được code — chúng được thiết kế để hoạt động cùng `ai-service/` (Python) và hạ tầng docker-compose, nhưng backend **chưa kết nối** (không có client Redis, không có consumer/producer RabbitMQ, không gọi HTTP sang ai-service).

## 2. Công nghệ sử dụng

| Thành phần | Công nghệ |
|---|---|
| Framework | NestJS 11, Express platform |
| Database | PostgreSQL (`pg` + `@nestjs/typeorm`, TypeORM) |
| Auth | `@nestjs/jwt`, `@nestjs/passport`, `passport-jwt`, `bcrypt` |
| Validation | `class-validator`, `class-transformer` |
| Docs API | `@nestjs/swagger` + `swagger-ui-express` |
| Health check | `@nestjs/terminus` + `@nestjs/axios` |
| Tracing | `@opentelemetry/sdk-node`, `exporter-trace-otlp-http`, auto-instrumentations |
| Logging | Winston + `nest-winston` + `winston-daily-rotate-file` |
| Per-request context | `nestjs-cls` |
| Config | `@nestjs/config` (validate bằng class-validator) |
| Test | Jest (`*.spec.ts`) |

Scripts chính (`backend/package.json`): `npm run dev` (watch), `npm run build`, `npm run start:prod`, `npm run lint`, `npm test`.

## 3. Cấu trúc thư mục

```
backend/
├── .env                        # cấu hình môi trường (port, DB, JWT secrets...)
├── .editorconfig
├── .gitignore
├── .prettierrc
├── eslint.config.mjs
├── nest-cli.json
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── src/
│   ├── main.ts                 # bootstrap: global prefix 'api', pipes, interceptors, filters, CORS, Swagger
│   ├── app.module.ts           # root module: Config, TypeORM, CLS, Winston + các module nghiệp vụ
│   ├── app.controller.ts       # GET /api -> "Hello World!"
│   ├── app.service.ts
│   ├── types/
│   │   └── express.d.ts        # mở rộng Express.Request với user: JwtPayload
│   ├── config/
│   │   ├── env.validation.ts   # schema class-validator cho biến môi trường
│   │   ├── logger.config.ts    # cấu hình Winston (console dev / JSON + rotate file prod)
│   │   └── tracing.config.ts   # OpenTelemetry NodeSDK -> OTLP exporter (localhost:4317)
│   ├── common/
│   │   ├── audits/             # BaseAuditEntity (createdAt/CreatedBy/updatedAt/UpdatedBy) + TypeORM subscriber
│   │   ├── custom-exception/   # AppException (statusCode, detailMessage, errorCode)
│   │   ├── decorators/         # @CurrentUser(), @Public(), @Roles()
│   │   ├── dtos/               # ApiResponse / Pagination
│   │   ├── filters/            # HttpExceptionFilter (log + JSON lỗi đồng nhất)
│   │   ├── guards/             # RolesGuard, ThrottlerGuard (file rỗng)
│   │   ├── interceptors/       # CamelCase, CorrelationId, Logging, Transform
│   │   ├── interfaces/         # JwtPayload interface { sub, email, fullName, scopes }
│   │   ├── middlewares/        # LoggerMiddleware
│   │   └── utlils/             # date/hash/token-generator (file rỗng, chưa dùng)
│   └── modules/
│       ├── auth/               # Đăng nhập JWT + guards + jwt.strategy
│       ├── health/             # GET /api/health (Terminus)
│       ├── permissions/        # CRUD permissions (STUB - trả chuỗi placeholder)
│       ├── roles/              # CRUD roles (đầy đủ, có role guard)
│       └── users/              # CRUD users (create thật, còn lại là stub)
└── test/                       # e2e tests (jest-e2e)
```

*Bỏ qua `node_modules/`, `dist/` (đã bị .gitignore).*

## 4. Các chức năng chính

### 4.1 Auth (`src/modules/auth/`)
Xác thực bằng JWT Bearer token.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/auth/login` | Body `{ username (email), password }` → validate bằng bcrypt → trả `{ accessToken, refreshToken }` |

- Payload JWT: `{ sub: userId, fullName, email, scopes: [...role codes] }`, hết hạn theo `ACCESS_EXPIRES_IN` (mặc định 1h).
- `refreshToken` hiện là placeholder (`'Chua co'` — chưa implement).
- Có hàm `register()` trong service (mã hóa bcrypt, gán `roleIds: [1]`) **nhưng chưa có route**.

### 4.2 Users (`src/modules/users/`)
Quản lý người dùng.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/users` | Tạo user `{ email, phoneNumber, fullName, password, roleIds[] }`; chặn email trùng (409) |
| GET | `/api/users` | **STUB** — trả chuỗi placeholder |
| GET | `/api/users/:id` | **STUB** |
| PATCH | `/api/users/:id` | **STUB** |
| DELETE | `/api/users/:id` | **STUB** |

- `findByIdWithRoles(id)` / `findByEmail(email)`: query thật có kèm quan hệ `roles`.
- Quan hệ ManyToMany `User ↔ Role` qua bảng join `user_roles`.

### 4.3 Roles (`src/modules/roles/`)
Quản lý vai trò (RBAC) — đầy đủ chức năng, có guard.

| Method | Path | Mô tả |
|---|---|---|
| POST | `/api/roles` | Tạo role `{ code, name, description? }`, chặn trùng code (409) |
| GET | `/api/roles` | Liệt kê roles (yêu cầu scope `ADMIN`/`MANAGER`) |
| GET | `/api/roles/:id` | Chi tiết role |
| PATCH | `/api/roles/:id` | Cập nhật role, chặn trùng code |
| DELETE | `/api/roles/:id` | Xóa role |

- Service có `findAllByIds(ids)` dùng cho việc gán role khi tạo user.

### 4.4 Permissions (`src/modules/permissions/`)
**STUB / scaffold** — các endpoint CRUD `/api/permissions` chỉ trả chuỗi placeholder. Chưa có entity thật, chưa liên kết với roles.

### 4.5 Health (`src/modules/health/`)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/health` | Kiểm tra HTTP (`https://docs.nestjs.com`) + ping database TypeORM |

## 5. Cấu trúc dữ liệu (Database)

TypeORM được cấu hình với `synchronize: true` → tự tạo bảng từ entity, **chưa có migrations**.

| Bảng | Mô tả |
|---|---|
| `users` | `id` PK, `email` (unique), `phone_number`, `full_name`, `password` (bcrypt hash), audit fields |
| `roles` | `id` PK, `code` (unique, VD: ADMIN, MANAGER, CUSTOMER), `name`, `description`, audit fields |
| `user_roles` | Bảng join ManyToMany users ↔ roles |

**Audit fields** (`BaseAuditEntity`): `createdAt`, `createdBy`, `updatedAt`, `updatedBy` — được TypeORM subscriber tự điền từ CLS `userId`. Lưu ý: hiện chưa có middleware nào ghi `userId` vào CLS nên các trường này thường NULL trong thực tế.

## 6. Hạ tầng / Tích hợp

- **OpenTelemetry**: `src/config/tracing.config.ts` — NodeSDK + auto-instrumentations, export trace về `OTEL_EXPORTER_URL` (mặc định `http://localhost:4317` = Jaeger trong docker-compose.observability.yml). Service name: `SERVICE_NAME` (mặc định `backend-service`).
- **Logging**: Winston — console màu (dev) / JSON + file `logs/application-%DATE%.log` rotate hằng ngày (prod). `LoggingInterceptor` được đăng ký global.
- **Validation pipeline**: global `ValidationPipe` (`whitelist`, `forbidNonWhitelisted`, `transform`).
- **Interceptors**: `CamelCaseInterceptor` (snake_case → camelCase body/query), `LoggingInterceptor`.
- **Swagger**: UI tại `/api`, có `addBearerAuth()`.
- **CLS (nestjs-cls)**: đăng ký global, phục vụ context theo request (dùng cho audit fields).
- **CORS**: mở hoàn toàn.

## 7. Khoảng trống / Việc cần làm

- ❌ **Không có** module movie/recommendation/semantic search trong backend.
- ❌ **Không kết nối** Redis (chỉ có container trong docker-compose), dù `.env` có `RABBITMQ_URL` — chưa có amqplib / @nestjs/microservices.
- ❌ **Không gọi** sang ai-service (HTTP/MQ) — liên lạc liên dịch vụ chưa code.
- ❌ **Không có migrations** (đang dùng `synchronize: true`).
- ⚠️ Một số file rỗng/scaffold: `common/guards/*`, `transform.interceptor.ts`, `common/utlils/*`, `permissions/*`.
- ⚠️ `typeorm: "^1.1.0"` trong package.json là phiên bản bất thường (TypeORM stable là 0.3.x) — cần kiểm tra khi cài đặt.
- ⚠️ `findByEmail` ném `NotFoundException` (404) khi user không tồn tại → login với email sai bị 404 thay vì 401.
- ⚠️ `ACCESS_SECRET_KEY` nằm trong `.env` được commit.