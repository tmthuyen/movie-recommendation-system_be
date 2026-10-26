# PLAN_INDEX.md

B?ng theo dõi danh sách plan trong `docs/plans/`. Dùng d? xác d?nh `index` tu?n t? và `next_index = max(index)+1`.

## Quy t?c
- Ð?nh d?ng file: `V{index}_{scope}_{task_name}.md`
- `scope` ? `backend` | `frontend` | `cicd` | `ai`
- `index` là s? nguyên liên t?c, b?t d?u t? 0
- Khi thêm plan m?i: gán `index = next_index`, c?p nh?t b?ng này
- Khi d?i tên plan: ch? d?i tên sau khi có xác nh?n t? ngu?i dùng, d?ng b? v?i b?ng này
- `task_name` d?ng slug (lowercase, dùng `-` thay kho?ng tr?ng)

## B?ng mapping hi?n t?i

| index | file | scope | task_name | mô t? | ghi chú |
|---|------|-------|-----------|-------|---------|
| 0 | V0_init-plan.md | ? | init-plan | Init plan | C?n xác d?nh scope chính xác (vd. `backend`/khác tùy ng? c?nh) |
| 1 | V1_backend-plan.md | backend | backend-plan | Backend plan | |
| 2 | V2_retrieval-target-validation.md | backend | retrieval-target-validation | Retrieval target validation | Ðu?c d? xu?t rename t? V1_retrieval_target_validation.md |
| 3 | V3_retrieval-api.md | backend | retrieval-api | Retrieval API | Ðu?c d? xu?t rename t? V2_retrieval_api.md |
| 4 | V4_backend-plan.md | backend | backend-plan | Backend plan | |
| 5 | V5-realtime-interactions.md | backend | realtime-interactions | Realtime interactions | C?n chu?n hoá: thêm scope prefix? hi?n tên thi?u scope; d? xu?t V5_backend_realtime-interactions.md |
| 6 | V6-message-queue.md | backend | message-queue | Message queue | Ð? xu?t V6_backend_message-queue.md |
| 7 | V7-ai-service-architecture.md | ai | ai-service-architecture | AI service architecture | Tên có `ai-service` trong slug; scope chu?n hoá `ai`. Ð? xu?t V7_ai_ai-service-architecture.md ho?c V7_ai_architecture.md? gi? slug ph?n còn l?i |
| 8 | V8_ai-collaborating.md | ai | ai-collaborating | AI collaborating | Ð? xu?t V8_ai_ai-collaborating.md |
| 9 | V9_copilot-instructions.md | frontend | copilot-instructions | Copilot instructions | Scope có th? là frontend? ho?c docs? hi?n t?i gi? nguyên mapping; c?n xác nh?n |
| 10 | V10_ai-service_cf_model_report.md | ai | ai-service-cf-model-report | AI service CF model report | Ð? xu?t V10_ai_ai-service-cf-model-report.md |
| 11 | V11_frontend_ui-roadmap.md | frontend | ui-roadmap | Frontend UI roadmap | |
| 12 | V12_backend_docs-api-update.md | frontend | docs-api-update | Backend docs API update | Luu ý: file là backend docs update nhung scope trong tên là backend - OK. Ki?m tra l?i n?i dung n?u c?n |
| 13 | V13_frontend_ui-reuse.md | frontend | ui-reuse | Frontend UI reuse | |
| 14 | V14_cicd_ci-cd-setup-fix-workflows.md | cicd | ci-cd-setup-fix-workflows | MovieApp: S?a & hoàn thi?n CI/CD (workflows xanh, CD placeholder) | |
| 15 | V15_frontend_preference-onboarding-popup.md | frontend | preference-onboarding-popup | Preference onboarding popup (cold-start user) | Cold-start: prompt user add genre preferences if missing |
| 16 | V16_realtime_interation.md | backend | realtime-interaction-band5 | Realtime interactions end-to-end + score band 5 (d? tin c?y) | B? dislike/favorite/watchlist; rating/comment/click publish RabbitMQ; score = confidence band 5 |

## Ð? xu?t rename (c?n xác nh?n t? ngu?i dùng)
Do "sai s? th? t?" (V1 trùng l?p v? m?t ng? nghia trong yêu c?u: có V1_legalai_ci-cd-split-workflows.md du?c t?o sau?), các file sau c?n du?c di?u ch?nh tên d? kh?p d?nh d?ng `V{index}_{scope}_{task_name}.md` và d?m b?o index liên t?c:

1. **V1_legalai_ci-cd-split-workflows.md** (tìm th?y trong ng? c?nh yêu c?u) ? **V1_cicd_ci-cd-split-workflows.md** (gán index 1 cho CICD). Tuy nhiên, hi?n t?i `docs/plans/` dã có `V1_backend-plan.md` t?i index 1. C?n **s?p x?p l?i toàn b?** theo trình t? h?p lý.

2. **V1_retrieval_target_validation.md** ? **V2_backend_retrieval-target-validation.md** (theo d? xu?t ? trên)
3. **V2_retrieval_api.md** ? **V3_backend_retrieval-api.md**
4. **V5-realtime-interactions.md** ? **V5_backend_realtime-interactions.md** (thêm scope)
5. **V6-message-queue.md** ? **V6_backend_message-queue.md**
6. **V7-ai-service-architecture.md** ? **V7_ai_ai-service-architecture.md** (chu?n hoá scope ai; gi? slug rõ ràng)
7. **V8_ai-collaborating.md** ? **V8_ai_ai-collaborating.md**
8. **V10_ai-service_cf_model_report.md** ? **V10_ai_ai-service-cf-model-report.md**

**Luu ý quan tr?ng:** Hi?n t?i có s? mâu thu?n v? index 1 (V1_backend-plan.md dã t?n t?i). Theo yêu c?u user: "V1_legalai_ci-cd-split-workflows.md (scope cicd? ci-cd split ? cicd)". Vì v?y, d? xu?t **renumber toàn b?** theo th? t? logic: V0, V1(cicd), V2(backend retrieval validation), V3(backend retrieval api), r?i ti?p theo các plan khác du?c s?p x?p l?i m?t cách tu?n t? và nh?t quán.

**Cách tính next_index:** `max(index) = 16` ? `next_index = 17`

## next_index
`17`

## Cách xác d?nh index khi t?o plan m?i
1. Ð?c `docs/plans/PLAN_INDEX.md` ? l?y `next_index`
2. Gán file m?i `V{next_index}_{scope}_{task_name}.md`
3. C?p nh?t b?ng mapping trong PLAN_INDEX.md (thêm dòng m?i)
4. C?p nh?t `next_index = next_index + 1`
