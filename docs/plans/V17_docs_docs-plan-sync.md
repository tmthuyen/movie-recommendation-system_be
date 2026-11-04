# V17 — Đồng bộ docs & plans với code hiện tại

## Thông tin chung

| Hạng mục | Nội dung |
|---|---|
| Trạng thái | ✅ Hoàn thành (2026-11-04) |
| Người thực hiện | AI Agent (main) + subagent SA-DOCS |
| Thời gian | 2026-11-04 |
| Scope | `docs` (mở rộng enum tại `AGENTS.md`) |
| Nhánh | `ci-cd` |
| Module liên quan | `docs/*.md`, `docs/plans/*.md`, `AGENTS.md` |
| Không sửa | Code backend/frontend/ai-service; `docs/BACKEND_RULES.md`; nội dung `docs/FRONTEND_RULES.md` (chỉ sửa con trỏ sai nếu được duyệt) |

## Bối cảnh

Code đã thay đổi nhiều so với docs/plans. Đặc biệt:

1. Backend **có gọi HTTP** sang ai-service cho recommendation:
   - `backend/src/modules/recommendations/recommendations.service.ts` dùng `fetch(AI_SERVICE_URL)`.
   - `AI_SERVICE_URL` mặc định `http://localhost:8082/api/recommendations`.
   - `RecommendationsModule` đã đăng ký trong `backend/src/app.module.ts`.
2. Frontend gọi recommendation qua backend:
   - `frontend/src/apis/recommendation.api.ts` → `/recommendations/similar/:id`.
   - `frontend/src/hooks/tankstack/useRecommendation.ts`.
3. Backend có endpoint mới chưa có trong docs:
   - `GET /api/movies/search` với `genreIds`, `countryIds`, `sort`, range (`backend/src/modules/movies/movies.controller.ts`).
4. Docs đang nói ngược:
   - `AGENTS.md`: "Backend ↔ ai-service qua RabbitMQ, không HTTP-call lẫn nhau".
   - `docs/BACKEND.md`: "Không có endpoint recommendation trong backend".
   - `docs/FRONTEND.md`: "Backend không có endpoint search/recommendation".
5. Plans lệch trạng thái/ngày:
   - V15 ghi "Đang thực hiện" nhưng code `PreferenceOnboardingGate` đã có và đã gắn vào `(main)/layout.tsx`.
   - V16 dẫn `docs/plans/V16_backend_realtime-interaction-band5.md` nhưng file không tồn tại.
   - V14 còn ghi chú `admin.ts` dùng `eslint-disable` (đã được thay bằng `createPagedList`).
   - `PLAN_INDEX.md` đang lưu encoding ANSI, hiển thị lỗi tiếng Việt.

## Mục tiêu

- Docs phản ánh đúng code tại thời điểm 2026-11-04, có ghi chú "verified date".
- Plans có trạng thái + thời gian đúng thực tế.
- Không còn câu khẳng định sai về giao tiếp backend ↔ ai-service.
- `PLAN_INDEX.md` đọc được (UTF-8), index liên tục, `next_index` đúng.

## Phạm vi file

| File | Việc |
|---|---|
| `AGENTS.md` | Sửa mô tả giao tiếp 2 service; thêm scope `docs`/`testing`; trỏ rules mới |
| `docs/BACKEND.md` | Thêm module recommendations + `/api/movies/search`; sửa mô tả HTTP; verified date |
| `docs/FRONTEND.md` | Luồng recommendation FE → BE → AI; bỏ ghi chú node_modules chưa cài; search filters |
| `docs/AI-SERVICE.md` | Danh sách route thật; trạng thái test/Dockerfile/CORS; verified date |
| `docs/ProjectOverview.md` | Đánh dấu tài liệu lịch sử hoặc viết lại mục Hiện trạng |
| `docs/DATABASE-DESIGN.md` | Đồng bộ entity thật (bỏ favorites/watchlist; movie.country; releaseDate; seed_ratings; failed_events) |
| `docs/FRONTEND_RULES.md` | Chỉ sửa con trỏ `nav-main.tsx/dataBar` → `nav-data.ts` |
| `docs/plans/V11,V12,V13,V14,V15,V16` | Cập nhật trạng thái/ngày/pointer |
| `docs/plans/PLAN_INDEX.md` | Rewrite UTF-8 + thêm V17/V18/V19 + next_index |

## Phases

### Phase 0 — Chuẩn bị
- [x] Tạo plan V17.
- [x] Cập nhật `PLAN_INDEX.md`.

### Phase 1 — Docs service
- [x] `AGENTS.md`: mô tả 2 kênh (RabbitMQ event + HTTP proxy recommendation).
- [x] `docs/BACKEND.md`: bảng endpoint recommendations; `/api/movies/search`; ghi chú HTTP call; verified date.
- [x] `docs/FRONTEND.md`: recommendation flow; bỏ ghi chú cũ; verified date.
- [x] `docs/AI-SERVICE.md`: route thật; Dockerfile comment; verified date.
- [x] `docs/ProjectOverview.md`: đánh dấu lịch sử/viết lại hiện trạng.
- [x] `docs/DATABASE-DESIGN.md`: đồng bộ entity.
- [x] `docs/FRONTEND_RULES.md`: sửa con trỏ nav.

### Phase 2 — Plans
- [x] V11: cập nhật Phase 4 + verified date.
- [x] V13: chuyển trạng thái hoàn thành nếu đúng.
- [x] V14: bỏ ghi chú eslint-disable; verified date.
- [x] V15: chuyển `✅ Hoàn thành`, tick checklist.
- [x] V16: thống nhất tên file/pointer.
- [x] `PLAN_INDEX.md`: UTF-8 + rows 17-19 + `next_index = 20`.

### Phase 3 — Kiểm tra
- [x] `rg "không HTTP-call|không có endpoint recommendation|không có endpoint search"` → 0 kết quả sai.
- [x] Mọi endpoint trong code có trong `docs/BACKEND.md`.
- [x] `PLAN_INDEX.md` hiển thị đúng tiếng Việt.
- [x] Không sửa code; không commit.

## Acceptance

- Docs/plans khớp code, có ngày xác minh.
- Không còn thông tin sai về HTTP/RabbitMQ.
- `PLAN_INDEX.md` UTF-8, index liên tục.
- Báo cáo diff + danh sách file đã sửa trong plan này.

## Ghi chú cho subagent SA-DOCS

- Chỉ sửa tài liệu, không sửa code.
- `AGENTS.md` do main agent sửa trước; SA-DOCS không sửa lại phần đó.
- Không sửa nội dung `docs/BACKEND_RULES.md`.
- `docs/FRONTEND_RULES.md` chỉ sửa con trỏ route (nếu cần).
- Cập nhật tiến độ vào chính file này + báo cáo kết quả.

---

## Báo cáo thực hiện (chốt 2026-11-04)

### File đã sửa/tạo

| File | Hành động | Nội dung chính |
|---|---|---|
| `AGENTS.md` | Sửa | Giao tiếp backend ↔ ai-service = **2 kênh** (RabbitMQ event + HTTP proxy `recommendations`); thêm scope `docs`/`testing`; trỏ `CODE_RULES.md` + rules UI (sau này gộp vào `FRONTEND_RULES.md` ở V20) |
| `docs/BACKEND.md` | Sửa | Bảng endpoint module `recommendations` (`similar` hoạt động, `semantic-search`/`hybrid-search` stub, không envelope); `GET /api/movies/search`; ghi chú HTTP call + `AI_SERVICE_URL`; "Ngày xác minh: 2026-11-04"; **bổ sung** `GET /api/interactions/movie/:movieId/me` (xem "Gap phát hiện") |
| `docs/FRONTEND.md` | Sửa | Luồng recommendation FE → BE → AI; bỏ ghi chú lỗi thời về `node_modules`; search filters; verified date |
| `docs/AI-SERVICE.md` | Sửa | Danh sách route thật; trạng thái test/Dockerfile/CORS; verified date |
| `docs/ProjectOverview.md` | Sửa | Viết lại mục "Hiện trạng"; phần còn lại đánh dấu tính lịch sử |
| `docs/DATABASE-DESIGN.md` | Sửa | Bỏ `favorites`/`watchlist`; thêm `movie.country`; `releaseDate` kiểu `date`; `seed_ratings`; `failed_events` |
| `docs/FRONTEND_RULES.md` | Sửa 1 dòng | Con trỏ điều hướng `nav-main.tsx`/`dataBar` → `nav-data.ts` (`NAV_SECTIONS`, `BOTTOM_NAV`) |
| `docs/plans/V11_frontend_ui-roadmap.md` | Sửa | Phase 4 mở khoá một phần (similar đã chạy; semantic/hybrid còn stub); "Ngày xác minh 2026-11-04" |
| `docs/plans/V13_frontend_ui-reuse.md` | Sửa | Trạng thái → ✅ Hoàn thành (Phase 1–2 xong) |
| `docs/plans/V14_cicd_ci-cd-setup-fix-workflows.md` | Sửa | Thêm "Ngày xác minh 2026-11-04"; ghi chú `admin.ts` **vẫn còn** `eslint-disable` có chủ thích cho factory `usePagedList` (đính chính hiểu nhầm `createPagedList`); cảnh báo `passWithNoTests` sẽ đổi ở V19 |
| `docs/plans/V15_frontend_preference-onboarding-popup.md` | Sửa | Trạng thái → ✅ Hoàn thành; tick toàn bộ checklist |
| `docs/plans/V16_realtime_interation.md` | Sửa | Bỏ pointer tới `V16_backend_realtime-interaction-band5.md` (không tồn tại) → trỏ chính file này |
| `docs/plans/PLAN_INDEX.md` | Rewrite | UTF-8, đủ row V17–V19, `next_index = 20` |
| `docs/CODE_RULES.md` | Tạo (thuộc V18) | Rules xuyên service |
| `docs/FRONTEND_RULES.md` | Cập nhật (V20) | Rules UI/motion được gộp vào `FRONTEND_RULES.md` (file UI riêng đã xoá) |

### Kết quả kiểm tra Phase 3

| Kiểm tra | Lệnh / cách làm | Kết quả |
|---|---|---|
| Câu khẳng định sai về HTTP | `Select-String -Path docs/*.md,AGENTS.md -Pattern "không HTTP-call\|không có endpoint recommendation\|không có endpoint search\|Backend không có"` | **0** câu sai (1 match duy nhất ở `CODE_RULES.md:296` là rule "Không gọi HTTP/email trong transaction" — hợp lệ) |
| Đối chiếu endpoint | Trích 86 decorator `@Get/@Post/@Put/@Patch/@Delete` trong `backend/src/**/*.controller.ts`, so với bảng trong `docs/BACKEND.md` | 85/86 khớp; **thiếu 1** → đã bổ sung (xem dưới) |
| `PLAN_INDEX.md` encoding | Đọc lại bằng UTF-8 | Đúng tiếng Việt, `max(index)=19`, `next_index=20` |
| Không sửa code | `git status` | Chỉ `docs/**` + `AGENTS.md` bị thay đổi, không có file code |

### Gap phát hiện & đã xử lý

- **`GET /api/interactions/movie/:movieId/me`** (JWT) có trong code (`interactions.controller.ts:152-175`, service `getInteractionsByUserAndMovie` trả `{isLiked, click, commentCount, rating}`) nhưng **chưa có trong bảng endpoint** `docs/BACKEND.md`.
- Đã thêm row vào bảng module `interactions`, ghi rõ auth/response/ghi chú + file:line.

### Ghi chú còn lại (không chặn hoàn thành)

1. `docs/BACKEND_RULES.md` không sửa (read-only) — dù còn nhắc `favorite/watchlist` cũ; đã ghi nhận ở V16 và không nằm trong phạm vi V17.
2. Legacy index: thiếu `V0`, `V2`; tên file `V5`, `V6`, `V7`, `V16` lệch chuẩn `V{index}_{scope}_{task}`. **Chưa rename** vì `AGENTS.md` yêu cầu xác nhận của người dùng trước khi rename.
3. `V16` slug `interation` (thiếu "c") giữ nguyên, chờ xác nhận rename.
