# V28 — Đồng bộ test backend NestJS với hành vi hiện tại

## 0. Thông tin chung

| Hạng mục | Nội dung |
|---|---|
| **Trạng thái** | ✅ Hoàn thành 2026-11-12 |
| **Người thực hiện** | AI Agent |
| **Thời gian** | 2026-11-12 16:45 |
| **Scope** | `backend` |
| **Module liên quan** | `modules/comments`, `modules/movies`, `modules/recommendations`, `infrastructure/messaging` (chỉ file `*.spec.ts`) |
| **Không sửa** | Production code, `docs/BACKEND_RULES.md`, `docs/FRONTEND_RULES.md`, `ai-service` |
| **Ngoài phạm vi** | Thay đổi contract API, sửa logic score/publish, cập nhật tài liệu mô tả service |

## 1. Mục tiêu

1. Rà soát các test backend đang fail do kỳ vọng cũ, không còn khớp hành vi production hiện tại.
2. Cập nhật assertion/test setup theo code hiện tại, không nới lỏng test để che lỗi.
3. Đảm bảo toàn bộ test backend chạy xanh, không còn crash do test gọi sai signature controller.
4. Không thay đổi production code nếu không phát hiện lỗi thực sự.

## 2. Phạm vi fail đã xác định

| File test | Nguyên nhân |
|---|---|
| `src/modules/comments/comments.service.spec.ts` | Kỳ vọng score band 4; code hiện tại dùng score `0` cho comment (implicit feedback) và publish event `score: null`. |
| `src/modules/movies/movies.service.spec.ts` | Kỳ vọng publish event `score: 1` và không publish khi xem lại; code hiện tại publish mọi click với `score: null`. |
| `src/infrastructure/messaging/event-publisher.service.spec.ts` | Kỳ vọng options chỉ có `persistent`; code hiện tại thêm `headers` cho OpenTelemetry propagation. |
| `src/modules/recommendations/recommendations.controller.spec.ts` | Test gọi `hybridSearch` theo signature cũ; controller hiện tại là `GET /for-you`, nhận `req.user.sub` + Bearer token. |

## 3. Phases & checklist

### Phase 1 — Tái hiện & phân loại

- [x] Chạy `npm test -- --runInBand`, ghi nhận danh sách fail.
- [x] Đối chiếu production code và git diff để xác định test cũ hay code sai.
- [x] Chốt: các fail thuộc test stale, không phải lỗi production.

### Phase 2 — Cập nhật test

- [x] `comments.service.spec.ts`: score comment `0`, event `score: null`, bổ sung stats broadcast.
- [x] `movies.service.spec.ts`: event click `score: null`, xem lại vẫn publish event.
- [x] `event-publisher.service.spec.ts`: options có `headers` rỗng khi không có trace context; await `publish()`.
- [x] `recommendations.controller.spec.ts`: cập nhật test `/for-you` với `req.user.sub` + Bearer token.

### Phase 3 — Verify

- [x] Chạy targeted test cho 4 file đã sửa — `46/46` pass.
- [x] Chạy full backend test — `385/385` pass, `48/48` suite.
- [x] Chạy `npm run type-check` — pass.
- [x] Chạy `eslint` cho 4 file test đã sửa — `0 error` (còn warning unsafe member access có sẵn).
- [x] Chạy `prettier --check` cho 4 file test — pass.

### Phase 4 — Đóng plan

- [x] Cập nhật trạng thái plan và `docs/plans/PLAN_INDEX.md`.

## 4. Ghi chú

- Các thay đổi production liên quan đã có trong working tree (await publish, thêm trace headers) và không thuộc phạm vi sửa của plan này.
- Không commit/push khi chưa có yêu cầu.
