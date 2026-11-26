# V42 — Đồng bộ preference genre có `id`/`name` vào user genre vector

> **Trạng thái:** 🟢 Đã triển khai (2026-11-26) — chờ QA tay trên môi trường thật; AI-service pytest còn 8 lỗi `caplog` có sẵn, không liên quan V42  
> **Người thực hiện:** AI agent (Big Pickle) — review bởi developer  
> **Thời gian lập plan:** 2026-11-26  
> **Thời gian triển khai:** 2026-11-26  
> **Scope:** `backend` (liên quan `frontend`, `ai-service`, `docs`)  
> **Phạm vi file:** `docs/plans/V42_backend_user-preference-genre-weight.md`

---

## 1. Mục tiêu

Khi user chọn/cập nhật **Thể loại yêu thích** trong `preferenceData`, hệ thống phải lưu được cả `id` và `name` của genre (không chỉ tên), rồi dùng chính event `user.updated.profile` hiện có để:

1. Cập nhật **long-term + short-term vector** như hiện tại (dựa trên `name`).
2. Cập nhật **user genre vector sparse** dạng payload `{genreId: 1.0}` trong `user_genre_vectors` (dựa trên `id`), **weight max = 1.0**, không cộng dồn theo `ALPHA`, không tạo dense vector.

Đồng thời sửa lỗi onboarding: modal phải hiện lại nếu user **chưa có preference data hợp lệ**, kể cả lần trước đã bấm “Bỏ qua”.

---

## 2. Yêu cầu bắt buộc / ranh giới

### Phải làm

- `preferenceData` vẫn là **object JSON**. **Không thêm DTO/type/schema/event mới.**
- Frontend UI giữ nguyên (“Thể loại yêu thích”, multiselect), chỉ đổi giá trị lưu từ `string[]` sang `{ id, name }[]`.
- Onboarding:
  - Có `preferenceData.genre` hợp lệ (`Array`, phần tử có `id` + `name`) → ẩn modal.
  - Không có → **luôn hiện lại**, bỏ persistent `localStorage` skip.
  - Legacy `string[]` coi như **chưa có preference** để user chọn lại.
- Backend:
  - `PUT /api/users/me` vẫn publish **duy nhất** `user.updated.profile`.
  - Payload vẫn `{ userId, preferenceData }`, nhưng `preferenceData` chứa object `{id,name}`.
  - Bỏ đoạn `getPreferenceData()` đang lọc chỉ giữ `string[]`.
- AI-service:
  - Xử lý ngay trong `UserEventHandler._on_user_profile_changed()` hiện hữu.
  - `name` → text embed long/short như cũ.
  - `id` → set `genre_scores[id] = 1.0` cho từng genre được chọn.
  - Không đụng luồng `user.genre.update` của click/like/rating/comment.

### Không làm

- ❌ Không thêm event `user.genre.update` cho profile.
- ❌ Không thêm `type: 'preference'`.
- ❌ Không thêm routing key / exchange / queue mới.
- ❌ Không đổi luồng interaction genre hiện tại.
- ❌ Không tạo file test mới.
- ❌ Không commit/push.

### Lưu ý kỹ thuật (đã chốt)

Không sửa `event.types.ts` hay `event_schemas.py`.  
Backend consumer **bỏ validate cứng riêng** cho case `user.updated.profile` (cast payload như JSON); AI handler đọc payload dict thô thay vì `UserUpdatedPayload.model_validate()`. Không thêm/sửa schema/DTO nào.

---

## 3. Luồng end-to-end sau khi đổi

```text
[Frontend]
  user chọn genre trong dialog onboarding / form profile
    → state: [{ id: 28, name: 'Hành động' }, ...]
    → PUT /api/users/me
       body: { preferenceData: { genre: [{ id, name }, ...] } }

[Backend]
  UsersController.updateProfile()
    → UsersService.update()
       → lưu jsonb (giữ nguyên object, không filter string)
       → publish user.updated.profile
          payload: { userId, preferenceData: { genre: [{ id, name }] } }

[AI-service]
  UserEventHandler.handle()
    → eventType === user.updated.profile
    → _on_user_profile_changed(payload)
       ├─ _to_user_text(): lấy name → "genre: Hành động, Kinh dị"
       │    → update_named_user_vectors_with_text(long_term, short_term)
       └─ GenreVectorService.set_preferred_genres(userId, genres)
            → đọc payload genre_scores hiện có
            → weights[id] = 1.0 cho mọi id hợp lệ
            → save_genre_payload() vào user_genre_vectors
               (metadata JSON, vector chỉ placeholder)
```

Không có bước trung gian nào khác. Không event thứ hai.

**API onboarding hiện hữu (không đổi endpoint):**

1. `GET /api/genres` — `useGenre.useGetAll()` trong dialog để render danh sách thể loại.
2. `PUT /api/users/me` — `useUpdateMe` → `userApi.updateProfile()` khi bấm “Lưu và tiếp tục”.
3. `GET /api/users/me` — `refreshUser()` sau khi save để cập nhật store.

---

## 4. Các phase triển khai

### Phase 0 — Đối chiếu hiện trạng ✅ (đã làm lúc lập plan)

- Đọc `docs/BACKEND.md`: `PUT /api/users/me`, bảng event `user.updated.profile`, `GET /api/genres`.
- Đọc `docs/FRONTEND.md`: ghi chú onboarding V15.
- Đọc `docs/AI-SERVICE.md` + `docs/plans/V38`: cơ chế `genre_scores` / `user_genre_vectors`.
- Code hiện trạng đã xác nhận:
  - `preference-onboarding-gate.tsx`: lưu `string[]`, có skip localStorage.
  - `preference-onboarding-dialog.tsx`: props `selectedGenres: string[]`.
  - `UserProfileForm.tsx`: `mapValueToName()` đổi id → name.
  - `api.types.ts`: `Record<string, string[]>`.
  - `users.service.ts`: `getPreferenceData()` chỉ giữ string.
  - `event.types.ts`: zod `array(z.string())`.
  - `user_event_handler.py`: `_to_user_text()` join string; chưa đụng genre payload.

---

### Phase 1 — Frontend: chọn genre lấy `id + name`, sửa gate onboarding

**Files**
- `frontend/src/components/onboarding/preference-onboarding-gate.tsx`
- `frontend/src/components/onboarding/preference-onboarding-dialog.tsx`
- `frontend/src/app/(main)/profile/UserProfileForm.tsx`
- `frontend/src/shared/types/api.types.ts` *(chỉ nới type cho khớp JSON; không định nghĩa DTO/schema mới)*

**Tasks**
- [x] Dùng kiểu tại chỗ `{ id: number; name: string }[]` cho giá trị `preferenceData.genre` (không tạo file type mới).
- [x] `PreferenceOnboardingGate`:
  - state `selectedGenres` thành object refs.
  - `handleSelectGenre(genre)` / `handleRemoveGenre(genreId)` nhận object/id thay vì name.
  - `hasPreferences` = array có phần tử `{id,name}` hợp lệ; `string[]` legacy → `false`.
  - **Xoá đọc/ghi `localStorage` skip**; `handleSkip()` chỉ `setOpen(false)`.
  - `handleSave()` gửi `{ preferenceData: { genre: selectedGenres } }`.
- [x] `PreferenceOnboardingDialog`:
  - props đổi sang `GenreRef[]`; key = `genre.id`; label = `genre.name`; so sánh selected bằng `id`.
  - UI badges/xoá giữ nguyên, chỉ đổi giá trị so sánh.
- [x] `UserProfileForm`:
  - `InputMultiSelectDemo` giữ `selectIds` từ `field.value.map(g => String(g.id))`.
  - `mapValueToName` → `mapValueToGenreRef` (trả `{id,name}` từ `genres`).
  - Badge hiển thị `genre.name`.
  - `defaultValues.preferenceData`: map legacy `string[]` → object bằng danh sách `genres` (bỏ name không tìm thấy).
  - `onSubmit`: `preferenceData = { genre: data.preferenceData }` (giữ nguyên payload shape).
- [x] `api.types.ts`: nới `preferenceData` thành object JSON cho phép mảng object.

**Acceptance**
- Chọn genre ở onboarding/profile → payload có `{id,name}`.
- User cũ có `string[]` → form vẫn hiện tên, save ra object.
- Chưa có preference hợp lệ → reload / login lại vẫn hiện modal, dù từng bấm “Bỏ qua”.

---

### Phase 2 — Backend: giữ event cũ, cho JSON object đi qua

**Files**
- `backend/src/modules/users/users.service.ts`
- `backend/src/infrastructure/messaging/consumers/user.consumer.ts`
- `backend/src/modules/users/users.service.spec.ts` *(cập nhật spec hiện hữu, KHÔNG tạo file mới)*
- `docs/BACKEND.md`

**Tasks**
- [x] `getPreferenceData()` bỏ filter `Array.isArray + every(string)`; trả nguyên value (hoặc bỏ hẳn helper nếu không còn cần).
- [x] `UsersService.update()`: vẫn `publishUserUpdated({ userId, preferenceData })` — **không đổi tên event, không publish thêm event**.
- [x] `UserHandler` case `USER_UPDATED_PROFILE`: bỏ gọi `validateWithZodSchema(userUpdatedPayloadSchema, ...)`, cast `event.payload` như JSON. **Không sửa `event.types.ts`**.
- [x] Cập nhật `users.service.spec.ts`: assert payload `user.updated.profile` giữ nguyên `{id,name}` (sửa test cũ, không tạo file).
- [x] `docs/BACKEND.md`: ghi chú payload `user.updated.profile` mang `preferenceData.genre: [{id,name}]`.

**Acceptance**
- `PUT /api/users/me` với `preferenceData.genre = [{id,name}]` → lưu jsonb thành công, publish đúng 1 event.
- Backend `UserConsumer` không nack event mới.
- Luồng click/like/rating/comment không thay đổi.

---

### Phase 3 — AI-service: cập nhật long/short + genre payload `1.0`

**Files**
- `ai-service/src/infra/messaging/consumers/user_event_handler.py`
- `ai-service/src/services/genre_vector_service.py`
- `docs/AI-SERVICE.md`
- `docs/plans/V38_ai_search-history-user-vectors.md` *(chỉ ghi chú cập nhật liên quan; không đổi kiến trúc)*

**Tasks**
- [x] **Không sửa `event_schemas.py`**; handler đọc `payload_obj` dict thô cho `user.updated.profile`.
- [x] `_to_user_text()`: với mỗi genre lấy `name` nếu có (`dict`/object), fallback string legacy; vẫn join `"genre: A, B"`.
- [x] `_on_user_profile_changed()`:
  - Giữ nguyên gọi `update_named_user_vectors_with_text(...)` cho long/short.
  - Thêm gọi `self._genre_vector_service.set_preferred_genres(payload.userId, genres)` khi có genre hợp lệ.
  - Dùng dependency `_genre_vector_service` **đã có sẵn** trong constructor (không thêm dependency mới).
- [x] `GenreVectorService.set_preferred_genres(user_id, genres)`:
  - lọc `{id,name}` hợp lệ (`id` int > 0, `name` string).
  - đọc `find_genre_payload(...)` hiện hữu.
  - set `weights[id] = 1.0` (max, ghi đè, **không** cộng `ALPHA`, **không** chia số genre).
  - `save_genre_payload(...)` vào `settings.vector_user_genre_collection`.
  - giữ nguyên các id khác do interaction tạo ra (mặc định; chỉ đổi nếu developer yêu cầu reset).
  - không tạo/đụng dense vector.
- [x] Không sửa `GenreEventHandler`, `UserGenreUpdatePayload`, `_normalize_genre_score`, `MESSAGE_EVENTS`.
- [x] `docs/AI-SERVICE.md`: ghi rõ profile event giờ cũng ghi `genre_scores[id] = 1.0`.

**Acceptance**
- Event profile có `genre: [{id:28,name:'Hành động'}]` → `genre_scores['28'] == 1.0`.
- Event profile không có genre → giữ hành vi cũ (log, không xoá payload).
- Event profile legacy `string[]` → vẫn embed long/short, không crash, không set genre payload.
- Interaction genre vẫn đi `user.genre.update` như cũ.

---

### Phase 4 — Docs, gate kiểm tra, không tạo test file

**Files**
- `docs/FRONTEND.md`
- `docs/plans/PLAN_INDEX.md`
- Existing specs chỉnh sửa: `backend/src/modules/users/users.service.spec.ts`

**Tasks**
- [x] `docs/FRONTEND.md`: cập nhật ghi chú onboarding — lưu `{id,name}`, modal hiện lại khi chưa có preference.
- [x] **Không tạo file test mới.** Chỉ sửa spec backend hiện hữu như Phase 2. Frontend/AI-service không có spec hiện hữu cho component/handler này → chạy gate + QA tay, không tạo file.
- [x] Chạy gate:
  - `backend`: `npm run build`, `npm run type-check`, full `npm test` ✅ (53 suites / 457 tests).
  - `frontend`: `npm run type-check`, `npm run lint` (0 errors), `npm test` (37 files / 289 tests), `npm run build` ✅.
  - `ai-service`: full `pytest` ⚠️ 526 passed / 8 failed — 8 case `caplog` đã fail từ trước (log không propagate vào `caplog.text`), không đụng file V42.
  - `git diff --check` ✅ sạch (không warning/whitespace error).
- [ ] QA tay (chưa chạy vì cần stack thật):
  1. User mới → modal hiện → chọn genre → save → `GET /users/me` thấy `{genre:[{id,name}]}`.
  2. Bấm “Bỏ qua” → reload → modal vẫn hiện.
  3. Xoá `preferenceData` trên DB → reload → modal hiện lại.
  4. Vào profile → đổi genre → save → payload đúng object.
  5. Kiểm tra `user_genre_vectors` metadata: genre mới có `1.0`.
  6. Click/like/rating 1 phim → genre payload vẫn tăng nhẹ theo `ALPHA` như cũ (không bị ghi đè bởi profile).

**Acceptance**
- Backend/frontend gate xanh; ai-service có 8 lỗi `caplog` có sẵn; diff sạch; không file test mới; không commit.

---

## 5. Definition of Done

- [x] Không có DTO/type/schema/event/queue/file test mới được tạo.
- [x] Chỉ có 1 event `user.updated.profile` cho profile update.
- [x] `preferenceData.genre` mang `{id,name}` từ UI.
- [x] Onboarding hiện lại khi chưa có preference hợp lệ (bỏ skip persistent).
- [x] AI cập nhật cả long/short-term **và** `genre_scores[id] = 1.0`.
- [x] Không đụng luồng `user.genre.update` của interaction.
- [x] Docs backend/frontend/ai-service cập nhật.
- [x] Backend/frontend gate xanh; ai-service pytest có 8 lỗi `caplog` có sẵn; `git diff --check` sạch; changes vẫn **uncommitted**. QA tay còn chờ môi trường thật.

---

## 6. Ghi chú khi triển khai

- Giữ nguyên các thay đổi uncommitted trước đó (country filter, logging/observability…).
- Không commit/push khi chưa được developer yêu cầu.
- Nếu developer muốn “bỏ chọn thì reset toàn bộ genre_scores về đúng danh sách đã chọn”, chỉ đổi logic trong `GenreVectorService.set_preferred_genres()`, không đổi luồng event.
