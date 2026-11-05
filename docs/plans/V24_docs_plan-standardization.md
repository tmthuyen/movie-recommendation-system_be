# V24 — Chuẩn hoá tên file plan, heading và PLAN_INDEX

## Thông tin chung

| Hạng mục | Nội dung |
|---|---|
| Trạng thái | ✅ Hoàn thành (2026-11-05) |
| Người thực hiện | AI Agent (main) |
| Thời gian | 2026-11-05 |
| Scope | `docs` |
| Nhánh | `ci-cd` |
| Module liên quan | `docs/plans/*.md`, `docs/plans/PLAN_INDEX.md`, `docs/ProjectOverview.md` |
| Không sửa | Nội dung nghiệp vụ trong plan cũ; `docs/BACKEND_RULES.md` |

## Bối cảnh

`docs/plans/` có nhiều tên file không theo format `V{index}_{scope}_{task_name}.md`:

- Thiếu scope: `V5-realtime-interactions.md`, `V6-message-queue.md`, `V7-ai-service-architecture.md`.
- Sai/lệch slug: `V8_ai-collaborating.md` (thiếu `_` phân tách scope/task), `V16_realtime_interation.md` (thiếu "c"), `V10_ai-service_cf_model_report.md`.
- Scope chưa đúng: `V9_copilot-instructions.md` (docs), `V12_backend_docs-api-update.md` (docs).
- Ba plan `V1/V3/V4` cùng task name `backend-plan`; heading không thống nhất (`# Kế hoạch phát triển...`, `# Phase V4...`, `# V1 - ...`).
- Thiếu `V0`, `V2` (file lịch sử không tồn tại).

Developer đã xác nhận **chuẩn hoá plan** (2026-11-05).

## Quyết định

- **Giữ nguyên index lịch sử** (1, 3, 4, 5...) để không phá vỡ tham chiếu và lịch sử Git; chỉ chuẩn hoá tên file/heading.
- Ghi rõ trong `PLAN_INDEX.md` rằng `V0`, `V2` là khoảng trống lịch sử, không tạo file giả.
- Nếu sau này developer muốn đánh số lại liên tục 0..N, thực hiện như một migration riêng (rename toàn bộ + cập nhật mọi tham chiếu).

## Mapping rename

| Hiện tại | Sau chuẩn hoá | Scope | Ghi chú |
|---|---|---|---|
| `V1_backend-plan.md` | `V1_backend_development-plan.md` | backend | Plan tổng backend |
| `V3_backend-plan.md` | `V3_backend_auth-rbac-security.md` | backend | Auth/User/RBAC |
| `V4_backend-plan.md` | `V4_backend_core-domain-apis.md` | backend | Core domain APIs |
| `V5-realtime-interactions.md` | `V5_backend_realtime-interactions.md` | backend | Thêm scope |
| `V6-message-queue.md` | `V6_backend_message-queue.md` | backend | Thêm scope |
| `V7-ai-service-architecture.md` | `V7_ai_service-architecture.md` | ai | Chuẩn scope `ai` |
| `V8_ai-collaborating.md` | `V8_ai_collaborating.md` | ai | Thêm `_` phân tách scope/task |
| `V9_copilot-instructions.md` | `V9_docs_copilot-instructions.md` | docs | Hướng dẫn repo |
| `V10_ai-service_cf_model_report.md` | `V10_ai_cf-model-report.md` | ai | Bỏ slug `ai-service` |
| `V12_backend_docs-api-update.md` | `V12_docs_docs-api-update.md` | docs | Cập nhật tài liệu |
| `V16_realtime_interation.md` | `V16_backend_realtime-interaction-band5.md` | backend | Sửa typo + scope |

Các file `V11`, `V13`–`V15`, `V17`–`V23` đã đúng format, giữ nguyên.

## Phases

### Phase 0 — Chuẩn bị
- [x] Tạo plan V24 + thêm V22/V23/V24 vào `PLAN_INDEX.md`, `next_index = 25`.

### Phase 1 — Rename file
- [x] `git mv` 11 file theo bảng mapping.
- [x] Cập nhật heading từng file về `# V{index} — <mô tả>` (giữ nội dung).
- [x] Sửa các tham chiếu nội bộ: `V16` (pointer V5), `docs/ProjectOverview.md` (V1), `V11`/`V13` nếu có.

### Phase 2 — PLAN_INDEX
- [x] Cập nhật bảng mapping: file mới, scope, task_name, ghi chú.
- [x] Ghi rõ V0/V2 là khoảng trống lịch sử; giải thích quyết định giữ index.
- [x] `next_index = 25`.

### Phase 3 — Kiểm tra
- [x] `grep` toàn repo: không còn tham chiếu sống tới tên file cũ.
- [x] Mọi file trong `docs/plans/` khớp `^V\d+_(backend|frontend|cicd|ai|docs|testing)_[a-z0-9-]+\.md$`.
- [x] Heading khớp `# V{index} — ...`.
- [x] `PLAN_INDEX.md` UTF-8, đọc được, max(index) = 24.
- [x] Không sửa code; không commit.

## Acceptance

- [x] 100% file plan (trừ `PLAN_INDEX.md`) đúng format tên.
- [x] `PLAN_INDEX.md` là nguồn duy nhất tra cứu index; `next_index` đúng.
- [x] Không còn link chết do rename.
- [x] Lịch sử index được bảo toàn; gap V0/V2 được ghi chú rõ.

## Kết quả thực hiện

- **11 file** đã rename (bảng mapping ở trên), gồm cả `V8_ai-collaborating.md` → `V8_ai_collaborating.md` (thiếu `_` phân tách scope/task — phát hiện khi verify cuối).
- Heading toàn bộ 23 file plan (trừ `PLAN_INDEX.md`) đã chuẩn hoá về `# V{index} — ...`.
- Verify tự động (script Node đọc `docs/plans/`):
  - `23` file plan;
  - `bad names: none`;
  - `bad headings: none`.
- Tham chiếu tên cũ còn lại chỉ nằm trong:
  - `V24` (bảng mapping — chủ đích);
  - `V16` (ghi chú "tên cũ đã chuẩn hoá" — chủ đích).
- `PLAN_INDEX.md`: `max(index) = 24`, `next_index = 25`.
- Không commit/push.
