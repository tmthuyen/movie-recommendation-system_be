# V16 — Realtime tương tác qua WebSocket (REST chỉ cho mutation)

> **File plan chính thức**: `docs/plans/V16_backend_realtime-interaction-band5.md`.
>
> **Liên quan**: `docs/plans/V5-realtime-interactions.md` (plan cũ, chưa hoàn thiện realtime cho like/comment/click).
>
> **Cập nhật theo phản hồi developer (2026-10-26)**:
> - `score` = **độ tin cậy** của tín hiệu tương tác (không phải điểm thưởng hiển thị cho user).
> - **Không có dữ liệu cũ** cần migrate; DB hiện chỉ có `click, like, rating, comment`.
> - **Rating cũng tạo interaction và publish RabbitMQ** (trước đây hiểu nhầm là loại trừ).
> - Realtime hiển thị ở **trang chi tiết**.
> - Click: viewCount luôn tăng (kể cả guest); user đăng nhập → tạo interaction click, nếu đã có thì **update ghi đè**.
> - **Click update KHÔNG publish lại** (tránh spam AI).
> - **Score click tăng dần độ tin cậy, tối đa 5**: `score = min(5, score + 1)` mỗi lần user xem lại.

## 0. Thông tin chung

- **Trạng thái**: Đã triển khai code + docs (Phase 0 → 6) và smoke test E2E (REST + WS + RabbitMQ → ai-service) trên môi trường dev.
- **Người thực hiện & thời gian**: AI Agent — 2026-10-26
- **Scope**: `backend` (kéo theo `ai-service` + `frontend` vì là 1 luồng end-to-end)
- **Module liên quan**:
  - backend: `interactions`, `comments`, `ratings`, `movies`, `events`, `infrastructure/messaging`
  - ai-service: `core/interaction_queue.py`, `services/interaction_event_handler.py`, `services/model_training_service.py`
  - frontend: `components/movie/*`, `hooks/useMovieSocket.ts`, `hooks/tankstack/useInteraction.ts`, `hooks/tankstack/useMovie.ts`, `apis/*`, `shared/types/*`, `app/(main)/my-favorites`, `app/(admin-layout)/admin/interaction`
  - docs: `docs/BACKEND.md`, `docs/FRONTEND.md`, `docs/AI-SERVICE.md`, `docs/plans/PLAN_INDEX.md`
- **Tài liệu bắt buộc đã đọc**: `docs/BACKEND_RULES.md`, `docs/FRONTEND_RULES.md`, `docs/BACKEND.md`, `docs/FRONTEND.md`
- **Không sửa**: `docs/BACKEND_RULES.md` (chỉ đọc), `docs/FRONTEND_RULES.md` (chỉ trỏ dẫn).

---

## 1. Mục tiêu

1. **Rating / Comment / Like**: thực hiện **mutation qua REST API** để xác thực, validate, ghi DB, transaction. **Sau khi ghi thành công, server broadcast qua WebSocket** (`movie-{id}-rating`, `movie-{id}-comment`, `movie-{id}-interaction`) để tất cả client đang mở trang chi tiết cập nhật realtime tự động (không cần F5/refetch). 
2. **View/Click**: dùng **HTTP REST API** (`POST /api/movies/:id/view`) như hiện tại (Optional JWT). Chỉ view/click dùng REST thuần cho việc ghi nhận lượt xem.
3. **Realtime**: toàn bộ cập nhật UI cho `like`, `comment`, `rating` phải qua WebSocket. Không dùng polling/refetch để đồng bộ.
4. **Bỏ hẳn `dislike`**, đồng thời bỏ `favorite` và `watchlist`; bộ tương tác còn đúng 4 loại: `click` (view), `like` (= yêu thích), `rating`, `comment`.
5. **Đổi score sang band 5** (1..5) và **đổi ngữ nghĩa**: `score` là **độ tin cậy** của tín hiệu, không phải "điểm cộng" hiển thị cho user.
6. **Frontend không gửi `score`**; backend tự quy đổi. Response có thể trả `score` như metadata nội bộ nhưng **UI không gamify "+5 điểm"**.
7. **Mọi interaction được tạo ra đều publish RabbitMQ** — gồm cả `rating` và `comment`; bỏ like publish với `removed=true` + score âm để AI trừ tín hiệu.
8. Giữ nguyên envelope response theo `docs/BACKEND_RULES.md`, không bịa endpoint/method.

---

## 2. Hiện trạng & phát hiện (có dẫn chứng)

| # | Vấn đề | Dẫn chứng |
|---|---|---|
| 1 | **Nút like/favorite/watchlist hiện đang lỗi 400**: FE gửi `{type, movieId}`, nhưng DTO bắt buộc `score`; `ValidationPipe` bật `whitelist + forbidNonWhitelisted`. | `backend/src/modules/interactions/dto/create-interaction.dto.ts:8-12`, `backend/src/main.ts:44-46`, `frontend/src/apis/interaction.api.ts:11-16` |
| 2 | Backend **bỏ qua `score` client gửi**, tự lấy `InteractionScoreMap`. | `backend/src/modules/interactions/interactions.service.ts:34` |
| 3 | **Realtime AI bị "câm"**: backend publish `eventType = 'interaction.event'`, ai-service chỉ xử lý `'interaction.created'` → log "Unsupported event type". | `backend/src/infrastructure/messaging/event-publisher.service.ts:30-37`, `ai-service/src/services/interaction_event_handler.py:32` |
| 4 | **Comment & click không publish RabbitMQ**; rating cũng không publish. Chỉ like qua `POST /interactions` mới publish. | `comments.service.ts:43-52`, `movies.service.ts:206-242`, `ratings.service.ts:37-69` |
| 5 | **Unlike (toggle off) không publish** → vector AI không bao giờ được "trừ". | `interactions.service.ts:27-31` |
| 6 | **Unique index `(user, movie, type)` chặn comment lần 2** cùng phim (comment service luôn insert Interaction mới). | `interaction.entity.ts:33`, `comments.service.ts:44-50` |
| 7 | **Band 10** còn ở 3 chỗ: `InteractionScoreMap` (like 10, favorite 7, comment 5, watchlist 3, click 2, dislike 1), ai-service `score / 10.0` (2 chỗ), seed `rating * 2`. | `interaction.entity.ts:23-31`, `interaction_event_handler.py:107-118,157-161,211`, `seed/import-data.seed.ts:229` |
| 8 | **Training ALS bỏ qua `score`**: parquet batch có cột `score` nhưng code chỉ đọc `rating`, thiếu thì gán `1.0`. | `ai-service/src/services/model_training_service.py:127-131` |
| 9 | **Frontend không nhận score** của view/like; API view chỉ trả `{viewCount}`. | `movies.service.ts:242`, `frontend/src/apis/movie.api.ts:40-42` |
| 10 | **Trang chi tiết render 2 hàng nút tương tác** và mở **3–4 socket riêng** cho cùng 1 phim. | `movie-detail.tsx:89`, `movie-detail-view.tsx:114-120`, `useMovieSocket.ts:71-104` |
| 11 | `POST /interactions` trả `result` lồng `{success: ...}` thay vì result phẳng theo rule. | `interactions.service.ts:30,51` + `interactions.controller.ts:39-47` |
| 12 | Click hiện **bỏ qua nếu đã có** (không update), trái yêu cầu "update ghi đè". | `movies.service.ts:224-226` |

> Ghi chú: (1) và (3) giải thích trực tiếp cho cảm giác "realtime thành REST API" — like thất bại, còn luồng AI realtime không bao giờ chạy.

---

## 3. Quyết định thiết kế

### 3.1. Bộ tương tác & score band 5 (độ tin cậy)

| Tương tác | `type` | Score (confidence) | Cách ghi DB | Publish RabbitMQ |
|---|---|---|---|---|
| Xem phim | `click` | **1 → 5** (tăng dần) | Guest: chỉ +viewCount. User login: +viewCount; chưa có → tạo (`score = 1`); đã có → **update ghi đè** `score = min(5, score + 1)`, cập nhật `updatedAt` | ✅ **chỉ khi tạo mới** (update không publish lại) |
| Yêu thích | `like` | **5** | `POST /api/interactions` (toggle) | ✅ (bỏ like → `score = -5`, `removed = true`) |
| Bình luận | `comment` | **4** | `POST /api/comments` — mỗi comment 1 interaction | ✅ mỗi comment |
| Đánh giá | `rating` | **= số sao user nhập (1..5)** | `POST /api/ratings` — interaction score = rating | ✅ mỗi rating |

- `score` = **độ tin cậy / trọng số tín hiệu** cho AI, band 1..5. Không dùng làm điểm thưởng UI.
- `InteractionScoreMap` (band 5): `like = 5`, `comment = 4`, `click = 1`, `rating = 0` (động, lấy điểm user nhập).
- **Chỉ `like` được toggle** qua `/api/interactions`. `comment/click/rating` có endpoint riêng (tránh lạm dụng + tránh đụng unique index).
- Bỏ hoàn toàn `dislike`, `favorite`, `watchlist` khỏi enum, DTO, docs, UI. **Không cần migrate** vì DB không có dữ liệu các loại này.

### 3.2. Hợp đồng API (theo envelope `docs/BACKEND_RULES.md`)

#### a) `POST /api/interactions` — JWT — toggle yêu thích

Request:
```json
{ "type": "like", "movieId": 123 }
```

Response 200 (thêm):
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Đã thêm vào yêu thích",
  "result": {
    "action": "added",
    "type": "like",
    "score": 5,
    "likeCount": 42,
    "data": { "id": 9001, "type": "like", "score": 5 }
  }
}
```

Response 200 (bỏ):
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Đã bỏ yêu thích",
  "result": { "action": "removed", "type": "like", "score": 0, "likeCount": 41 }
}
```

- `score` trong response là **metadata độ tin cậy**; FE không hiển thị như "+5 điểm".
- `likeCount` = tổng like hiện tại của phim (phục vụ realtime + fallback).

#### b) `GET /api/interactions/stats/:movieId` — Public

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Lấy thống kê tương tác thành công",
  "result": {
    "movieId": 123,
    "likeCount": 42,
    "commentCount": 18,
    "viewCount": 1234,
    "ratingCount": 56,
    "voteAverage": 4.2
  }
}
```

- `likeCount`: `COUNT(interactions WHERE type='like')`.
- `commentCount`: `COUNT(comments WHERE movie_id=?)` (nguồn sự thật, gồm reply).
- `viewCount`, `ratingCount`, `voteAverage`: lấy từ `movies` (`viewCount`, `voteCount`, `voteAverage`).

#### c) `POST /api/movies/:id/view` — Optional JWT

Response 200:
```json
{
  "success": true,
  "statusCode": 200,
  "message": "Incremented view count successfully",
  "result": {
    "viewCount": 1235,
    "score": 1,
    "interaction": "created | updated | none"
  }
}
```
- Guest: `score = 0`, `interaction = "none"` (chỉ tăng viewCount).
- User login, chưa có click: tạo interaction, `score = 1`, `interaction = "created"` → publish MQ.
- User login, đã có click: **update ghi đè**, `score = min(5, score + 1)` (tăng độ tin cậy), `interaction = "updated"` — **không publish lại**; AI nhận confidence mới qua `training.batch`.

#### d) `GET /api/interactions/my-favorites` — JWT

- Giữ nguyên path, **chỉ trả `type = like`** (path cũ để không phá route; nhãn UI "Phim yêu thích").
- `GET /api/interactions/my-history` giữ nguyên (`type = click`).

### 3.3. WebSocket (Socket.IO, cùng cổng 8081)

Giữ các event cũ (đã realtime): `movie-{id}-comment`, `movie-{id}-rating`, `movie-{id}-viewCount`, `movie-{id}-typing`.

**Thêm 1 event thống nhất cho tương tác (chỉ dùng ở trang chi tiết):**

| Server → Client | Payload |
|---|---|
| `movie-{movieId}-interaction` | `{ movieId, type, action, score, likeCount, commentCount, viewCount }` |

- Phát sau: toggle like (added/removed), tạo comment, tăng view (nếu có thay đổi tương tác).
- `rating` tiếp tục dùng `movie-{id}-rating` (đã có `movieStats`) — **không phát trùng** trong `-interaction` để tránh cập nhật 2 lần.
- Broadcast công khai, **không chứa userId/email**.

### 3.4. RabbitMQ

- Exchange `interaction.exchange`, routing key `interaction.event`.
- **Sửa `eventType`**: `interaction.created` (thay vì `interaction.event`), routing key vẫn `interaction.event` để tương thích binding hiện tại.
  → `EventPublisherService.publish()` thêm tham số `routingKey?` (mặc định = `eventType`).
- Payload:
```json
{
  "userId": "uuid",
  "movieId": 123,
  "action": "click | like | comment | rating",
  "score": 5,
  "removed": false,
  "createdAt": "2026-10-26T10:00:00.000Z"
}
```
- Bỏ like: `score = -5`, `removed = true`.
- **Rating publish** với `action = "rating"`, `score = số sao` (1..5).
- **Comment publish** với `action = "comment"`, `score = 4`.
- **Click publish** chỉ khi tạo mới interaction (`action = "click"`, `score = 1`). Khi user xem lại: update `score = min(5, score + 1)` nhưng **không publish lại** (tránh spam); AI nhận confidence mới qua `training.batch`.
- `training.batch`: giữ nguyên, nhưng seed score đổi từ `rating * 2` → `rating` (band 5).

### 3.5. ai-service — chuẩn hoá band 5

- Handler chấp nhận cả `interaction.created` (mới) và `interaction.event` (legacy).
- **Ưu tiên `payload.score`** do backend tính. Fallback: `like=5`, `comment=4`, `click=1`, `rating=rating|score`.
- Bỏ map `favorite/dislike/watchlist/watch`.
- Chuẩn hoá: `normalized = clamp(score / 5.0, -1.0, 1.0)` dùng cho cả semantic profile và CF profile (thay 2 chỗ `/10.0`).
- `model_training_service`: ma trận ALS dùng `rating` nếu có, ngược lại dùng `score` (clip 0.1..5); chỉ `1.0` khi không có cả hai.

### 3.6. Unique index

- `type` là cột varchar → `synchronize` không tự xoá giá trị enum cũ; **nhưng DB hiện không có dữ liệu `dislike/favorite/watchlist`** nên không cần script migrate.
- Đổi `@Index(['user','movie','type'], { unique: true })` → **index thường** (không unique) để cho phép nhiều comment/movie; uniqueness của like được enforce ở service (`findByUnique`).
- Click upsert dùng `findByUnique(user, movie, 'click')` rồi update thay vì bỏ qua.

### 3.7. Realtime phía frontend (trang chi tiết)

- **1 socket dùng chung** cho cả trang: refactor `useMovieSocket` dùng `getSharedSocket()` (đã có sẵn cho typing), thêm option `enabled` và handler `onInteraction`. Mỗi component vẫn `on/off` listener riêng → 1 connection, nhiều subscription.
- `useMovieInteractionStats(movieId, enabled)`:
  - `GET /api/interactions/stats/:movieId` (React Query key `['interactions','stats',movieId]`).
  - Subscribe `movie-{id}-interaction` → `queryClient.setQueryData` cập nhật `likeCount/commentCount/viewCount` (không refetch).
  - Chỉ bật ở `variant="detail"` để card trong danh sách không mở socket/query.
- `MovieActions`:
  - Chỉ còn **1 nút Yêu thích** (Heart) cho cả card & detail.
  - Detail hiển thị **số like** cạnh nút; **không** hiển thị score/"+điểm" (score là độ tin cậy nội bộ).
  - Card không hiển thị số (tránh N request).
- `MovieViewCount`: cập nhật realtime như hiện tại; không hiển thị score.
- Bỏ hàng `MovieActions` trùng trong `movie-detail-view.tsx`; giữ 1 chỗ duy nhất trong `movie-detail.tsx`.
- Giữ optimistic update cho like (đúng `FRONTEND_RULES`), rollback `onError`, invalidate `my-favorites` sau khi server trả.

---

## 4. Phạm vi

### Trong phạm vi
- [x] Backend: entity/enum/score map/DTO/service/controller/repository, WS gateway, MQ producer, comment/rating/movie call sites.
- [x] ai-service: consumer + scoring + training score.
- [x] Frontend: types, api, hooks, components movie detail/card/comments/stats, trang my-favorites, admin badge.
- [x] Docs hiện trạng + plan index.

### Ngoài phạm vi (ghi nhận, không làm trong plan này)
- Notification realtime; admin dashboard realtime.
- Phân quyền socket / personal room (like realtime chỉ đồng bộ số đếm, không đồng bộ trạng thái like giữa nhiều tab của cùng user).
- Sửa lỗi rating update (`PUT /ratings/:id`) không cập nhật bảng interactions (ghi chú rủi ro).
- Semantic search/Phase 4 của V11.
- Đổi `docs/BACKEND_RULES.md`, `docs/FRONTEND_RULES.md` (read-only).

---

## 5. Các phase & task

### Phase 0 — Data model & band 5 (backend)

- [x] `interaction.entity.ts`:
  - Enum còn `LIKE, RATING, COMMENT, CLICK`.
  - `InteractionScoreMap = { like: 5, comment: 4, click: 1, rating: 0 }`.
  - Index `(user, movie, type)` → **non-unique**.
- [x] `create-interaction.dto.ts`: bỏ `score`; `type` chỉ nhận `like`, `movieId` giữ `@IsNumber()`.
- [x] `update-interaction.dto.ts` giữ `PartialType` (tự cập nhật theo DTO mới).
- [x] `interactions.service.ts`: chỉ toggle `like`; score lấy từ map; trả `{ action, type, score, likeCount, data? }`; inject `EventsGateway`.
- [x] `interactions.repository.ts`: thêm `countByMovieAndType(movieId, type)`; giữ `findByUnique`.
- [x] `import-data.seed.ts:229`: `score: Number(row.rating)` (bỏ `* 2`).
- [x] Rà soát toàn bộ backend còn tham chiếu `FAVORITE/WATCHLIST/DISLIKE` → xoá.

### Phase 1 — Backend API (interactions/stats/view)

- [x] `interactions.controller.ts`:
  - `POST /interactions` trả envelope phẳng theo mục 3.2a, `statusCode: 200`.
  - Thêm `GET /interactions/stats/:movieId` (Public) — **đặt trước route `:id`** để không bị match nhầm.
  - `GET my-favorites` message/description cập nhật "yêu thích (like)".
- [x] `interactions.service.ts`: thêm `getMovieStats(movieId)` dùng `DataSource`:
  - count like từ `interactions`;
  - count comment từ `comments`;
  - đọc `viewCount`, `voteCount`, `voteAverage` từ `movies`;
  - phim không tồn tại → `NotFoundException` (envelope lỗi chuẩn).
- [x] `movies.service.ts` `incrementViewCount`:
  - Luôn +`viewCount` (guest & user).
  - Guest: không tạo interaction, `score = 0`, `interaction = "none"`.
  - User login:
    - chưa có click → **tạo mới**, `score = 1`, `interaction = "created"` → publish MQ + WS.
    - đã có click → **update ghi đè** `score = min(5, score + 1)`, cập nhật `updatedAt`, `interaction = "updated"`; **không publish MQ**, vẫn emit WS viewCount.
  - Trả `{ viewCount, score, interaction }`.
- [x] `movies.controller.ts`: giữ envelope, chỉ đổi `result` theo service (không đổi path/method).
- [x] `interactions.service.getFavorites`: chỉ `[InteractionType.LIKE]`.

### Phase 2 — Backend realtime (Socket.IO)

- [x] `events.gateway.ts`: thêm
  ```ts
  broadcastInteraction(movieId: number, payload: {
    movieId: number; type: string; action: 'added'|'removed';
    score: number; likeCount: number; commentCount: number; viewCount: number;
  }) { this.server.emit(`movie-${movieId}-interaction`, payload); }
  ```
- [x] `interactions.service.ts`: sau toggle like → tính `likeCount` + `commentCount` + `viewCount` → `broadcastInteraction`.
- [x] `comments.service.ts`: sau khi transaction commit → `broadcastInteraction` (type `comment`, score 4) + `broadcastComment` (giữ nguyên).
- [x] `movies.service.ts`: sau khi tăng view → `broadcastInteraction` (type `click`, score 1/0) + `broadcastViewCount` (giữ nguyên).
- [x] `ratings.service.ts`: giữ `broadcastRating` hiện tại (đã realtime), không thêm `-interaction`.
- [x] Đảm bảo `CommentsModule`, `RatingsModule`, `MoviesModule`, `InteractionsModule` import `EventsModule`.

### Phase 3 — RabbitMQ

- [x] `event.types.ts`: `InteractionCreatedPayload` thêm `removed: boolean` (bắt buộc) — cập nhật mọi call site.
- [x] `event-publisher.service.ts`: `publish(exchange, eventType, payload, correlationId?, routingKey?)`; dùng `routingKey ?? eventType` khi `channelWrapper.publish`.
- [x] `interaction.producer.ts`: `publishInteractionCreated` gọi `publish(..., 'interaction.created', payload, correlationId, 'interaction.event')`.
- [x] `interactions.service.ts`: publish khi **added** (`score 5, removed false`) và khi **removed** (`score -5, removed true`).
- [x] `comments.service.ts`: inject `InteractionProducer`, publish `{ action: 'comment', score: 4, removed: false }` sau commit.
- [x] `ratings.service.ts`: inject `InteractionProducer`, publish `{ action: 'rating', score: rating, removed: false }` sau commit.
- [x] `movies.service.ts`: inject `InteractionProducer`, publish `{ action: 'click', score: 1, removed: false }` khi **tạo mới** interaction click (không publish khi update).
- [x] `interaction.cron.ts`: payload bổ sung `removed: false`; seed score đã band 5.

### Phase 4 — ai-service

- [x] `interaction_event_handler.py`:
  - `handle`: nhận `interaction.created` **hoặc** `interaction.event`.
  - `_get_action_score`: ưu tiên `payload['score']`; fallback `like=5, comment=4, click=1, rating=rating|score`; bỏ `favorite/dislike/watchlist/watch`.
  - `_normalize_score(score)` = `max(-1.0, min(1.0, score / 5.0))`.
  - `_update_semantic_profile` & `_update_cf_profile` dùng `_normalize_score` (bỏ `/10.0`).
  - Log rõ `removed` và `action` để dễ debug.
- [x] `model_training_service.py:127-131`: `rating` → `score` → `1.0`; `score` clip `0.1..5`.
- [ ] (Nếu có) thêm `ai-service/tests/unit/test_interaction_score.py` (band 5 + normalize + removed).

### Phase 5 — Frontend

- [x] `shared/types/interaction.types.ts`:
  - `InteractionType = 'like' | 'rating' | 'comment' | 'click'`.
  - `ToggleInteractionResult = { action; type; score: number; likeCount: number; data?: Interaction }`.
  - Thêm `InteractionStats = { movieId; likeCount; commentCount; viewCount; ratingCount; voteAverage }`.
- [x] `apis/interaction.api.ts`: `toggle({ type: 'like'; movieId })`; thêm `getStats(movieId)` → `GET /interactions/stats/:movieId`; cập nhật doc `my-favorites` (chỉ like).
- [x] `apis/movie.api.ts`: `incrementView` trả `{ viewCount, score, interaction }`.
- [x] `hooks/tankstack/useInteraction.ts`:
  - `useToggleInteraction` đọc `score`, `likeCount` (không hiển thị score); toast "Đã thêm/bỏ yêu thích"; invalidate stats query + my-favorites.
  - Thêm `useInteractionStats(movieId, enabled)`.
  - Doc/type cập nhật bỏ favorite/watchlist.
- [x] `hooks/useMovieSocket.ts`:
  - Dùng `getSharedSocket()` (1 connection) thay vì tạo mới mỗi hook.
  - Thêm `enabled?: boolean`, `onInteraction?: (payload) => void`.
  - Subscribe/unsubscribe `movie-{id}-interaction`.
- [x] `components/movie/movie-actions.tsx`:
  - Bỏ `favorite`, `watchlist`, `dislike`; còn **1 nút Heart "Yêu thích"**.
  - Detail: hiển thị số like; **không** hiển thị score.
  - Card: chỉ nút, không query/socket.
- [x] `components/movie/movie-detail-view.tsx`: bỏ hàng `MovieActions` trùng (dòng 114-120), chỉ còn text hướng dẫn.
- [x] `components/movie/movie-detail.tsx`: giữ `MovieActions variant="detail"` (1 chỗ duy nhất).
- [x] `components/movie/movie-view-count.tsx`: giữ realtime; không hiển thị score.
- [x] `hooks/tankstack/useMovie.ts`: `useIncrementView` cập nhật cache `['movie', id]` (`viewCount`), bỏ toast score.
- [x] `components/movie/interaction-movie-list.tsx`: `TYPE_BADGES` xoá `dislike/favorite/watchlist`; empty description "phim yêu thích".
- [x] `components/movie/movie-comments.tsx`: giữ realtime; dùng shared socket.
- [x] `components/movie/movie-rating.tsx`: giữ realtime; dùng shared socket.
- [x] `app/(main)/my-favorites/page.tsx`: title/description "Phim yêu thích" (path giữ nguyên).
- [x] `app/(admin-layout)/admin/interaction/interaction-client.tsx` + dashboard donut: chỉ còn label của 4 type (nhờ `TYPE_BADGES` cập nhật).
- [x] Rà soát comment/label còn "like/dislike/favorite/watchlist" (require-login-dialog, useRequireLogin, v.v.).

### Phase 6 — Docs & verification

- [x] `docs/BACKEND.md`: cập nhật dòng 12, 96, 233, 293-304, 325-356, 388, 432-433:
  - endpoint + request/response mới;
  - band 5 (score = độ tin cậy);
  - WS `movie-{id}-interaction`;
  - MQ payload/eventType (rating/comment/click cũng publish).
- [x] `docs/FRONTEND.md`: cập nhật dòng 137, 140, 172, 306-308 (bỏ dislike/favorite/watchlist).
- [x] `docs/AI-SERVICE.md`: thêm ghi chú consumer interaction + score band 5 + normalize.
- [x] Tạo `docs/plans/V16_backend_realtime-interaction-band5.md` (copy từ plan này) + cập nhật `docs/plans/PLAN_INDEX.md` (index 16, `next_index = 17`).
- [x] Kiểm tra:
  - backend: `npm run type-check`, `npm run build`; `npm run lint` **chỉ báo baseline**, không sửa hàng loạt.
  - ai-service: `python -m compileall src`, chạy unit test mới (nếu thêm).
  - frontend: `npx tsc --noEmit`, `npm run build`; `npx eslint` trên các file đã sửa.
- [x] Smoke test end-to-end (mục 8).

---

## 6. Luồng end-to-end sau khi hoàn thành

### Like
1. FE `POST /api/interactions {type:'like', movieId}`.
2. Backend toggle DB → `score=5` → `likeCount` → response.
3. Backend publish MQ `interaction.created {action:'like', score:5, removed:false}`.
4. Backend emit `movie-{id}-interaction`.
5. FE cập nhật số like qua WS/cache; ai-service cập nhật vector (`5/5 = 1.0`).

### Unlike
1. FE gọi lại `POST /api/interactions`.
2. Backend xoá interaction → `score=0` → response.
3. Publish MQ `{score:-5, removed:true}` + WS `action:'removed'`.
4. ai-service cập nhật vector với `-1.0`.

### Comment
1. `POST /api/comments` (transaction: comment + interaction score 4).
2. Sau commit: emit `movie-{id}-comment` + `movie-{id}-interaction`.
3. Publish MQ `{action:'comment', score:4, removed:false}`.
4. FE thêm/invalidate comment + cập nhật `commentCount`.

### View
1. `POST /api/movies/:id/view` (Optional JWT).
2. Luôn tăng `viewCount`.
3. Guest: không interaction.
4. User login chưa có click: tạo interaction click (`score = 1`) → emit WS + publish MQ.
5. User login đã có click: update ghi đè `score = min(5, score + 1)` → emit WS viewCount, **không publish lại** (không tạo dòng mới).
6. FE nhận `{viewCount, score, interaction}`, cập nhật realtime.

### Rating
1. `POST /api/ratings` (transaction: rating + interaction score = số sao).
2. Cập nhật `voteCount/voteAverage` của movie.
3. Emit `movie-{id}-rating` (đã có).
4. **Publish MQ** `{action:'rating', score: số sao, removed:false}`.
5. FE cập nhật realtime như hiện tại.

---

## 7. Rủi ro & cách xử lý

| Rủi ro | Xử lý |
|---|---|
| Nới unique index có thể tạo like trùng | Service vẫn check `findByUnique(user, movie, 'like')` trước khi tạo; toggle đảm bảo 1 like/user/movie. |
| Comment lần 2 bị chặn bởi index cũ | Đổi index non-unique + comment service tạo interaction mới mỗi comment. |
| Broadcast trong transaction có thể phát dữ liệu rollback | Chỉ broadcast/publish **sau khi transaction commit**. |
| Publish click lặp lại gây spam AI | Chỉ publish khi **tạo mới** click; update ghi đè tăng `score = min(5, score + 1)` nhưng **không publish lại**; AI nhận confidence mới qua `training.batch`. |
| Rating update (`PUT /ratings/:id`) không đồng bộ interaction | Ghi nhận ngoài phạm vi; nếu cần sẽ xử lý ở plan sau. |
| `synchronize: true` thay đổi index trên DB đang chạy | Deploy ngoài giờ cao điểm; backup DB; kiểm tra log TypeORM. |
| Score bị hiểu nhầm là điểm thưởng | Ghi rõ trong docs/comment code: score = confidence band 1..5, UI không hiển thị. |
| Rule docs còn nhắc `favorite/watchlist` | `BACKEND_RULES.md`/`FRONTEND_RULES.md` read-only → không sửa, ghi chú trong plan. |

---

## 8. Tiêu chí hoàn thành (DoD)

- [x] Không còn `dislike`, `favorite`, `watchlist` trong code/docs hiện trạng (trừ docs rules read-only).
- [x] `InteractionScoreMap` band 5; seed không còn `* 2`; ai-service không còn `/10.0`.
- [x] `POST /api/interactions` nhận `{type:'like', movieId}` **không cần score**, trả `action/type/score/likeCount`; toggle added/removed đúng.
- [x] `GET /api/interactions/stats/:movieId` trả đủ 6 chỉ số.
- [x] `POST /api/movies/:id/view`: viewCount luôn tăng; user login tạo click `score=1` / xem lại tăng `score=min(5, score+1)` (không publish lại); guest không tạo interaction; trả `score` + `interaction`.
- [x] Like/comment/view phát WS `movie-{id}-interaction`; FE trang chi tiết cập nhật không F5.
- [x] **Like/comment/click/rating đều publish RabbitMQ** khi interaction được tạo; bỏ like publish `removed=true`.
- [x] ai-service nhận đúng event, cập nhật vector với score band 5 (kể cả `removed`).
- [x] Training ALS dùng `score` khi không có `rating`.
- [x] Frontend chỉ còn 1 nút Yêu thích; không còn UI dislike/favorite/watchlist; số like realtime ở trang chi tiết.
- [x] Không hiển thị score như điểm thưởng.
- [x] Envelope API đúng `docs/BACKEND_RULES.md`.
- [x] `tsc --noEmit` + build pass (không phát sinh lỗi mới ngoài baseline đã biết).
- [x] `docs/BACKEND.md`, `docs/FRONTEND.md`, `docs/AI-SERVICE.md`, `docs/plans/PLAN_INDEX.md` cập nhật.

---

## 9. Checklist smoke test tay

1. User A đăng nhập, mở chi tiết phim → `viewCount` tăng; DB có 1 dòng interaction `click` với `score=1`; MQ có message `action=click, score=1`.
2. User A mở lại cùng phim lần 2, 3, 4, 5, 6 → `viewCount` tăng; dòng click **update** `score = 2, 3, 4, 5, 5` (cap 5, không nhân đôi dòng); **không có message MQ mới**.
3. Guest mở phim → `viewCount` tăng, không có dòng interaction, không MQ.
4. Bấm Yêu thích → nút active, số like +1; tab ẩn danh cùng phim cập nhật realtime.
5. Bấm Bỏ yêu thích → số like -1; DB xoá row like; MQ log `score=-5, removed=true`.
6. User A bình luận → user B đang mở cùng phim thấy comment mới + `commentCount` tăng ngay; MQ có `action=comment, score=4`.
7. User A đánh giá 4 sao → user B thấy `voteAverage/voteCount` đổi ngay; MQ có `action=rating, score=4`.
8. Kiểm tra RabbitMQ management: `interaction.event` có message đúng payload; ai-service log cập nhật vector (không còn "Unsupported event type").
9. `GET /api/interactions/my-favorites` chỉ trả `like`; `my-history` chỉ `click`.
10. Admin → tab Tương tác: badge chỉ còn 4 loại; dashboard donut không còn nhãn cũ.

### 9.1 Kết quả smoke test (2026-10-26, môi trường dev)

- `GET /api/interactions/stats/3` baseline: `{likeCount:0, commentCount:0, viewCount:0, ratingCount:441, voteAverage:6.467}`.
- `POST /api/movies/3/view` (admin): trả `{viewCount:1, score:1, interaction:'created'}`; WS nhận `movie-3-viewCount` + `movie-3-interaction` (`click`, `score=1`).
- Like: thêm trả `{action:'added', score:5, likeCount:1}`; bỏ trả `{action:'removed', score:0, likeCount:0}`; WS nhận `score=5` rồi `score=-5`.
- Comment: WS nhận `movie-3-comment` + `movie-3-interaction` (`comment`, `score=4`); stats `commentCount=1`.
- Rating 4 sao: WS nhận `movie-3-rating` (kèm `movieStats`) + interaction `score=4`; stats `voteAverage=4`, `ratingCount=1` (ghi nhận hành vi cũ: rating app ghi đè aggregate TMDB — ngoài scope).
- RabbitMQ: bật ai-service thấy `interaction.queue`; log `Received [Interaction] ... Routing Key: interaction.event`; queue về 0. User test chưa có trong CF mapping → log cold-start skip CF (đúng thiết kế).
- Dọn dữ liệu test: xoá comment/rating/interaction của admin ở phim 3, khôi phục `view_count/vote_count/vote_average`.

---

## 10. Quyết định đã chốt (developer, 2026-10-26)

1. **Bảng score (confidence) band 5**: `like=5`, `comment=4`, `click=1 → 5` (tăng dần), `rating = số sao user nhập (1..5)`.
2. **`score` là độ tin cậy**, không phải điểm thưởng UI → FE không gửi score, không hiển thị "+điểm".
3. **Không có dữ liệu cũ** → không migrate; chỉ bỏ type khỏi code và nới unique index.
4. **Realtime ở trang chi tiết** phim.
5. **Rating và comment đều tạo interaction + publish RabbitMQ**.
6. **Click**: viewCount luôn tăng (guest & user); guest không tạo interaction; user login tạo click `score=1` khi chưa có; đã có thì **update ghi đè** `score = min(5, score + 1)`.
7. **Click update không publish lại MQ** (tránh spam AI); AI nhận confidence mới qua `training.batch`.
8. **Rating publish** `score = số sao`; **comment publish** `score = 4`; **like publish** `score = 5`, bỏ like `score = -5, removed = true`.

> Plan đã triển khai xong Phase 0 → 6 và smoke test E2E; `docs/plans/PLAN_INDEX.md` đã có index 16, `next_index = 17`.
