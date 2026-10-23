# PLAN_INDEX.md

Báº£ng theo dÃµi danh sÃ¡ch plan trong `docs/plans/`. DÃ¹ng Ä‘á»ƒ xÃ¡c Ä‘á»‹nh `index` tuáº§n tá»± vÃ  `next_index = max(index)+1`.

## Quy táº¯c
- Äá»‹nh dáº¡ng file: `V{index}_{scope}_{task_name}.md`
- `scope` âˆˆ `backend` | `frontend` | `cicd` | `ai`
- `index` lÃ  sá»‘ nguyÃªn liÃªn tá»¥c, báº¯t Ä‘áº§u tá»« 0
- Khi thÃªm plan má»›i: gÃ¡n `index = next_index`, cáº­p nháº­t báº£ng nÃ y
- Khi Ä‘á»•i tÃªn plan: chá»‰ Ä‘á»•i tÃªn sau khi cÃ³ xÃ¡c nháº­n tá»« ngÆ°á»i dÃ¹ng, Ä‘á»“ng bá»™ vá»›i báº£ng nÃ y
- `task_name` dáº¡ng slug (lowercase, dÃ¹ng `-` thay khoáº£ng tráº¯ng)

## Báº£ng mapping hiá»‡n táº¡i

| index | file | scope | task_name | mÃ´ táº£ | ghi chÃº |
|---|------|-------|-----------|-------|---------|
| 0 | V0_init-plan.md | ? | init-plan | Init plan | Cáº§n xÃ¡c Ä‘á»‹nh scope chÃ­nh xÃ¡c (vd. `backend`/khÃ¡c tÃ¹y ngá»¯ cáº£nh) |
| 1 | V1_backend-plan.md | backend | backend-plan | Backend plan | |
| 2 | V2_retrieval-target-validation.md | backend | retrieval-target-validation | Retrieval target validation | ÄÆ°á»£c Ä‘á» xuáº¥t rename tá»« V1_retrieval_target_validation.md |
| 3 | V3_retrieval-api.md | backend | retrieval-api | Retrieval API | ÄÆ°á»£c Ä‘á» xuáº¥t rename tá»« V2_retrieval_api.md |
| 4 | V4_backend-plan.md | backend | backend-plan | Backend plan | |
| 5 | V5-realtime-interactions.md | backend | realtime-interactions | Realtime interactions | Cáº§n chuáº©n hoÃ¡: thÃªm scope prefix? hiá»‡n tÃªn thiáº¿u scope; Ä‘á» xuáº¥t V5_backend_realtime-interactions.md |
| 6 | V6-message-queue.md | backend | message-queue | Message queue | Äá» xuáº¥t V6_backend_message-queue.md |
| 7 | V7-ai-service-architecture.md | ai | ai-service-architecture | AI service architecture | TÃªn cÃ³ `ai-service` trong slug; scope chuáº©n hoÃ¡ `ai`. Äá» xuáº¥t V7_ai_ai-service-architecture.md hoáº·c V7_ai_architecture.md? giá»¯ slug pháº§n cÃ²n láº¡i |
| 8 | V8_ai-collaborating.md | ai | ai-collaborating | AI collaborating | Äá» xuáº¥t V8_ai_ai-collaborating.md |
| 9 | V9_copilot-instructions.md | frontend | copilot-instructions | Copilot instructions | Scope cÃ³ thá»ƒ lÃ  frontend? hoáº·c docs? hiá»‡n táº¡i giá»¯ nguyÃªn mapping; cáº§n xÃ¡c nháº­n |
| 10 | V10_ai-service_cf_model_report.md | ai | ai-service-cf-model-report | AI service CF model report | Äá» xuáº¥t V10_ai_ai-service-cf-model-report.md |
| 11 | V11_frontend_ui-roadmap.md | frontend | ui-roadmap | Frontend UI roadmap | |
| 12 | V12_backend_docs-api-update.md | frontend | docs-api-update | Backend docs API update | LÆ°u Ã½: file lÃ  backend docs update nhÆ°ng scope trong tÃªn lÃ  backend - OK. Kiá»ƒm tra láº¡i ná»™i dung náº¿u cáº§n |
| 13 | V13_frontend_ui-reuse.md | frontend | ui-reuse | Frontend UI reuse | |
| 14 | V14_cicd_ci-cd-setup-fix-workflows.md | cicd | ci-cd-setup-fix-workflows | MovieApp: Sá»­a & hoÃ n thiá»‡n CI/CD (workflows xanh, CD placeholder) | |

| 15 | V15_frontend_preference-onboarding-popup.md | frontend | preference-onboarding-popup | Preference onboarding popup (cold-start user) | Cold-start: prompt user add genre preferences if missing |

## Äá» xuáº¥t rename (cáº§n xÃ¡c nháº­n tá»« ngÆ°á»i dÃ¹ng)
Do "sai sá»‘ thá»© tá»±" (V1 trÃ¹ng láº·p vá» máº·t ngá»¯ nghÄ©a trong yÃªu cáº§u: cÃ³ V1_legalai_ci-cd-split-workflows.md Ä‘Æ°á»£c táº¡o sau?), cÃ¡c file sau cáº§n Ä‘Æ°á»£c Ä‘iá»u chá»‰nh tÃªn Ä‘á»ƒ khá»›p Ä‘á»‹nh dáº¡ng `V{index}_{scope}_{task_name}.md` vÃ  Ä‘áº£m báº£o index liÃªn tá»¥c:

1. **V1_legalai_ci-cd-split-workflows.md** (tÃ¬m tháº¥y trong ngá»¯ cáº£nh yÃªu cáº§u) â†’ **V1_cicd_ci-cd-split-workflows.md** (gÃ¡n index 1 cho CICD). Tuy nhiÃªn, hiá»‡n táº¡i `docs/plans/` Ä‘Ã£ cÃ³ `V1_backend-plan.md` táº¡i index 1. Cáº§n **sáº¯p xáº¿p láº¡i toÃ n bá»™** theo trÃ¬nh tá»± há»£p lÃ½.

2. **V1_retrieval_target_validation.md** â†’ **V2_backend_retrieval-target-validation.md** (theo Ä‘á» xuáº¥t á»Ÿ trÃªn)
3. **V2_retrieval_api.md** â†’ **V3_backend_retrieval-api.md**
4. **V5-realtime-interactions.md** â†’ **V5_backend_realtime-interactions.md** (thÃªm scope)
5. **V6-message-queue.md** â†’ **V6_backend_message-queue.md**
6. **V7-ai-service-architecture.md** â†’ **V7_ai_ai-service-architecture.md** (chuáº©n hoÃ¡ scope ai; giá»¯ slug rÃµ rÃ ng)
7. **V8_ai-collaborating.md** â†’ **V8_ai_ai-collaborating.md**
8. **V10_ai-service_cf_model_report.md** â†’ **V10_ai_ai-service-cf-model-report.md**

**LÆ°u Ã½ quan trá»ng:** Hiá»‡n táº¡i cÃ³ sá»± mÃ¢u thuáº«n vá» index 1 (V1_backend-plan.md Ä‘Ã£ tá»“n táº¡i). Theo yÃªu cáº§u user: "V1_legalai_ci-cd-split-workflows.md (scope cicd? ci-cd split â†’ cicd)". VÃ¬ váº­y, Ä‘á» xuáº¥t **renumber toÃ n bá»™** theo thá»© tá»± logic: V0, V1(cicd), V2(backend retrieval validation), V3(backend retrieval api), rá»“i tiáº¿p theo cÃ¡c plan khÃ¡c Ä‘Æ°á»£c sáº¯p xáº¿p láº¡i má»™t cÃ¡ch tuáº§n tá»± vÃ  nháº¥t quÃ¡n.

**CÃ¡ch tÃ­nh next_index:** `max(index) = 15` â†’ `next_index = 16`

## next_index
`16`

## CÃ¡ch xÃ¡c Ä‘á»‹nh index khi táº¡o plan má»›i
1. Äá»c `docs/plans/PLAN_INDEX.md` â†’ láº¥y `next_index`
2. GÃ¡n file má»›i `V{next_index}_{scope}_{task_name}.md`
3. Cáº­p nháº­t báº£ng mapping trong PLAN_INDEX.md (thÃªm dÃ²ng má»›i)
4. Cáº­p nháº­t `next_index = next_index + 1`
