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
| 1 | V1_backend_development-plan.md | backend | development-plan | Backend plan (NestJS) | Chuẩn hoá tên ở V24; không có V0 |
| 3 | V3_backend_auth-rbac-security.md | backend | auth-rbac-security | Auth, User, RBAC & Security | Chuẩn hoá tên ở V24; thiếu V2 |
| 4 | V4_backend_core-domain-apis.md | backend | core-domain-apis | Core Domain APIs & User Interactions | Chuẩn hoá tên ở V24 |
| 5 | V5_backend_realtime-interactions.md | backend | realtime-interactions | Realtime Interactions & User Activity | Chuẩn hoá tên ở V24 |
| 6 | V6_backend_message-queue.md | backend | message-queue | RabbitMQ Messaging Architecture | Chuẩn hoá tên ở V24 |
| 7 | V7_ai_service-architecture.md | ai | service-architecture | AI-Service Architecture | Chuẩn hoá tên ở V24 |
| 8 | V8_ai_collaborating.md | ai | collaborating | Collaborative + Content-based hybrid | Chuẩn hoá tên ở V24 |
| 9 | V9_docs_copilot-instructions.md | docs | copilot-instructions | Hướng dẫn Copilot cho repository | Chuẩn hoá tên/scope ở V24 |
| 10 | V10_ai_cf-model-report.md | ai | cf-model-report | Báo cáo mô hình CF | Chuẩn hoá tên ở V24 |
| 11 | V11_frontend_ui-roadmap.md | frontend | ui-roadmap | Frontend UI roadmap | Phase 4 từng bị chặn bởi ai-service 500/CORS |
| 12 | V12_docs_docs-api-update.md | docs | docs-api-update | Backend Docs & AGENTS.md cập nhật | Chuẩn hoá tên/scope ở V24 |
| 13 | V13_frontend_ui-reuse.md | frontend | ui-reuse | Tối ưu quản lý UI & tái sử dụng component | Phase 1-2 xong |
| 14 | V14_cicd_ci-cd-setup-fix-workflows.md | cicd | ci-cd-setup-fix-workflows | Sửa & hoàn thiện CI/CD (workflows xanh, CD placeholder) | Đã commit |
| 15 | V15_frontend_preference-onboarding-popup.md | frontend | preference-onboarding-popup | Preference onboarding popup (cold-start user) | ✅ Hoàn thành |
| 16 | V16_backend_realtime-interaction-band5.md | backend | realtime-interaction-band5 | Realtime interactions end-to-end + score band 5 | Chuẩn hoá tên ở V24 |
| 17 | V17_docs_docs-plan-sync.md | docs | docs-plan-sync | Đồng bộ docs & plans với code hiện tại | ✅ Hoàn thành 2026-11-04 |
| 18 | V18_docs_code-rules-extension.md | docs | code-rules-extension | Bổ sung rules: logging, async/await, testing, return contract, UI motion, DoD | ✅ Hoàn thành 2026-11-04 |
| 19 | V19_testing_unit-test-program.md | testing | unit-test-program | Unit Test cho backend, frontend, ai-service | ✅ Hoàn thành 2026-11-04 (BE 328 test/72.29%, FE 232 test/68.05%, AI 270 test/66%) |
| 20 | V20_docs_frontend-rules-merge.md | docs | frontend-rules-merge | Gộp 2 file rules frontend thành 1 (`FRONTEND_RULES.md`) | ✅ Hoàn thành 2026-11-04 (xoá `FRONTEND_UI_RULES.md`) |
| 21 | V21_testing_ai-service-test-structure.md | testing | ai-service-test-structure | Tái cấu trúc test ai-service theo module/file/def + chạy được trong venv | ✅ Hoàn thành 2026-11-04 (32/32 module có test, 659 test, coverage 94%) |
| 22 | V22_backend_email-role-error-fixes.md | backend | email-role-error-fixes | Sửa email boolean + RoleService trả 404 | ✅ Hoàn thành 2026-11-05 |
| 23 | V23_frontend_motion-system.md | frontend | motion-system | Motion system dùng chung cho card/component/trang | ✅ Hoàn thành 2026-11-05 |
| 24 | V24_docs_plan-standardization.md | docs | plan-standardization | Chuẩn hoá tên file plan, heading và PLAN_INDEX | ✅ Hoàn thành 2026-11-05 |
| 25 | V25_backend_cache-layer.md | backend | cache-layer | Cache Redis: movie/genre/country/interaction/recommendation | 🟡 Đang triển khai; load-more (cursor) tách sang V27 |
| 26 | V26_frontend_movie-search-filter.md | frontend | movie-search-filter | Search + filter phim từ DB, URL sync, UI responsive/modern | ✅ Hoàn thành 2026-11-07 (slider năm + toolbar grid; draft + nút "Áp dụng" — không auto-call API; QA responsive thủ công) |
| 27 | V27_backend_similar-load-more.md | backend | similar-load-more | Cursor API load-more phim tương tự + frontend infinite scroll (API-first) | 🟡 Backend + frontend P6–P10 đã implement/verify; smoke runtime pending |
| 28 | V28_backend_stale-tests-sync.md | backend | stale-tests-sync | Đồng bộ test backend NestJS với hành vi hiện tại | ✅ Hoàn thành 2026-11-12 |
| 29 | V29_testing_ai-service-fix-failing-tests.md | testing | ai-service-fix-failing-tests | Sửa test AI-service fail do lệch API hiện tại | ✅ Hoàn thành 2026-11-12 (554 passed) |

## Ghi chú legacy

- `V0` và `V2` là khoảng trống lịch sử (file không tồn tại); **không tạo file giả**.
- Đã chuẩn hoá tên file/heading ở V24 (2026-11-05) nhưng **giữ nguyên index lịch sử** để không phá vỡ tham chiếu/Git history.
- Nếu cần index liên tục 0..N, thực hiện migration rename toàn bộ riêng (cần xác nhận lại).
- `PLAN_INDEX.md` giữ UTF-8; một số plan cũ có thể còn lỗi encoding ở nội dung, sẽ xử lý khi có yêu cầu riêng.

## Cách tính next_index

`max(index) = 29` → `next_index = 30`

## next_index

`30`

## Cách xác định index khi tạo plan mới

1. Đọc `docs/plans/PLAN_INDEX.md` → lấy `next_index`.
2. Gán file mới `V{next_index}_{scope}_{task_name}.md`.
3. Cập nhật bảng mapping trong `PLAN_INDEX.md` (thêm dòng mới).
4. Cập nhật `next_index = next_index + 1`.
