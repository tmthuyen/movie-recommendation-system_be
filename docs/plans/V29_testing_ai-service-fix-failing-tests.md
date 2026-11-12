# V29 — Sửa test AI-service đang fail do lệch API hiện tại

## Trạng thái

✅ Hoàn thành — 2026-11-12

## Người thực hiện & thời gian

- Người thực hiện: AI agent (Big Pickle)
- Thời gian bắt đầu: 2026-11-12
- Thời gian hoàn thành: 2026-11-12

## Module liên quan

- `ai-service/tests/unit/api/routes/test_recommendations.py`
- `ai-service/tests/unit/core/test_integrations.py`
- `ai-service/tests/unit/infra/messaging/test_interaction_queue.py`
- `ai-service/tests/unit/infra/messaging/consumers/test_interaction_event_handler.py`
- `ai-service/src/infra/messaging/consumers/interaction_event_handler.py` (sửa typo dispatch `training.batch`)
- `ai-service/src/api/routes/recommendations.py` (sửa `pageSize` → `page_size`, debug hybrid dùng `user_id`)
- `ai-service/src/services/movie_vector_service.py` (gọi `VectorStore.upsert` đúng signature mới)
- `ai-service/tests/conftest.py` (cập nhật `FakeChroma` bám đúng contract `VectorStore`)

## Phạm vi

- Chỉ xử lý các test đang fail trong full suite AI-service.
- Không xoá file test; được phép viết lại nội dung test cho khớp hành vi production hiện tại.
- Không nới lỏng assertion để che lỗi; test phải phản ánh contract hiện tại.
- Chỉ sửa production khi lỗi rõ ràng và trực tiếp khiến test/hành vi không thể đúng:
  - typo `training.batch` trong handler,
  - `/search` đọc sai `pageSize`,
  - debug `/hybrid/no-auth` gọi sai keyword `user_uuid`,
  - `MovieVectorService` gọi `VectorStore.upsert` theo signature cũ.
- Không commit/push khi chưa có yêu cầu.

## Nguyên nhân fail (điều tra ban đầu)

Full suite: 66 failed, gồm 4 file:

1. `test_recommendations.py` (17 fail)
   - Endpoint semantic đổi từ `/semantic` sang `/semantic-search`.
   - `/hybrid` đổi contract: chỉ còn `topK`, user lấy từ JWT `sub`, service gọi `user_id=...`.
   - Test cũ còn dùng `userId`, `keyword`, `pageSize`, `user_uuid` và kỳ vọng 403.
2. `test_integrations.py` (10 fail)
   - `VectorStore.upsert` đổi signature sang `(movie_id, id, vector, payload, collection_name)`.
   - `TrainingScheduler` nhận `redis_store`, bỏ `app_state`; `train_main_model` tạo `ModelTrainingService(redis_store=...)`.
3. `test_interaction_queue.py` (4 fail)
   - `FakeMessage` thiếu `correlation_id` khiến production rơi vào nhánh lỗi.
   - Handler được gọi bằng keyword `event=<body>`, không phải `(event_type, payload)`.
   - Message thiếu `eventType` bị nack thay vì gọi handler với chuỗi rỗng.
4. `test_interaction_event_handler.py` (35 fail)
   - Constructor đổi sang 3 dependency service.
   - `handle` nhận một `dict` event theo `DomainEvent`, không nhận `(event_type, payload)`.
   - Logic score/CF/removed/training batch đã thay đổi; test cũ bám implementation cũ.
   - Production có typo `"train   ing.batch"` thay vì `"training.batch"` — cần sửa để dispatch đúng.

## Phases & checklist

### P1 — Chốt baseline & nguyên nhân

- [x] Chạy full suite AI-service, ghi nhận 66 fail / 4 file.
- [x] Đọc production tương ứng: routes, integrations, interaction queue, interaction event handler.
- [x] Xác định test stale do production đổi contract, không phải lỗi môi trường.

### P2 — Sửa `test_recommendations.py`

- [x] Đổi path semantic sang `/semantic-search`, cập nhật message assertion.
- [x] Viết lại `TestHybridSearchEndpoint` theo contract hiện tại:
  - [x] Auth bắt buộc, user lấy từ token `sub`.
  - [x] Chỉ nhận `topK` (default 100, range 1..1000).
  - [x] Service gọi `hybrid_recommendation(user_id=..., top_k=...)`.
  - [x] Pagination `page=1`, `limit=topK`; message empty/success đúng production.
  - [x] Bỏ test 403/pageSize/keyword/userId không còn tồn tại; thay bằng test spoof `userId` bị bỏ qua.
- [x] Sửa production `/search` dùng `page_size`; cập nhật test `/search` theo hành vi đúng.
- [x] Sửa debug `/hybrid/no-auth` dùng `user_id`; cập nhật assertion.

### P3 — Sửa `test_integrations.py`

- [x] Cập nhật `VectorStore.upsert` calls sang keyword args đúng signature mới.
- [x] Thêm test cho nhánh `id` (user vector).
- [x] Cập nhật `TrainingScheduler` tests: truyền `redis_store`, bỏ `app_state`.
- [x] Test `train_main_model` dùng `ModelTrainingService(redis_store=...)`, reset `is_training`, propagate lỗi.

### P4 — Sửa `test_interaction_queue.py`

- [x] Thêm `correlation_id` vào `FakeMessage`.
- [x] Assert handler được gọi `event=<full body>`.
- [x] Cập nhật case thiếu `eventType`: nack, không gọi handler.
- [x] Giữ các case nack do invalid JSON / handler exception.

### P5 — Viết lại `test_interaction_event_handler.py`

- [x] Dùng mock `MovieVectorService`, `UserVectorService`, `TrainingScheduler`.
- [x] Test `_get_action_score`, `_normalize_score`.
- [x] Test validate payload, coerce `movieId`, dispatch `interaction.created` / `interaction.event`.
- [x] Test EMA semantic: user mới, user cũ, score 0, score âm, movie không tồn tại.
- [x] Test `removed=True` vẫn cập nhật semantic profile (theo production hiện tại).
- [x] Test `training.batch`: rỗng thì skip; có dữ liệu thì ghi parquet, xoá file tạm, không upload/schedule.
- [x] Test `training.request`: tạo task gọi `train_main_model`.
- [x] Test event type lạ chỉ log warning.
- [x] Sửa typo production `"train   ing.batch"` → `"training.batch"`.
- [x] Sửa `MovieVectorService.upsert_movie_vector` gọi `VectorStore.upsert` đúng signature; cập nhật `FakeChroma` tương ứng.

### P6 — Verify

- [x] Chạy targeted 4 file: `118 passed`.
- [x] Chạy full suite AI-service: `554 passed, 0 failed`.
- [x] Kiểm tra line-length thủ công cho các file test đã sửa (black/isort chưa cài trong venv).
- [x] Cập nhật trạng thái plan + `PLAN_INDEX.md`.

## Rủi ro / lưu ý

- `FakeChroma` đã được chỉnh signature gần với `VectorStore` thật hơn để tránh che lỗi gọi sai tham số.
- Test training batch dùng pandas/pyarrow trong venv; nếu môi trường CI thiếu pyarrow cần mock `to_parquet`.
- `docs/AI-SERVICE.md` vẫn còn mô tả endpoint cũ (`/hybrid-search`) và bug `/search`; cần đồng bộ tài liệu ở task riêng nếu muốn.
- Chưa commit/push theo yêu cầu.
