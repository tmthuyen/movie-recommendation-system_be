# V18 — Bổ sung Rules: logging, async/await, testing, return contract, UI motion, DoD

> **Ghi chú lịch sử (2026-11-04)**: plan này ban đầu tạo **2 file** rules — `docs/CODE_RULES.md` và `docs/FRONTEND_UI_RULES.md`. Theo yêu cầu developer, `FRONTEND_UI_RULES.md` đã được **gộp vào `docs/FRONTEND_RULES.md`** ở plan **V20** và file UI riêng đã bị xoá. Mọi tham chiếu trong plan này đã trỏ về `FRONTEND_RULES.md`; số mục được ánh xạ lại (§6.2 motion, §6.7 fallback, §13 checklist, §14 follow-up).

## Thông tin chung

| Hạng mục | Nội dung |
|---|---|
| Trạng thái | ✅ Hoàn thành (2026-11-04) |
| Người thực hiện | AI Agent (main) + subagent SA-RULES |
| Thời gian | 2026-11-04 |
| Scope | `docs` |
| Nhánh | `ci-cd` |
| Module liên quan | `docs/CODE_RULES.md` (mới), `docs/FRONTEND_RULES.md` (phần UI, đã gộp ở V20), `AGENTS.md` |
| Không sửa | `docs/BACKEND_RULES.md`; nội dung `docs/FRONTEND_RULES.md` |

## Bối cảnh

Các rules hiện có (`docs/BACKEND_RULES.md`, `docs/FRONTEND_RULES.md`) chưa bao phủ:

1. **Logging service backend** — nhiều service chưa có `Logger`; có service log cả refresh token.
2. **Async/await** — chưa có rule rõ ràng, dễ phát sinh floating promise/`forEach(async)`.
3. **Testing bắt buộc** — backend 27 spec đều `should be defined`; frontend 0 test; ai-service phần lớn test bị comment.
4. **Return contract list** — service trả không đồng nhất `{data,total,...}` và `{result,pagination}`.
5. **UI motion** — card phim chưa có animation xuất hiện; chưa có rule dùng shadcn + motion.
6. **Definition of Done** — chưa có checklist bắt buộc tự kiểm tra rules và báo rủi ro.

## Mục tiêu

Tạo 2 file rules mới, rõ ràng, có ví dụ đúng/sai, được dẫn từ `AGENTS.md`:

- `docs/CODE_RULES.md` — rules xuyên service.
- `docs/FRONTEND_RULES.md` — rules UI/motion chi tiết.

## Nội dung bắt buộc

### 1. Logging (backend NestJS)

- Mọi service dùng `Logger` với context = tên class.
- Log tại các hàm nghiệp vụ đặc biệt: create/update/delete, auth login/refresh/logout, publish/consume event, transaction, external call (AI service), cron.
- Theo pattern đã có: `movies.service.ts`, `auth.service.ts`.
- Cấm log: password, refreshToken, accessToken, OTP, Authorization header, PII nhạy cảm.
- Ưu tiên log kèm `correlationId` (CLS/interceptor).
- Level: `log` (flow), `warn` (fallback/business reject), `error` (exception + stack, không lộ secret).
- Vi phạm hiện tại cần sửa: `auth.service.ts` log refresh token.

### 2. Async/await

- Await mọi I/O; cấm floating promise.
- Không `async` nếu không có `await`.
- Cấm `array.forEach(async ...)`; dùng `for...of` hoặc `Promise.all`.
- Tác vụ độc lập → `Promise.all`; phụ thuộc → tuần tự.
- Transaction/commit await đúng thứ tự; event publish sau commit.
- Lỗi dùng `AppException`/`HttpException`, không `Error` trần.

### 3. Testing bắt buộc

- Backend: `*.spec.ts` cạnh file; service mock repository qua DI token; controller test envelope; guard/interceptor test.
- Frontend: Vitest + Testing Library; mock API bằng MSW hoặc mock `axiosClient`.
- ai-service: pytest dưới `tests/unit/`; mock Chroma/RabbitMQ/Redis/model nặng.
- Mỗi feature: happy path + error path + edge case.
- Cấm test `should be defined`.
- Chạy full suite trước khi báo xong; fail → tìm nguyên nhân, sửa hoặc báo cáo.
- Ngưỡng coverage: backend 70%, frontend 60%, ai-service 65% (statements).

### 4. Return contract cho list (NestJS)

Service trả:

```ts
{
  result: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}
```

Controller trả envelope:

```ts
{
  success: true,
  statusCode: 200,
  message: string,
  result: T[],
  pagination: { page, limit, total, totalPages },
}
```

- Dùng type sẵn có: `ResultWithPagination<T>`, `ApiResponseWithPagination<T>`.
- Cấm service/controller trả trực tiếp `{ data, total, page, limit, totalPages }`.
- Single item: `result: T`; cấm lồng `{ success }` trong `result`.
- Bảng module cần chuẩn hoá: comments, interactions, users, genres, countries, peoples, ratings, failed-events, roles.
- Refactor code toàn bộ **không** nằm trong plan này; ghi thành follow-up.

### 5. UI frontend (shadcn + motion)

- Ưu tiên shadcn/ui; hạn chế HTML thuần; không viết lại component đã có.
- Card (đặc biệt MovieCard) phải có animation xuất hiện: fade + translate/scale + stagger.
- Dùng `motion` (package kế thừa Framer Motion) hoặc `framer-motion` — thống nhất một lib.
- Tôn trọng `prefers-reduced-motion`; không gây layout shift.
- Responsive 375px, dark mode, design token, text tiếng Việt, touch target ≥44px.

### 6. Definition of Done & self-check

- Checklist: lint → type-check → test → build → review 5 trục → cập nhật plan.
- Đối chiếu rules trước khi báo hoàn thành.
- Rủi ro cao (bảo mật, phá API, migration dữ liệu) → dừng, báo cáo, chờ duyệt.
- Không commit/push nếu chưa được yêu cầu.

## Phases

### Phase 0 — Chuẩn bị
- [x] Tạo plan V18.
- [x] Cập nhật `PLAN_INDEX.md`. — main agent đã thêm row 18 + `next_index = 20` (2026-11-04).

### Phase 1 — Viết rules
- [x] Tạo `docs/CODE_RULES.md` với 6 mục trên. — 5 mục: logging, async/await, testing, return contract, DoD (+ phạm vi/ưu tiên).
- [x] Tạo `docs/FRONTEND_RULES.md` với motion pattern + ví dụ MovieCard. — gồm shadcn inventory, motion Pattern A/B, responsive, dark mode, a11y, checklist.
- [x] Thêm ví dụ đúng/sai cho từng rule. — có ví dụ code cho từng mục; nêu vi phạm thật `auth.service.ts`.
- [x] Thêm checklist DoD. — `CODE_RULES.md` §5.5; checklist UI `FRONTEND_RULES.md` §13.

### Phase 2 — Liên kết & đồng bộ
- [x] `AGENTS.md` trỏ tới 2 file rules. — main agent đã thêm (SA-RULES không sửa `AGENTS.md`).
- [x] Ghi rõ xung đột/ưu tiên nếu có với rules cũ. — `CODE_RULES.md` §0; `FRONTEND_RULES.md` §5–6 (motion vs "không thêm lib animation nặng"; `aspect-[6/3]` vs `aspect-[2/3]`).
- [x] Ghi chú follow-up refactor return contract. — `CODE_RULES.md` §4.3 (bảng 9 module).

### Phase 3 — Kiểm tra
- [x] Không mâu thuẫn với `BACKEND_RULES.md`/`FRONTEND_RULES.md`. — rules mới chỉ chi tiết hoá; xung đột được nêu rõ phạm vi/ưu tiên, không nới lỏng rules gốc.
- [x] Không sửa code. — chỉ tạo 2 file docs + cập nhật plan này.
- [x] Báo cáo file đã tạo/sửa. — xem "Báo cáo thực hiện" cuối file.

## Acceptance

- 2 file rules tồn tại, nội dung rõ ràng, có ví dụ.
- `AGENTS.md` dẫn đúng.
- Có bảng module cần refactor.
- Có checklist DoD dùng được ngay.

## Ghi chú cho subagent SA-RULES

- Chỉ tạo/sửa file rules + báo cáo; không sửa code.
- Không sửa `AGENTS.md` (main agent làm).
- Không sửa nội dung `docs/BACKEND_RULES.md` / `docs/FRONTEND_RULES.md`.
- Cập nhật tiến độ vào chính file này.

## Báo cáo thực hiện

### File đã tạo/sửa

| File | Hành động | Nội dung chính |
|---|---|---|
| `docs/CODE_RULES.md` | Tạo mới | Phạm vi/ưu tiên; logging (Logger context, vị trí bắt buộc, cấm secret, correlationId, level); async/await (await I/O, floating promise, `forEach(async)`, `Promise.all`, transaction + publish sau commit, `AppException`); testing (vị trí, mock DI token, envelope, FE/ai-service, coverage 70/60/65, cấm `should be defined`); return contract list (`ResultWithPagination`/`ApiResponseWithPagination`, cấm shape cũ, bảng 9 module); DoD + review 5 trục + điều kiện dừng + self-check |
| `docs/FRONTEND_RULES.md` | Gộp vào (V20) | Rules UI/motion (tạo ở V18 dưới tên `FRONTEND_UI_RULES.md`): ưu tiên/xung đột; shadcn-first + inventory 29 component; motion card (fade + translate/scale + stagger, `motion/react`, `useReducedMotion`, hover elevation, không layout shift, Pattern A/B, fallback CSS); responsive 375px; dark mode/token; a11y; nội dung vi-VN; trạng thái UI; checklist review; bảng hiện trạng/follow-up |
| `docs/plans/V18_docs_code-rules-extension.md` | Cập nhật | Tick phases 1–3, ghi chú Phase 0 chờ main cập nhật `PLAN_INDEX.md`, thêm báo cáo này |
| `AGENTS.md` | Cập nhật (main) | Thêm 2 dòng trỏ `docs/CODE_RULES.md` + `docs/FRONTEND_RULES.md`; mở rộng scope enum `docs`/`testing` |
| `docs/plans/PLAN_INDEX.md` | Cập nhật (main) | Row 17/18/19 + trạng thái + `next_index = 20` |

### Đối chiếu Acceptance

- [x] 2 file rules tồn tại, nội dung rõ ràng, có ví dụ đúng/sai.
- [x] `AGENTS.md` dẫn đúng (main agent đã thêm; SA-RULES không sửa).
- [x] Có bảng module cần refactor (`CODE_RULES.md` §4.3).
- [x] Có checklist DoD dùng được ngay (`CODE_RULES.md` §5.5) + checklist UI (`FRONTEND_RULES.md` §13).
- [x] Không sửa code, không commit/push.

### Rủi ro & follow-up

1. **`motion` chưa được cài** trong `frontend/package.json` (`node_modules/motion` không tồn tại). Rules yêu cầu cài `motion` trước khi implement; nếu dev không duyệt, dùng fallback CSS (`FRONTEND_RULES.md` §6.7). Đây là dependency mới → cần dev duyệt.
2. **Xung đột animation lib**: `FRONTEND_RULES.md` §5 nói không thêm lib animation nặng; rules mới giới hạn `motion` chỉ cho card/list entrance + hover, micro-interaction giữ CSS/`tw-animate-css`. Cần dev xác nhận.
3. **Xung đột tỉ lệ poster**: `movie-card.tsx` dùng `aspect-[6/3]`, `FRONTEND_RULES.md` yêu cầu `aspect-[2/3]`; rules ghi nhận là điểm cần dev chốt, chưa sửa.
4. **Vi phạm bảo mật đã biết**: `auth.service.ts` log refresh token (`this.logger.log('[Refresh Token]', refreshToken)` và `[Session Token]`). Rules nêu là ví dụ SAI; **chưa sửa code** theo phạm vi V18 → cần plan backend riêng. — **đã sửa ở V19** (2026-11-04): thay bằng `logger.warn` chỉ có `sessionId`, có test khoá lại.
5. **CorrelationId chưa hoạt động**: `CorrelationIdInterceptor` có nhưng chưa mount global trong `main.ts`; `ClsModule` đã có. Rules ghi là follow-up, không tự sửa.
6. **Return contract**: 9 module còn shape legacy (`PaginatedResult`/`{data,total,...}`/trả repository trực tiếp). Refactor là follow-up riêng, chưa làm trong V18.
7. **Frontend chưa có test & thiếu devDeps** (`@testing-library/react`, `jsdom`, `msw`); `vitest.config.ts` đang `passWithNoTests: true` → dễ tạo cảm giác "xanh" giả. Đã ghi trong `CODE_RULES.md` §3.4 và thuộc phạm vi V19. — **đã xử lý ở V19**: 28 file / 232 test, bỏ `passWithNoTests`, threshold 60.
8. ~~**`PLAN_INDEX.md` chưa cập nhật** cho V18~~ → **đã xử lý** (2026-11-04): `PLAN_INDEX.md` có row 18, trạng thái ✅.

### Chốt plan (2026-11-04)

- Toàn bộ Phase 0–3 đã tick; 2 file rules tồn tại và đã được `AGENTS.md` dẫn.
- Các mục 1–7 ở trên là **follow-up thuộc plan khác**, không chặn việc đóng V18:
  - mục 1–3 → task frontend (motion + tỉ lệ poster) khi dev duyệt dependency.
  - mục 4–5 → task backend (bảo mật log + correlationId).
  - mục 6 → task backend refactor return contract.
  - mục 7 → **V19** (đang thực hiện).
