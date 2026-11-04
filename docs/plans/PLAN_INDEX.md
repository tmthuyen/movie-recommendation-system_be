# PLAN_INDEX.md

Bảng theo dõi danh sách plan trong `docs/plans/`. Dùng để xác định `index` tuần tự và `next_index = max(index)+1`.

## Quy tắc

- Định dạng file: `V{index}_{scope}_{task_name}.md`
- `scope` ∈ `backend` | `frontend` | `cicd` | `ai` | `docs` | `testing`
  - `docs`: cập nhật tài liệu, rules, hướng dẫn.
  - `testing`: chương trình test, hạ tầng test, coverage.
  - Các plan cũ có thể dùng `ai-service` trong slug nhưng scope chuẩn hoá thành `ai`.
- `index` là số nguyên liên tục, bắt đầu từ 0.
- Khi thêm plan mới: gán `index = next_index`, cập nhật bảng này.
- Khi đổi tên plan: chỉ đổi sau khi có xác nhận từ người dùng, đồng bộ với bảng này.
- `task_name` dùng slug (lowercase, dùng `-` thay khoảng trắng).
- Mỗi plan phải có: trạng thái, người thực hiện & thời gian, phạm vi, phases có checklist.

## Bảng mapping hiện tại

| index | file | scope | task_name | mô tả | ghi chú |
|---|------|-------|-----------|-------|---------|
| 1 | V1_backend-plan.md | backend | backend-plan | Backend plan (NestJS) | Legacy; không có V0 |
| 3 | V3_backend-plan.md | backend | backend-plan | Auth, User, RBAC & Security | Legacy; thiếu V2 |
| 4 | V4_backend-plan.md | backend | backend-plan | Core Domain APIs & User Interactions | Legacy |
| 5 | V5-realtime-interactions.md | backend | realtime-interactions | Realtime Interactions & User Activity | Tên thiếu scope prefix |
| 6 | V6-message-queue.md | backend | message-queue | RabbitMQ Messaging Architecture | Tên thiếu scope prefix |
| 7 | V7-ai-service-architecture.md | ai | ai-service-architecture | AI-Service Architecture | Legacy slug `ai-service` |
| 8 | V8_ai-collaborating.md | ai | ai-collaborating | Collaborative + Content-based hybrid | |
| 9 | V9_copilot-instructions.md | frontend | copilot-instructions | Hướng dẫn Copilot cho repository | Scope có thể là `docs`; giữ legacy |
| 10 | V10_ai-service_cf_model_report.md | ai | ai-service-cf-model-report | Báo cáo mô hình CF | Legacy slug `ai-service` |
| 11 | V11_frontend_ui-roadmap.md | frontend | ui-roadmap | Frontend UI roadmap | Phase 4 từng bị chặn bởi ai-service 500/CORS |
| 12 | V12_backend_docs-api-update.md | backend | docs-api-update | Backend Docs & AGENTS.md cập nhật | Trạng thái hoàn thành |
| 13 | V13_frontend_ui-reuse.md | frontend | ui-reuse | Tối ưu quản lý UI & tái sử dụng component | Phase 1-2 xong |
| 14 | V14_cicd_ci-cd-setup-fix-workflows.md | cicd | ci-cd-setup-fix-workflows | Sửa & hoàn thiện CI/CD (workflows xanh, CD placeholder) | Đã commit |
| 15 | V15_frontend_preference-onboarding-popup.md | frontend | preference-onboarding-popup | Preference onboarding popup (cold-start user) | Code đã có; cần chuyển trạng thái hoàn thành |
| 16 | V16_realtime_interation.md | backend | realtime-interaction-band5 | Realtime interactions end-to-end + score band 5 | Tên file lệch slug `interation`; giữ nguyên chờ xác nhận rename |
| 17 | V17_docs_docs-plan-sync.md | docs | docs-plan-sync | Đồng bộ docs & plans với code hiện tại | ✅ Hoàn thành 2026-11-04 |
| 18 | V18_docs_code-rules-extension.md | docs | code-rules-extension | Bổ sung rules: logging, async/await, testing, return contract, UI motion, DoD | ✅ Hoàn thành 2026-11-04 |
| 19 | V19_testing_unit-test-program.md | testing | unit-test-program | Unit Test cho backend, frontend, ai-service | ✅ Hoàn thành 2026-11-04 (BE 328 test/72.29%, FE 232 test/68.05%, AI 270 test/66%) |
| 20 | V20_docs_frontend-rules-merge.md | docs | frontend-rules-merge | Gộp 2 file rules frontend thành 1 (`FRONTEND_RULES.md`) | ✅ Hoàn thành 2026-11-04 (xoá `FRONTEND_UI_RULES.md`) |
| 21 | V21_testing_ai-service-test-structure.md | testing | ai-service-test-structure | Tái cấu trúc test ai-service theo module/file/def + chạy được trong venv | ✅ Hoàn thành 2026-11-04 (32/32 module có test, 659 test, coverage 94%) |

## Ghi chú legacy

- Thiếu file `V0` và `V2`; các index `1`, `3`, `4` cùng tên `backend-plan`.
- Chưa rename vì `AGENTS.md` yêu cầu chỉ rename sau khi có xác nhận từ người dùng.
- `PLAN_INDEX.md` cũ bị lỗi encoding (trộn ANSI/UTF-8). File này đã được viết lại UTF-8 ngày 2026-11-04.
- Một số plan cũ (`V10`, `V11`, `V14`, `V15`, `V16`) cũng đang bị lỗi encoding; V17 sẽ chuẩn hoá dần khi cập nhật nội dung.

## Cách tính next_index

`max(index) = 21` → `next_index = 22`

## next_index

`22`

## Cách xác định index khi tạo plan mới

1. Đọc `docs/plans/PLAN_INDEX.md` → lấy `next_index`.
2. Gán file mới `V{next_index}_{scope}_{task_name}.md`.
3. Cập nhật bảng mapping trong `PLAN_INDEX.md` (thêm dòng mới).
4. Cập nhật `next_index = next_index + 1`.
