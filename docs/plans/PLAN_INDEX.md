# PLAN_INDEX.md

Bảng theo dõi danh sách plan trong `docs/plans/`. Dùng để xác định `index` tuần tự và `next_index = max(index)+1`.

## Quy tắc
- Định dạng file: `V{index}_{scope}_{task_name}.md`
- `scope` ∈ `backend` | `frontend` | `cicd` | `ai`
- `index` là số nguyên liên tục, bắt đầu từ 0
- Khi thêm plan mới: gán `index = next_index`, cập nhật bảng này
- Khi đổi tên plan: chỉ đổi tên sau khi có xác nhận từ người dùng, đồng bộ với bảng này
- `task_name` dạng slug (lowercase, dùng `-` thay khoảng trắng)

## Bảng mapping hiện tại

| index | file | scope | task_name | mô tả | ghi chú |
|---|------|-------|-----------|-------|---------|
| 0 | V0_init-plan.md | ? | init-plan | Init plan | Cần xác định scope chính xác (vd. `backend`/khác tùy ngữ cảnh) |
| 1 | V1_backend-plan.md | backend | backend-plan | Backend plan | |
| 2 | V2_retrieval-target-validation.md | backend | retrieval-target-validation | Retrieval target validation | Được đề xuất rename từ V1_retrieval_target_validation.md |
| 3 | V3_retrieval-api.md | backend | retrieval-api | Retrieval API | Được đề xuất rename từ V2_retrieval_api.md |
| 4 | V4_backend-plan.md | backend | backend-plan | Backend plan | |
| 5 | V5-realtime-interactions.md | backend | realtime-interactions | Realtime interactions | Cần chuẩn hoá: thêm scope prefix? hiện tên thiếu scope; đề xuất V5_backend_realtime-interactions.md |
| 6 | V6-message-queue.md | backend | message-queue | Message queue | Đề xuất V6_backend_message-queue.md |
| 7 | V7-ai-service-architecture.md | ai | ai-service-architecture | AI service architecture | Tên có `ai-service` trong slug; scope chuẩn hoá `ai`. Đề xuất V7_ai_ai-service-architecture.md hoặc V7_ai_architecture.md? giữ slug phần còn lại |
| 8 | V8_ai-collaborating.md | ai | ai-collaborating | AI collaborating | Đề xuất V8_ai_ai-collaborating.md |
| 9 | V9_copilot-instructions.md | frontend | copilot-instructions | Copilot instructions | Scope có thể là frontend? hoặc docs? hiện tại giữ nguyên mapping; cần xác nhận |
| 10 | V10_ai-service_cf_model_report.md | ai | ai-service-cf-model-report | AI service CF model report | Đề xuất V10_ai_ai-service-cf-model-report.md |
| 11 | V11_frontend_ui-roadmap.md | frontend | ui-roadmap | Frontend UI roadmap | |
| 12 | V12_backend_docs-api-update.md | frontend | docs-api-update | Backend docs API update | Lưu ý: file là backend docs update nhưng scope trong tên là backend - OK. Kiểm tra lại nội dung nếu cần |
| 13 | V13_frontend_ui-reuse.md | frontend | ui-reuse | Frontend UI reuse | |
| 14 | V14_cicd_ci-cd-setup-fix-workflows.md | cicd | ci-cd-setup-fix-workflows | MovieApp: Sửa & hoàn thiện CI/CD (workflows xanh, CD placeholder) | |

## Đề xuất rename (cần xác nhận từ người dùng)
Do "sai số thứ tự" (V1 trùng lặp về mặt ngữ nghĩa trong yêu cầu: có V1_legalai_ci-cd-split-workflows.md được tạo sau?), các file sau cần được điều chỉnh tên để khớp định dạng `V{index}_{scope}_{task_name}.md` và đảm bảo index liên tục:

1. **V1_legalai_ci-cd-split-workflows.md** (tìm thấy trong ngữ cảnh yêu cầu) → **V1_cicd_ci-cd-split-workflows.md** (gán index 1 cho CICD). Tuy nhiên, hiện tại `docs/plans/` đã có `V1_backend-plan.md` tại index 1. Cần **sắp xếp lại toàn bộ** theo trình tự hợp lý.

2. **V1_retrieval_target_validation.md** → **V2_backend_retrieval-target-validation.md** (theo đề xuất ở trên)
3. **V2_retrieval_api.md** → **V3_backend_retrieval-api.md**
4. **V5-realtime-interactions.md** → **V5_backend_realtime-interactions.md** (thêm scope)
5. **V6-message-queue.md** → **V6_backend_message-queue.md**
6. **V7-ai-service-architecture.md** → **V7_ai_ai-service-architecture.md** (chuẩn hoá scope ai; giữ slug rõ ràng)
7. **V8_ai-collaborating.md** → **V8_ai_ai-collaborating.md**
8. **V10_ai-service_cf_model_report.md** → **V10_ai_ai-service-cf-model-report.md**

**Lưu ý quan trọng:** Hiện tại có sự mâu thuẫn về index 1 (V1_backend-plan.md đã tồn tại). Theo yêu cầu user: "V1_legalai_ci-cd-split-workflows.md (scope cicd? ci-cd split → cicd)". Vì vậy, đề xuất **renumber toàn bộ** theo thứ tự logic: V0, V1(cicd), V2(backend retrieval validation), V3(backend retrieval api), rồi tiếp theo các plan khác được sắp xếp lại một cách tuần tự và nhất quán.

**Cách tính next_index:** `max(index) = 14` → `next_index = 15`

## next_index
`15`

## Cách xác định index khi tạo plan mới
1. Đọc `docs/plans/PLAN_INDEX.md` → lấy `next_index`
2. Gán file mới `V{next_index}_{scope}_{task_name}.md`
3. Cập nhật bảng mapping trong PLAN_INDEX.md (thêm dòng mới)
4. Cập nhật `next_index = next_index + 1`
