# CODE_RULES — Quy tắc code xuyên service (BẮT BUỘC)

Áp dụng cho toàn bộ `backend/`, `frontend/`, `ai-service/`. File này **chi tiết hoá** các phần còn thiếu của rules hiện có: logging, async/await, testing, return contract cho list, Definition of Done. Đọc cùng:

- `docs/BACKEND_RULES.md` — contract response, auth/security, DB, event (backend).
- `docs/FRONTEND_RULES.md` — **file rules frontend duy nhất**: stack, API layer, state, auth, shadcn/ui, motion, responsive, a11y.

## 0. Phạm vi & thứ tự ưu tiên

| Tài liệu | Phạm vi | Vai trò |
|---|---|---|
| `docs/BACKEND_RULES.md` | Backend: envelope, auth, DB, event, bảo mật | Nguồn chân lý về contract gốc |
| `docs/FRONTEND_RULES.md` | Frontend: stack, axiosClient, React Query, zustand, UI, motion, responsive, a11y | Nguồn chân lý về frontend (gộp UI rules từ V20) |
| `docs/CODE_RULES.md` (file này) | Logging, async/await, testing, contract list, DoD | Chi tiết hoá, **không nới lỏng** rules gốc |

Khi xung đột:

1. **Bảo mật / envelope response / auth** → theo `BACKEND_RULES.md` + `FRONTEND_RULES.md`.
2. **Animation card / shadcn / a11y** → theo `FRONTEND_RULES.md` mục 3, 6, 7.
3. Mọi điểm còn lại → file này.

Không có rule nào cho phép bỏ qua bảo mật, envelope, hoặc test để "cho xanh CI". Ngoại lệ phải được developer duyệt và ghi lại trong plan.

Nhãn dùng trong tài liệu:

- 🔴 **BẮT BUỘC** — vi phạm = không được merge.
- 🟡 **KHUYẾN NGHỊ** — nên làm, có thể trả nợ sau nhưng phải ghi follow-up.
- ⚠️ **HIỆN TRẠNG** — nợ kỹ thuật đã biết trong repo, chưa sửa trong plan V18.
- 🔁 **FOLLOW-UP** — việc phải làm ở plan khác.

---

## 1. Logging (backend NestJS)

### 1.1 Khởi tạo logger — context là tên class 🔴

Mỗi service/consumer/gateway tạo **một** logger ở cấp instance, `context = TênClass.name`.

```ts
// ĐÚNG — backend/src/modules/movies/movies.service.ts
@Injectable()
export class MoviesService {
  private readonly logger = new Logger(MoviesService.name);
}
```

```ts
// SAI
const logger = new Logger('MoviesService');   // hardcode string, sai khi rename class
console.log('created movie', id);             // cấm trong backend
this.logger.log('ok');                        // không có id/context nghiệp vụ → vô dụng khi debug
```

Pattern tham chiếu trong repo:

- `backend/src/modules/movies/movies.service.ts` — khởi tạo `Logger`, log publish event/seed. ⚠️ Chưa log `create/update/delete` → bổ sung theo bảng 1.2.
- `backend/src/modules/auth/auth.service.ts` — có `Logger` + log luồng login Google; dùng làm mẫu **khởi tạo + log flow**, nhưng **không copy** phần log token ở mục 1.4.

### 1.2 Bắt buộc log ở đâu 🔴

| Hành vi | Level | Nội dung tối thiểu |
|---|---|---|
| `create` / `update` / `delete` | `log` | entity + id + userId (nếu có) + field thay đổi (không log value nhạy cảm) |
| Auth: `login`, `refreshToken`, `logout`, `logoutAll`, `resetPassword` | `log` / `warn` | userId, sessionId (rút gọn), kết quả — **không** token |
| Publish event | `log` | routing key/exchange + id nghiệp vụ + correlationId |
| Consume event | `log` khi nhận, `error` khi fail | queue + id + attempt/retry count |
| Transaction | `log` bắt đầu/kết thúc, `error` + rollback | tên nghiệp vụ + số bản ghi |
| External call (ai-service, mail, storage) | `log` + duration, `warn`/`error` khi lỗi | method + path (không kèm query chứa secret) + status + ms |
| Cron/scheduler | `log` start/end + số item | tên job + duration + count |
| Business reject có fallback | `warn` | lý do + id |

### 1.3 Ví dụ ĐÚNG

```ts
// create
async create(dto: CreateMovieDto) {
  await this.validateRelations(dto);
  const saved = await this.repo.create(this.mapDtoToEntity(dto));
  this.logger.log(`Tạo phim thành công: movieId=${saved.id}`);
  return saved;
}

// update — chỉ log field thay đổi, không log toàn bộ body
async update(id: number, dto: UpdateMovieDto) {
  const movie = await this.findOne(id);
  const changedFields = Object.keys(dto);
  const updated = await this.repo.update(movie.id, this.mapDtoToEntity(dto));
  this.logger.log(
    `Cập nhật phim: movieId=${id}, fields=[${changedFields.join(',')}]`,
  );
  return updated;
}

// delete
async remove(id: number) {
  const movie = await this.findOne(id);
  await this.repo.remove(movie.id);
  this.logger.log(`Xoá phim: movieId=${id}`);
  return { success: true };
}

// external call — log kết quả, không log token
const startedAt = Date.now();
try {
  const { data } = await firstValueFrom(
    this.httpService.get(`${this.aiServiceUrl}/similar/${movieId}`),
  );
  this.logger.log(
    `Gọi ai-service similar: movieId=${movieId}, items=${data?.result?.length ?? 0}, ${Date.now() - startedAt}ms`,
  );
  return data;
} catch (error) {
  this.logger.error(
    `Gọi ai-service similar thất bại: movieId=${movieId}, ${Date.now() - startedAt}ms`,
    error instanceof Error ? error.stack : undefined,
  );
  throw new AppException(
    HttpStatus.BAD_GATEWAY,
    'Không lấy được phim tương tự, vui lòng thử lại sau',
    'ai-service /similar failed',
    'AI_SERVICE_UNAVAILABLE',
  );
}
```

### 1.4 CẤM log dữ liệu nhạy cảm 🔴

Danh sách cấm tuyệt đối: `password`, `passwordHash`, `refreshToken`, `accessToken`, `authorization` header, cookie, OTP/verification token, reset token, API key, `client_secret`, PII nhạy cảm (email/phone/CCCD — chỉ log dạng mask hoặc id).

**Vi phạm hiện tại (⚠️ phải sửa): `backend/src/modules/auth/auth.service.ts` — nhánh refresh token sai:**

```ts
// SAI — đang có trong repo
this.logger.log('[Session Token]', session?.refreshToken);
this.logger.log('[Refresh Token]', refreshToken);
```

Hệ quả: refresh token bị ghi ra file/console/aggregator → chiếm session vĩnh viễn. Khi sửa, chỉ log **dấu hiệu** và id:

```ts
// ĐÚNG
this.logger.warn(
  `Refresh token không hợp lệ: sessionId=${sessionId}, hasSession=${Boolean(session)}`,
);
```

Các vi phạm mẫu khác:

```ts
// SAI
this.logger.log(`Login body: ${JSON.stringify(loginDto)}`);      // chứa password
this.logger.error('Auth failed', error);                          // error có thể chứa header
this.logger.log(`Authorization: ${req.headers.authorization}`);   // header token
this.logger.log(`Email: ${user.email}`);                          // PII — dùng userId
console.error(error.response);                                    // response auth có token

// ĐÚNG
this.logger.log(`Đăng nhập thất bại: userId=${userId}, reason=INVALID_PASSWORD`);
this.logger.log(`Tạo user: userId=${saved.id}`);
```

Helper mask dùng chung (khuyến nghị thêm vào `src/common/utlils/`):

```ts
export const maskEmail = (email?: string) =>
  !email ? undefined : email.replace(/^(.).*(@.*)$/, '$1***$2');
```

### 1.5 correlationId 🟡 (đang là 🔁 FOLLOW-UP)

- `CorrelationIdInterceptor` đã có tại `backend/src/common/interceptors/correlation-id.interceptor.ts` (đọc `x-correlation-id`, fallback `uuidv4()`, gán `req.correlationId`).
- ⚠️ Hiện chưa mount global trong `backend/src/main.ts` (chỉ có `CamelCaseInterceptor`, `LoggingInterceptor`). Khi bật, đăng ký global **và** set vào CLS (`nestjs-cls` đã cấu hình trong `app.module.ts`) để service lấy được.

Mẫu đích (không tự sửa ngoài task có yêu cầu):

```ts
// main.ts
app.useGlobalInterceptors(new CorrelationIdInterceptor());

// correlation-id.interceptor.ts — set thêm CLS
this.cls.set('correlationId', correlationId);

// service
this.logger.log(`[cid=${this.cls.get('correlationId')}] Tạo phim: movieId=${id}`);
```

Quy ước log: `[cid=<id>] <hành vi>: <key=value>`. Không tự sinh correlationId trong từng service.

### 1.6 Level & nội dung log 🔴

- `log`: luồng nghiệp vụ bình thường.
- `warn`: fallback, retry, business reject không phải lỗi hệ thống.
- `error`: exception; **kèm stack**, nhưng đã sanitize (không truyền nguyên object request/response auth).
- Không log lặp trong vòng lặp lớn (log 1 dòng tổng kết + id lỗi).
- Message tiếng Việt hoặc tiếng Anh ngắn gọn đều được; **không** đổi message lỗi trả client (message lỗi client phải tiếng Việt theo `BACKEND_RULES.md`).

```ts
// SAI
this.logger.error(JSON.stringify({ dto, token }));

// ĐÚNG
this.logger.error(
  `Thanh toán thất bại: orderId=${orderId}`,
  error instanceof Error ? error.stack : undefined,
);
```

---

## 2. Async/await & xử lý lỗi

### 2.1 Await mọi I/O 🔴

Mọi `Promise` (DB, HTTP, Redis, queue, file, mail) phải được `await`.

```ts
// SAI — floating promise, lỗi bị nuốt, test chạy trước khi save xong
this.repo.save(entity);
this.producer.publishMovieCreated(payload);

// ĐÚNG
await this.repo.save(entity);
await this.producer.publishMovieCreated(payload);
```

ESLint backend đã bật `@typescript-eslint/no-floating-promises` ở mức `warn` → **không được lợi dụng mức warn**; review phải coi warning này là lỗi.

### 2.2 Không `async` nếu không `await` 🔴

```ts
// SAI — async thừa, làm caller phải await vô ích
async findAll() {
  return this.repo.findAll();
}

// ĐÚNG
findAll() {
  return this.repo.findAll();
}
```

Ngoại lệ: method cần trả `Promise` để khớp interface, hoặc cần `try/catch`/`finally` thật.

### 2.3 Cấm `forEach(async ...)` 🔴

`forEach` không chờ callback → sai thứ tự, lỗi không bắt được.

```ts
// SAI
items.forEach(async (item) => {
  await this.repo.save(item);
});

// ĐÚNG — tuần tự (khi cần thứ tự / transaction)
for (const item of items) {
  await this.repo.save(item);
}

// ĐÚNG — song song có giới hạn (khi độc lập)
await Promise.all(items.map((item) => this.repo.save(item)));
```

Với >50 item, chia batch để tránh bão connection:

```ts
const batchSize = 20;
for (let i = 0; i < items.length; i += batchSize) {
  await Promise.all(items.slice(i, i + batchSize).map((item) => this.repo.save(item)));
}
```

### 2.4 `Promise.all` cho tác vụ độc lập 🔴

```ts
// SAI — tuần tự không cần thiết
const user = await this.usersService.findById(userId);
const movie = await this.moviesService.findOne(movieId);
const stats = await this.statsService.getStats(movieId);

// ĐÚNG
const [user, movie, stats] = await Promise.all([
  this.usersService.findById(userId),
  this.moviesService.findOne(movieId),
  this.statsService.getStats(movieId),
]);
```

Tác vụ phụ thuộc nhau (cần id từ bước trước) → bắt buộc tuần tự.

### 2.5 Transaction & publish event 🔴

- `dataSource.transaction(async (manager) => { ... })` phải được `await` và **không** `await` bên trong `.then()` lồng nhau.
- Publish event **sau khi commit** để consumer không đọc dữ liệu chưa tồn tại.
- Không gọi HTTP/email trong transaction (giữ transaction ngắn).

```ts
// SAI — publish trong transaction; rollback vẫn đã gửi event
await this.dataSource.transaction(async (manager) => {
  const saved = await manager.save(movie);
  await this.movieProducer.publishMovieCreated({ movieId: saved.id });
});

// ĐÚNG
const saved = await this.dataSource.transaction(async (manager) => {
  return manager.save(movie);
});
await this.movieProducer.publishMovieCreated({ movieId: saved.id });
```

### 2.6 Không dùng `void` để che floating promise 🔴

```ts
// SAI
void this.repo.save(entity);

// ĐÚNG — fire-and-forget có chủ đích, lỗi được log
void this.auditService
  .write(entity.id)
  .catch((error) => this.logger.error(`Ghi audit thất bại: id=${entity.id}`, error.stack));
```

### 2.7 Lỗi phải là `HttpException` hoặc `AppException` 🔴

```ts
// SAI
throw new Error('not found');

// ĐÚNG
throw new NotFoundException('Không tìm thấy phim');
throw new AppException(
  HttpStatus.BAD_REQUEST,
  'Thể loại không tồn tại',
  'genreIds contains unknown id',
  'GENRE_NOT_FOUND',
);
```

`AppException` (`backend/src/common/custom-exception/app-exception.ts`) được `HttpExceptionFilter` bắt và trả envelope lỗi. Message trả client **bắt buộc tiếng Việt**.

### 2.8 Frontend & ai-service 🟡

- FE: `await` mutation/query; event handler async phải `try/catch` + `toast.error(parseAxiosError(error).message)`; không `useEffect(async () => ...)`.
- AI: endpoint async phải `await` I/O; không block event loop bằng model load nặng trong request path; background task phải có error handler.

---

## 3. Testing bắt buộc

### 3.1 Vị trí & framework 🔴

| Service | Framework | Vị trí | Lệnh |
|---|---|---|---|
| backend | Jest + `@nestjs/testing` | `*.spec.ts` **cạnh file nguồn** (`src/**`) | `npm test` |
| frontend | Vitest + Testing Library | `*.test.tsx` cạnh component hoặc `__tests__/` | `npm test` |
| ai-service | pytest | `ai-service/tests/unit/test_*.py` | `pytest tests/unit -q` |

### 3.2 Backend service test — mock qua DI token 🔴

Không `new Service(...)`, không mock bằng `jest.mock` module nội bộ. Dùng token interface (`IMovieRepository`, `IMailService`, ...).

```ts
// backend/src/modules/movies/movies.service.spec.ts
const repoMock = {
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};
const dataSourceMock = { getRepository: jest.fn(), transaction: jest.fn() };

beforeEach(async () => {
  const module = await Test.createTestingModule({
    providers: [
      MoviesService,
      { provide: IMovieRepository, useValue: repoMock },
      { provide: DataSource, useValue: dataSourceMock },
      { provide: MovieProducer, useValue: { publishMovieCreated: jest.fn() } },
      { provide: EventsGateway, useValue: {} },
      { provide: InteractionProducer, useValue: {} },
      { provide: MovieInteractionStatsService, useValue: {} },
    ],
  }).compile();
  service = module.get(MoviesService);
});

it('tạo phim: lưu và trả entity', async () => {
  repoMock.create.mockResolvedValue({ id: 1, title: 'Dune' });
  await expect(service.create(dto)).resolves.toMatchObject({ id: 1 });
  expect(repoMock.create).toHaveBeenCalledTimes(1);
});

it('tạo phim: ném BadRequest khi thể loại không tồn tại', async () => {
  dataSourceMock.getRepository.mockReturnValue({ count: jest.fn().mockResolvedValue(0) });
  await expect(service.create(dto)).rejects.toBeInstanceOf(BadRequestException);
});
```

### 3.3 Backend controller test — assert envelope 🔴

```ts
it('GET /movies trả envelope có pagination', async () => {
  serviceMock.findAll.mockResolvedValue({
    result: [{ id: 1 }],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  });

  await expect(controller.findAll({ page: 1, limit: 10 })).resolves.toEqual({
    success: true,
    statusCode: 200,
    message: expect.any(String),
    result: [{ id: 1 }],
    pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
  });
});
```

Guard/interceptor phải có test riêng: `RolesGuard` (đủ/thiếu quyền), `JwtAuthGuard` (token thiếu/hết hạn), interceptor (map snake→camel, set correlationId).

### 3.4 Frontend test — Vitest + mock API 🔴 (khi viết test)

Hiện trạng ✅ (2026-11-04, sau V19): `frontend` đã có **28 file test / 232 test**, devDeps `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`, `msw@^2`, `@vitest/coverage-v8`; `vitest.setup.ts` mock `next/image` + `next/navigation`; đã **bỏ `passWithNoTests`** và bật `coverage.thresholds` 60. Coverage hiện 68.05% statements trên phạm vi `coverage.include` đã khai báo (chưa phủ toàn bộ components/pages).

Ưu tiên mock ở tầng API (`axiosClient` hoặc MSW). Không gọi backend thật trong unit test.

```tsx
// movie-card.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MovieCard } from './movie-card';

vi.mock('next/image', () => ({ default: (props: any) => <img {...props} alt={props.alt} /> }));
vi.mock('next/link', () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));

it('hiển thị tiêu đề và link tới chi tiết phim', () => {
  render(<MovieCard movie={movieFixture} />);
  expect(screen.getByRole('link', { name: movieFixture.titleVi })).toHaveAttribute(
    'href',
    `/movies/${movieFixture.id}`,
  );
});
```

### 3.5 ai-service test — mock dependency nặng 🔴

Không load model thật/Chroma thật/RabbitMQ/Redis thật trong unit test. Dùng `monkeypatch`/`unittest.mock`.

```python
def test_semantic_search_empty_query(monkeypatch):
    monkeypatch.setattr("src.services.search.embed", lambda q: [0.0] * 8)
    monkeypatch.setattr("src.services.search.chroma.query", lambda **_: {"ids": [[]]})
    assert search_semantic("") == []
```

### 3.6 Mỗi feature tối thiểu 3 nhóm case 🔴

- **Happy path**: input hợp lệ → output đúng contract.
- **Error path**: input sai/quyền sai/dependency lỗi → exception đúng loại + message tiếng Việt.
- **Edge case**: list rỗng, `page` vượt tổng trang, `limit` biên, id không tồn tại, user chưa đăng nhập, dữ liệu `null`.

### 3.7 Cấm 🔴

- `it('should be defined', ...)` — **đã dọn sạch ở backend/V19** (0 file còn skeleton); không được thêm mới, khi sửa feature phải thay bằng test hành vi.
- Snapshot-only cho logic nghiệp vụ; test phụ thuộc thứ tự/giờ hệ thống mà không mock.
- Test pass bằng cách `skip`, `todo`, comment code, hoặc nới assertion.
- Gọi network/DB thật trong unit test.

### 3.8 Coverage & chạy full suite 🔴

| Service | Ngưỡng statements | Lệnh | Hiện trạng (2026-11-04) |
|---|---|---|---|
| backend | 70% | `npm run test:cov` (hoặc `npx jest --runInBand --coverage`) | 72.29% — **đã bật `jest.coverageThreshold`** nên fail CI nếu tụt |
| frontend | 60% | `npm run test -- --coverage` | 68.05% — threshold trong `vitest.config.ts` |
| ai-service | 65% | `pytest --cov=src --cov-report=term-missing` (dùng `.venv\Scripts\python -m pytest`, không dùng Python global) | 94% — CI chạy `--cov-fail-under=65` |

Trước khi báo xong: chạy **toàn bộ suite** của service bị ảnh hưởng. Fail → tìm nguyên nhân, sửa hoặc báo cáo rõ; **không** báo hoàn thành khi test đỏ.

---

## 4. Return contract cho list (NestJS)

### 4.1 Service & controller 🔴

Type có sẵn:

- `ResultWithPagination<T>` — `backend/src/common/dtos/paginated-result.interface.ts`
- `Pagination`, `ApiResponse<T>`, `ApiResponseWithPagination<T>` — `backend/src/common/dtos/api-response.dto.ts`

Service:

```ts
// ĐÚNG
async findAll(dto: PaginationDto): Promise<ResultWithPagination<Movie>> {
  const [result, total] = await this.repo.findAndCount(dto);
  return {
    result,
    pagination: {
      page: dto.page ?? 1,
      limit: dto.limit ?? 10,
      total,
      totalPages: Math.ceil(total / (dto.limit ?? 10)),
    },
  };
}
```

Controller:

```ts
// ĐÚNG
@Get()
async findAll(
  @Query() dto: PaginationDto,
): Promise<ApiResponseWithPagination<Movie[]>> {
  const { result, pagination } = await this.moviesService.findAll(dto);
  return {
    success: true,
    statusCode: 200,
    message: 'Lấy danh sách phim thành công',
    result,
    pagination,
  };
}
```

Single item: controller trả `result: T` (không bọc thêm `{ success }` bên trong). Mutation trả `result` là dữ liệu cần thiết (id/entity/hành động), message tiếng Việt.

### 4.2 Cấm 🔴

```ts
// SAI — service trả shape legacy
return { data, total, page, limit, totalPages };

// SAI — controller tự chế shape
return { data: result.data, total: result.total, page, limit };

// SAI — lồng envelope trong result
return { success: true, statusCode: 200, message: '...', result: { success: true, data } };

// SAI — controller tự map lại từng field thay vì dùng type chung
const { data, ...pagination } = await service.findAll(dto);
```

### 4.3 Hiện trạng các module & follow-up

⚠️ Đây là **nợ kỹ thuật đã biết**, **không refactor trong V18**. Khi có plan riêng, chuyển service sang `ResultWithPagination` và controller sang `ApiResponseWithPagination`.

| Module | Hiện trạng (đã đối chiếu code) | Đích |
|---|---|---|
| `comments` | Service trả `PaginatedResult<Comment>` (`{data,total,page,limit,totalPages}`); controller destructure `data` + spread `pagination` | `ResultWithPagination<Comment>` |
| `interactions` | `findAll` trả `PaginatedResult<Interaction>`; `create/toggle` trả `{success,data}` ngay trong service | Service chỉ trả dữ liệu; envelope do controller |
| `users` | Service trả object `{data,total,page,limit,totalPages}` tự dựng | `ResultWithPagination<User>` |
| `genres` | Service trả `PaginatedResult<Genre>` từ repository | `ResultWithPagination<Genre>` |
| `countries` | Service trả `PaginatedResult<Country>` | `ResultWithPagination<Country>` |
| `peoples` | Service trả thẳng repository (`{data,...}`) | `ResultWithPagination<People>` |
| `ratings` | Service trả thẳng repository; controller có fallback `result.data` khi service trả shape cũ | `ResultWithPagination<Rating>` |
| `failed-events` | Service trả `{data,total,page,limit,totalPages}`; controller map tay | `ResultWithPagination<FailedEvent>` |
| `roles` | `findAll()` trả `Role[]` (không phân trang) | Giữ `ApiResponse<Role[]>`; nếu thêm phân trang thì theo contract list |

Ghi chú:

- `PaginatedResult<T>` (shape `data`) vẫn còn trong repo để tương thích; **code mới không dùng**, dùng `ResultWithPagination<T>`.
- Frontend chỉ đọc `response.result` + `response.pagination` (theo `FRONTEND_RULES.md`); khi backend đổi shape phải thông báo + cập nhật `docs/BACKEND.md`.

---

## 5. Definition of Done & self-check

### 5.1 Thứ tự bắt buộc 🔴

1. `lint` sạch (warning không được tăng).
2. `type-check` sạch.
3. `test` xanh toàn bộ service bị ảnh hưởng (+ coverage nếu feature lớn).
4. `build` thành công.
5. Review 5 trục (mục 5.2).
6. Cập nhật plan (`docs/plans/V*.md`): tick checklist + ghi file đã sửa + rủi ro/follow-up.

| Service | Lint | Type-check | Test | Build |
|---|---|---|---|---|
| `backend/` | `npm run lint` | `npm run type-check` | `npm test` | `npm run build` |
| `frontend/` | `npm run lint` | `npm run type-check` | `npm test` | `npm run build` |
| `ai-service/` | `ruff check .` (nếu có) | `mypy src` (nếu có) | `pytest tests/unit -q` | — |

### 5.2 Review 5 trục 🟡

| Trục | Câu hỏi phải trả lời |
|---|---|
| Correctness | Contract/envelope đúng? Edge case (rỗng, null, page biên) đã xử lý? Transaction/await đủ? |
| Readability | Tên rõ nghĩa? Không lặp code? Log đọc được khi chỉ có 1 dòng? |
| Architecture | Đúng layer controller → service → repository? Không gọi repository trực tiếp trong controller? Không phá interface? |
| Security | Không log secret? Validate DTO? Phân quyền đúng? Không lộ field nhạy cảm trong `result`? |
| Performance | Có N+1? Dùng `Promise.all` hợp lý? Không query trong vòng lặp lớn? |

### 5.3 Dừng & báo cáo, chờ duyệt 🔴

Dừng ngay, không tự xử lý, khi gặp:

- Thay đổi bảo mật/auth/token/secret hoặc quyền truy cập.
- Phá vỡ API contract (đổi field/envelope) ảnh hưởng frontend/ai-service.
- Migration/xoá dữ liệu, đổi schema `synchronize`, seed đè dữ liệu.
- Phải sửa `docs/BACKEND_RULES.md`.
- Test đỏ do nguyên nhân ngoài phạm vi hoặc phải giảm coverage/nới assertion.

Báo cáo: hiện tượng → nguyên nhân → phương án + rủi ro → chờ duyệt.

### 5.4 Git 🔴

- **Không commit/push** khi chưa được yêu cầu.
- Không sửa `docs/BACKEND_RULES.md`, không sửa nội dung `docs/FRONTEND_RULES.md` khi developer **chưa** yêu cầu (V20 đã gộp rules UI vào `FRONTEND_RULES.md` theo yêu cầu developer — đó là ngoại lệ đã được duyệt).
- Commit message theo `BACKEND_RULES.md` khi được yêu cầu.

### 5.5 Self-check nhanh (copy vào PR/plan)

```md
- [ ] Không có `console.log`/`console.error` mới trong backend
- [ ] Logger có context = tên class; log create/update/delete/auth/event/external/cron
- [ ] Không log password/token/OTP/Authorization/PII
- [ ] Không còn floating promise; không `forEach(async)`; không `async` thừa
- [ ] Transaction await đúng; event publish sau commit
- [ ] Test mới có happy + error + edge; không `should be defined`
- [ ] List API trả `{ result, pagination }`; controller trả envelope đầy đủ
- [ ] lint + type-check + test + build xanh
- [ ] Plan đã cập nhật; rủi ro/follow-up đã ghi
```
