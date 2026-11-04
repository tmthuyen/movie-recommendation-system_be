# V20 — Gộp 2 file rules frontend thành 1 (`FRONTEND_RULES.md`)

## Thông tin chung

| Hạng mục | Nội dung |
|---|---|
| Trạng thái | ✅ Hoàn thành (2026-11-04) |
| Người thực hiện | AI Agent |
| Thời gian | 2026-11-04 |
| Scope | `docs` |
| Nhánh | `ci-cd` |
| Yêu cầu | Developer: "frontend có 2 RULES, tôi chỉ cần 1 file → gộp UI rules và rules ban đầu của frontend" |
| Module liên quan | `docs/FRONTEND_RULES.md`, `docs/FRONTEND_UI_RULES.md` (xoá), `AGENTS.md`, `docs/CODE_RULES.md`, plans V17/V18 |
| Không sửa | `docs/BACKEND_RULES.md` (read-only); code `frontend/` |

## Bối cảnh

Sau V18, frontend có 2 file rules chồng chéo:

- `docs/FRONTEND_RULES.md` — rules gốc (envelope, stack, Tailwind/shadcn, responsive, UX, auth, naming, cấm) — 104 dòng.
- `docs/FRONTEND_UI_RULES.md` — rules UI/motion chi tiết tạo ở V18 (shadcn-first, inventory, motion card, a11y, checklist, hiện trạng/follow-up) — 366 dòng.

Hệ quả: người đọc phải mở 2 file, có nội dung trùng (responsive 375px, touch target, poster aspect, loading/empty state) và 2 chỗ ghi "xung đột" với nhau (`motion` vs "không thêm lib animation nặng", `aspect-[6/3]` vs `aspect-[2/3]`).

## Mục tiêu

- **Chỉ còn 1 file rules frontend**: `docs/FRONTEND_RULES.md` chứa cả rules gốc + rules UI/motion/a11y.
- Không mất bất kỳ rule bắt buộc nào; xung đột được chốt ngay trong file (không còn 2 nguồn).
- Mọi tham chiếu `FRONTEND_UI_RULES.md` được cập nhật; file cũ bị xoá.

## Phases

### Phase 0 — Chuẩn bị
- [x] Đọc cả 2 file, liệt kê rule trùng / xung đột.
- [x] Tạo plan V20 + cập nhật `PLAN_INDEX.md`.

### Phase 1 — Gộp nội dung
- [x] Viết lại `docs/FRONTEND_RULES.md` = rules gốc (giữ nguyên hiệu lực) + shadcn inventory + motion card + a11y + nội dung/định dạng + trạng thái UI + checklist review + hiện trạng/follow-up.
- [x] Chốt xung đột trong chính file: `motion` chỉ cho card/list entrance + hover; micro-interaction dùng CSS/`tw-animate-css`; poster `aspect-[2/3]` là chuẩn, `movie-card.tsx` đang lệch → ghi follow-up.
- [x] Bỏ phần trùng lặp giữa §3–§5 cũ và rules UI.

### Phase 2 — Xoá file cũ & sửa tham chiếu
- [x] Xoá `docs/FRONTEND_UI_RULES.md`.
- [x] `AGENTS.md`: bỏ dòng trỏ `FRONTEND_UI_RULES.md`, ghi rõ 1 file rules frontend.
- [x] `docs/CODE_RULES.md`: bảng phạm vi/ưu tiên trỏ về `FRONTEND_RULES.md`.
- [x] `docs/plans/V17`, `V18`: ghi chú đã gộp (giữ lịch sử, không còn link chết).
- [x] `PLAN_INDEX.md`: thêm V20, `next_index = 21`.

### Phase 3 — Kiểm tra
- [x] `grep FRONTEND_UI_RULES` toàn repo → chỉ còn trong ghi chú lịch sử (V18, V20, `FRONTEND_RULES.md` §Lịch sử), không còn link/doc sống.
- [x] `docs/FRONTEND_RULES.md` đọc được UTF-8, đủ rule, không mâu thuẫn nội bộ.
- [x] Không sửa code; không commit.

## Acceptance

- 1 file rules frontend duy nhất, đầy đủ nội dung của cả 2 file cũ.
- Không còn link/tham chiếu sống tới `FRONTEND_UI_RULES.md` (chỉ còn ghi chú lịch sử).
- Có ghi chú lịch sử trong V18 (ai đọc plan cũ vẫn hiểu).

## Ghi chú

- Đây là thay đổi tài liệu theo yêu cầu trực tiếp của developer → được phép sửa nội dung `docs/FRONTEND_RULES.md` (rule cũ "không sửa nội dung file này" chỉ áp dụng khi **không** có yêu cầu của developer).
- Nội dung rules không bị nới lỏng: chỉ gộp vị trí, giữ nguyên mức bắt buộc.
