# V38 — Search event, user vectors & genre preference (cập nhật yêu cầu)

> File plan này là bản cập nhật cuối cùng theo yêu cầu bổ sung ngày 2026-11-21.
> Bản mirror: `C:\Users\THUYEN\.opencode\plan\V38_ai_search-history-user-vectors.md`.
> Các thay đổi bên dưới **đã áp vào code** và đã qua gate ngày 2026-11-21.
>
> **Cập nhật cuối:** mọi tương tác frontend (`click`/`view`, `like`, `rating`, `comment`) đều gửi `genres` dạng `{id, name}` và publish `user.genre.update`; backend gửi score gốc + `type`, ai-service tự chuẩn hoá/clamp cho genre. Score vector user/movie trong interaction handler giữ nguyên mapping cũ, rating dùng score gốc.

## 1. Trạng thái

| Trường | Giá trị |
|---|---|
| Trạng thái | **HOÀN THÀNH** (2026-11-21) |
| Người thực hiện | AI agent |
| Ngày cập nhật | 2026-11-21 |
| Scope | `ai` + backend producer / Redis job |
| Plan độc lập | Có. V37 là nền tảng cache/lock/stats, không block V38 |
| Ràng buộc | Không sửa `searchLexicalSemanticRerank*`, không đổi API envelope/cursor, **không commit** |

---

## 2. Yêu cầu gốc (giữ lại để đối chiếu)

- Không lưu lịch sử search của user vào DB hoặc Redis.
- Search có kết quả → phát event qua queue để ai-service cập nhật user vector.
- ai-service chuẩn hoá keyword → embed → lưu collection `user_search_vectors`.
- Tách nguồn vector user: long_term, short_term, search, genre; **tắt semantic profile/CBF**.
- `interaction.created` và `user.created/updated.profile` đều cập nhật long-term + short-term.
- ForYou/iALS fusion tất cả nguồn, thiếu nguồn thì normalize lại trọng số.
- Genre: backend cron lấy movie phổ biến theo genre; ai-service dùng ma trận genre để rank phim.
- Không tạo file test mới cho file nguồn mới; chỉ cập nhật spec hiện hữu.

---

## 3. Các quyết định đã chốt (không hỏi lại)

| # | Quyết định | Giá trị chốt |
|---|---|---|
| 1 | Guest search | Không lưu history, **không emit event**. Chỉ user JWT. |
| 2 | `/api/movies/search` | Có tính, emit với `mode: 'db'`. |
| 3 | Lưu history | **Không DB, không Redis.** Search có kết quả → đúng 1 event. |
| 4 | Payload event search | **4 field trong `payload`:** `userId`, `mode`, `keywordRaw`, `keywordNormalized`. Chỉ `occurredAt`, `correlationId` nằm ở **envelope**. |
| 5 | Format keyword | `NFC → lowercase → bỏ dấu → thay teencode → lọc stopword → bỏ punctuation → gộp whitespace`. Backend normalize trước publish; ai-service normalize lại (idempotent) trước embed. |
| 6 | Vị trí publish search | **Service tự publish**, controller chỉ map DTO/trả envelope. Không để controller điều phối service. |
| 7 | Load-more/phân trang | Không emit lại. Chỉ request đầu: không `cursor`, `page = 1`. |
| 8 | Genre stats ở Redis | Chỉ 2 key: `cache:stats:genre:ids` và `cache:stats:genre:{genreId}:movies`. Top 50–100 movieId/theo `viewCount`; **ô matrix = 1** nếu có quan hệ genre↔movie. Không dùng số view làm score. |
| 9 | Key Redis bị bỏ | Bỏ `cache:stats:genre:movie:{movieId}` và bỏ `user:genre:vector:{userId}`. Không lưu score genre của user trong Redis. |
| 10 | Ma trận trong ai-service | ai-service đọc 2 key Redis → build ma trận movie↔genre → cache trong **RAM/file**, reload sau khi cron đổi. Không gọi HTTP backend lúc inference. |
| 11 | User genre payload | **Collection `user_genre_vectors`**, metadata `genre_scores` dạng JSON `{genreId: score}`. Vector chỉ giữ nguyên/placeholder, không dùng. |
| 12 | Interaction payload | Frontend gửi thêm `genres: [{ id, name }]` trong payload tương tác. Backend publish **event riêng** `user.genre.update`, **không gộp** vào `interaction.created`. |
| 13 | Cập nhật genre weight | Backend gửi `type` + score gốc. ai-service tự chuẩn hoá theo type: rating `(rating-3)/2`, các loại khác `score/5`, clamp `[-1,1]`; sau đó `w[g] = clamp(w[g] + 0.05 * score_norm / max(1, |genres|), -1, 1)`. |
| 14 | Comment rule | Mọi hàm/file mới phải có JSDoc/docstring: **chức năng → cách hoạt động → `@returns`**. Thêm rule này vào `docs/CODE_RULES.md` và rule liên quan. Không note/giải thích lịch sử/so sánh code cũ. |
| 15 | Test | Không tạo test file mới. Chỉ cập nhật spec hiện hữu để chúng tiếp tục chạy. |
| 16 | Trọng số ForYou | Theo mục 7. Đã bỏ CBF/profile; chỉ còn CF + long-term + short-term + search + genre (payload `user_genre_vectors`). |

---

## 4. Kiến trúc đích

### 4.1 Search write — service làm chủ

```text
FE search
  → controller validate DTO, gọi service
  → service.search(...) trả {result, pagination}
  → nếu first-page && user JWT && result.length > 0:
      SearchEventService.publish(userId, mode, keywordRaw, keywordNormalized)
  → controller chỉ map sang envelope chuẩn
```

Event envelope chốt:

```json
{
  "eventId": "uuid",
  "eventType": "user.search",
  "eventVersion": 1,
  "source": "backend",
  "occurredAt": "2026-11-21T...Z",
  "correlationId": "uuid",
  "userId": "12",
  "payload": {
    "mode": "semantic",
    "keywordRaw": "phim kinh dị   2024",
    "keywordNormalized": "phim kinh di 2024"
  }
}
```

Không có `resultIds`, `resultCount`, `occurredAt`, `correlationId` trong `payload`.

### 4.2 Genre stats — backend cron

```text
cron 01:00 (RedisLockService)
  → query DB movie_genres + bảng/counter viewCount
  → với mỗi genreId: sort movie theo viewCount desc
  → giữ top 100 (cho phép 50)
  → ghi ZSET cache:stats:genre:{genreId}:movies với score = 1 cho mỗi movieId
  → ghi SET cache:stats:genre:ids
  → pipeline temp key + RENAME + TTL 12h
```

### 4.3 AI cache + ma trận

```text
startup / reload trigger
  → đọc 2 key Redis
  → matrix[movieId] = {genreId: 1, ...}
  → cache trong RAM/file của ai-service
  → hybrid: lấy payload {genreId: score} → dựng vector đúng dimension matrix → cosine → điểm movieId
```

### 4.4 Interaction → user genre payload

```text
FE gửi interaction.created kèm genres: [{id, name}]
  → backend lưu interaction như cũ
  → backend publish 2 event độc lập:
      1) interaction.created (không gộp genres)
      2) user.genre.update {userId, type, genres, score gốc}
  → InteractionEventHandler:
      user_long_term_vectors (score > 0)
      user_short_term_vectors (mọi score)
      user_search_vectors    (chỉ do search event cập nhật)
  → UserEventHandler (user.created/updated.profile):
      user_long_term_vectors + user_short_term_vectors (EMA từ preferenceData)
  → user_profile_vectors: TẮT, không ghi mới
  → GenreEventHandler:
      cập nhật metadata genre_scores của user trong user_genre_vectors
      theo công thức mục 3/#13
```

Không tra `cache:stats:genre:movie:{movieId}` trong handler nữa — đó là nguyên nhân genre bị `skip` khi phim chưa nằm top list.

---

## 5. Hợp đồng lưu trữ

### 5.1 Redis

| Key | Type | TTL | Writer | Reader |
|---|---|---|---|---|
| `cache:stats:genre:ids` | SET | 12h | backend cron | ai-service |
| `cache:stats:genre:{genreId}:movies` | ZSET (`score = 1`) | 12h | backend cron | ai-service |

Constants:

```ts
GENRE_MATRIX_TTL_SECONDS = 12 * 60 * 60;
TOP_MOVIES_PER_GENRE = 100;
GENRE_MATRIX_CRON = '0 1 * * *';
```

```python
GENRE_WEIGHT_ALPHA = 0.05
GENRE_WEIGHT_MIN = -1.0
GENRE_WEIGHT_MAX = 1.0
GENRE_MIN_ABS_WEIGHT = 0.05
```

### 5.2 Chroma collections

Đặc tả đầy đủ payload/công thức từng vector ở **mục 7**.

| Collection | Nguồn cập nhật |
|---|---|
| `user_profile_vectors` | **legacy — không ghi mới**; vẫn xoá khi `user.deleted` |
| `user_long_term_vectors` | interaction có score > 0 + search + `user.created/updated.profile` |
| `user_short_term_vectors` | mọi interaction + `user.created/updated.profile` |
| `user_search_vectors` | `user.search` |
| `user_genre_vectors` | `user.genre.update` — metadata `genre_scores` `{genreId: score}` |

`user.deleted` phải xoá toàn bộ 5 collection vector (gồm `user_profile_vectors` legacy và `user_genre_vectors`).

### 5.3 Queue events

| EventType | Envelope | Payload |
|---|---|---|
| `user.search` | envelope chuẩn (không `userId`) | `userId`, `mode`, `keywordRaw`, `keywordNormalized` |
| `user.genre.update` | `userId` + envelope chuẩn | `type`, `genres: [{id, name}]`, `score` gốc |
| `interaction.created` | envelope chuẩn | Giữ nguyên; frontend có thể gửi thêm `genres` nhưng handler không dùng field này |

---

## 6. Phase triển khai lại

### Phase 0 — Rule & guardrail `[x]`

- [x] Thêm rule comment vào `docs/CODE_RULES.md`: JSDoc/docstring gồm chức năng, cách hoạt động, `@returns`; áp cho mọi hàm/file mới.
- [x] Không đụng `searchLexicalSemanticRerank*`, V37, `USER_VECTOR.md`, performance test.
- [x] Không tạo file test mới; chỉ cập nhật spec hiện hữu.

### Phase 1 — Backend: search producer trong service `[x]`

- [x] Chuyển hook publish từ `recommendations.controller.ts` / `movies.controller.ts` vào service tương ứng.
- [x] Controller chỉ giữ validate DTO + trả envelope.
- [x] Giữ rule first-page-only + chỉ publish khi `result.length > 0`.
- [x] `payload` gồm `userId`, `mode`, `keywordRaw`, `keywordNormalized`; không đưa `userId` lên envelope.
- [x] `normalizeKeyword()` theo format mục 3/#5.

### Phase 2 — Backend: genre cron `[x]`

- [x] Chỉ giữ 2 key Redis; xoá reverse key `genre:movie:{movieId}` khỏi contract/code.
- [x] ZSET dùng `score = 1`, top 100 theo `viewCount`.
- [x] Giữ cron 01:00 + Redis lock + TTL 12h + atomic rename.

### Phase 3 — Backend: interaction genre event `[x]`

- [x] DTO interaction chấp nhận `genres: [{id, name}]` từ frontend.
- [x] Frontend chỉ gửi `{id, name}` cho genre (không gửi `enName`/field thừa) trước khi gọi API tương tác.
- [x] `CreateRatingDto`, `CreateCommentDto`, `RecordViewDto` nhận `genres`; frontend gửi kèm ở click/view, like, rating, comment.
- [x] Publish `user.genre.update` độc lập, không gộp vào `interaction.created`, cho cả 4 loại tương tác.
- [x] Backend gửi score gốc (`click=1`, `comment=4`, `like=5`, `rating=0..5`) + `type`; ai-service chuẩn hoá riêng cho genre (rating âm theo `(rating-3)/2`, loại khác `0..1`).
- [x] Không hardcode score `5`; không ghi Redis/DB bổ sung cho genre weight ở backend.

### Phase 4 — AI: search + user vector collections `[x]`

- [x] Schema `UserSearchEvent` payload 4 field; đọc `userId` từ payload.
- [x] `SearchEventConsumer` normalize lại rồi upsert `user_search_vectors` + long_term.
- [x] Tắt ghi `user_profile_vectors`; interaction chỉ ghi long-term/short-term.
- [x] `user.created/updated.profile` embed preference rồi trộn EMA vào long-term + short-term.
- [x] ForYou bỏ nguồn CBF/profile; chỉ còn CF + LONG_TERM + SHORT_TERM + SEARCH + GENRE.
- [x] `user.deleted` xoá 5 collection vector (gồm profile legacy và genre payload).

### Phase 5 — AI: genre cache + payload collection `[x]`

- [x] Đọc 2 key Redis, build ma trận movie↔genre (`score = 1`), cache RAM/file.
- [x] Reload cache sau cron/khi key đổi; không HTTP backend.
- [x] Lưu payload `{genreId: score}` vào metadata `genre_scores` của collection `user_genre_vectors`; không lưu score genre trong Redis.
- [x] `GenreEventHandler` consume `user.genre.update`, cập nhật payload theo công thức mục 3/#13.
- [x] Khi gợi ý, dựng vector user cùng dimension `matrix.genre_ids` từ payload.
- [x] Bỏ logic tra reverse key trong `InteractionEventHandler`.

### Phase 6 — AI: ForYou aggregator `[x]`

- [x] `UserVectorAggregatorService` gồm CF + long + short + search + **genre từ payload `user_genre_vectors`**; không còn CBF/profile.
- [x] Giữ nguyên response shape/cursor của `/hybrid`.
- [x] Không import/sửa `search_rerank_service.py`.

### Phase 7 — Docs & gates `[x]`

- [x] Cập nhật `docs/BACKEND.md`, `docs/AI-SERVICE.md` theo hợp đồng mới.
- [x] Cập nhật `docs/plans/PLAN_INDEX.md`.
- [x] Gates: backend `type-check`/`lint`/`test`/`build`; ai-service `pytest` + `black`/`isort` trên file thay đổi.
- [x] Không commit.

---

## 7. Đặc tả vector user & trọng số ForYou

### 7.1 Danh sách collection và vòng đời

| Collection | Loại vector | Chroma id | Trạng thái | Ghi bởi event | Nguồn dữ liệu |
|---|---|---|---|---|---|
| `user_long_term_vectors` | Dense, cùng chiều embedding model | `userId` | Đang dùng | `interaction.created` / `interaction.event`; `user.search`; `user.created` / `user.updated.profile` | Movie vector + score; keyword search; `preferenceData` |
| `user_short_term_vectors` | Dense, cùng chiều embedding model | `userId` | Đang dùng | `interaction.created` / `interaction.event`; `user.created` / `user.updated.profile` | Movie vector + score; `preferenceData` |
| `user_search_vectors` | Dense, cùng chiều embedding model | `userId` | Đang dùng | `user.search` | Keyword đã normalize |
| `user_genre_vectors` | Metadata `genre_scores` JSON `{genreId: score}` | `userId` | Đang dùng | `user.genre.update` | `type` + `genres: [{id, name}]` + score gốc |
| `user_profile_vectors` | Dense legacy | `userId` | **Không ghi/không đọc trong ForYou** | — | Chỉ còn xoá khi `user.deleted` để dọn dữ liệu cũ |

Quy ước payload chung của vector user:

```json
{
  "user_id": "<userId>",
  "updated_from": "interaction | user_search | user.profile | genre_event"
}
```

- `user_search_vectors` lưu thêm metadata: `keyword`, `mode`, `occurred_at`, `correlation_id`.
- `user_genre_vectors` lưu metadata `genre_scores` là JSON `{genreId: score}`; event mới cập nhật/thêm genreId, không dùng vector để tính điểm.
- Mỗi user chỉ có **1 bản ghi hiện tại** cho mỗi collection; event mới ghi đè, không lưu lịch sử nhiều bản ghi.
- Vector user (long/short/search) lưu trong Chroma; genre cũng nằm trong Chroma nhưng chỉ dùng payload. Khi inference, genre dùng ma trận phim cache RAM/file để dựng vector user cùng dimension.

### 7.2 Công thức cập nhật từng collection

#### `user_long_term_vectors`

| Event | Điều kiện | Công thức |
|---|---|---|
| `interaction.created` / `interaction.event` | Chỉ khi `normalize(score) > 0` | `v_new = normalize((1 - 0.2) * v_old + 0.2 * normalize(score) * v_movie)` |
| `user.search` | Luôn cập nhật khi có keyword | `v_new = normalize((1 - 0.2) * v_old + 0.2 * v_keyword)` |
| `user.created` / `user.updated.profile` | Có `preferenceData` | `v_new = normalize((1 - 0.2) * v_old + 0.2 * normalize(v_preference))` |

Trong đó:
- `v_movie`: vector phim lấy từ Chroma collection `movies`.
- `v_keyword`: embedding của keyword search đã normalize.
- `v_preference`: embedding của text sinh từ `preferenceData`.
- `normalize(score) = clamp(score / 5, -1, 1)` cho vector user/movie; rating dùng score gốc (không áp quy tắc âm của genre).
- Nếu chưa có `v_old`, dùng thẳng vector nguồn đã chuẩn hoá.
- Riêng `user.created/updated.profile`: nếu `preferenceData` rỗng thì bỏ qua event, **không xoá** long-term/short-term đã học.

#### `user_short_term_vectors`

| Event | Điều kiện | Công thức |
|---|---|---|
| `interaction.created` / `interaction.event` | Mọi tương tác, kể cả `removed` hoặc score âm | `v_new = normalize((1 - 0.2) * v_old + 0.2 * normalize(score) * v_movie)` |
| `user.created` / `user.updated.profile` | Có `preferenceData` | `v_new = normalize((1 - 0.2) * v_old + 0.2 * normalize(v_preference))` |

#### `user_search_vectors`

- Chỉ ghi bởi event `user.search`; **không** ghi bởi interaction.
- Mỗi event ghi đè vector hiện tại bằng embedding keyword, kèm metadata `keyword`, `mode`, `occurred_at`, `correlation_id`.
- Không lưu lịch sử search; không ghi DB/Redis.

#### `user_genre_vectors`

- Ghi bởi event `user.genre.update` (interaction) và, từ V42, bởi `user.updated.profile` khi user chọn genre trong preferenceData.
- Với `user.updated.profile` (V42): set trực tiếp `genre_scores[id] = 1.0` cho genre có `{id,name}`, không cộng `ALPHA`, không đụng dense vector; giữ nguyên các id khác do interaction tạo ra.
- ai-service chuẩn hoá score theo `type` cho riêng `user.genre.update`: rating `clamp((rating-3)/2, -1, 1)`, các loại khác `clamp(score/5, 0, 1)`.
- Với mỗi `genreId` trong payload:
  - `w[g] = clamp(w[g] + 0.05 * score_norm / max(1, |genres|), -1, 1)`.
- Payload lưu metadata `genre_scores` JSON `{genreId: weight}`; vector chỉ giữ nguyên/placeholder nên không có ràng buộc dimension.
- Khi gợi ý genre:
  - Đọc payload, lấy `matrix.genre_ids` thực tế, dựng vector user đúng dimension matrix.
  - Bỏ genre có `abs(weight) < 0.05`.
  - Lấy tối đa 100 phim/genre từ ma trận Redis.
  - `score(movie) = cosine(user_genre_vector, movie_genre_vector)`; ma trận ô genre↔movie có giá trị `1`.

### 7.3 Trọng số ForYou (hybrid)

`UserVectorAggregatorService` fusion RRF các nguồn sau; **không còn CBF/profile**:

| Nguồn | Có CF (bình thường) | Cold start (không CF) |
|---|---:|---:|
| CF / iALS | 0.375 | 0.00 |
| `LONG_TERM` | 0.1875 | 2/15 |
| `SHORT_TERM` | 0.1875 | 5/15 |
| `SEARCH` | 0.125 | 2/15 |
| `GENRE` | 0.125 | 6/15 |
| **Tổng** | **1.00** | **1.00** |

Fallback:
- Nguồn nào không có dữ liệu thì bỏ khỏi fusion và normalize lại tổng trọng số các nguồn còn lại.
- Có CF nhưng không có vector user → `CF 0.70 + POPULAR 0.30`.
- Không có CF và không có vector user → chỉ dùng `cache:stats:popular:all`.

---

## 8. Definition of Done

- [x] Search có kết quả → đúng 1 `user.search`; payload đúng 4 field (có `userId`); không DB/Redis write trên search path.
- [x] Controller không gọi publish; service tự publish.
- [x] Redis chỉ còn 2 key genre; matrix ô = `1`, top 50/100 theo viewCount.
- [x] ai-service cache ma trận trong RAM/file, không reverse key, không HTTP backend.
- [x] Có payload `genre_scores` trong `user_genre_vectors`; cập nhật từ `user.genre.update` độc lập, không dùng vector genre.
- [x] Payload interaction có `genres: [{id, name}]` ở cả click/view, like, rating, comment.
- [x] `user.genre.update` gửi score gốc + `type`; ai-service tự chuẩn hoá/clamp cho genre; rating mới có thể âm.
- [x] Mọi hàm/file mới có docstring đúng format rule.
- [x] Không file test mới; spec hiện hữu xanh.
- [x] `/search-rerank`, envelope/cursor không đổi; không commit.

---

## 9. File dự kiến đụng

**Backend:** rule docs, `search-event.service.ts`, 2 service search, `event.types.ts`, `messaging.constants.ts`, interaction DTO/service, `cache.keys.ts`, `genre-stats-cache.service.ts`, `genre-matrix.cron.ts`, `app.module.ts`, `docs/BACKEND.md`.

**AI:** schemas, `search_event_consumer.py`, `user_event_handler.py`, `interaction_event_handler.py`, genre event handler mới, `genre_repository.py`, genre cache/matrix service, `user_vector_service.py` (thêm collection), `user_vector_aggregator_service.py`, `recommend_service.py`, `config.py`, `docs/AI-SERVICE.md`.

**Frontend:** `interaction.api.ts`, `useInteraction.ts`, `movie-actions.tsx`, `movie-detail.tsx`, `movie.api.ts`, `useMovie.ts`, `movie-detail-view.tsx`, `rating.api.ts`, `useRating.ts`, `movie-rating.tsx`, `comment.api.ts`, `useComment.ts`, `movie-comments.tsx`.

**Docs:** `docs/CODE_RULES.md`, `docs/BACKEND.md`, `docs/AI-SERVICE.md`, `docs/plans/PLAN_INDEX.md`, plan V38 này.

---

## 10. Kết quả gate (2026-11-21)

- Backend: `type-check` ✅; `lint` ✅ (0 error, chỉ warning cũ); `test --runInBand` ✅ **52 suites / 450 tests**; `build` ✅.
- ai-service: `pytest tests -q --cov=src` ✅ **580 passed**, 2 deprecation warning có sẵn, coverage 73%; `black --check` ✅ trên các file Python đã đổi (`isort` chỉ cảnh báo encoding console khi quét file tiếng Việt, không có diff).
- Frontend: `type-check` ✅; `lint` ✅ (0 error, chỉ warning cũ); `vitest run` ✅ **36 files / 277 tests**.
- Bổ sung test trong spec hiện hữu cho `user.genre.update` ở click/like/rating/comment; không tạo file test mới.
- Cache ma trận ai-service tự reload từ Redis khi quá TTL 12h (`GENRE_MATRIX_TTL_SECONDS`), không gọi HTTP backend.
- Không commit; không tạo file test mới; không đụng `USER_VECTOR.md` và performance test.
- Đính chính: `userId` nằm trong payload `user.search` (cùng keyword), không đưa lên envelope; `user.genre.update` vẫn dùng `userId` ở envelope.

---

## 11. Trạng thái bàn giao & bước tiếp theo

Đã xong trong bản này:

- Click/view, like, rating, comment đều gửi `genres` dạng `{id, name}` từ frontend; backend publish `user.genre.update` với score gốc + `type`.
- ai-service tự chuẩn hoá genre: rating `(rating-3)/2`, click/like/comment `score/5`; chỉ rating mới âm. Score vector user/movie trong interaction handler giữ nguyên.
- ai-service chuẩn hoá score cho payload genre trong `user_genre_vectors`; long-term/short-term vẫn dùng mapping interaction handler cũ.
- Test hiện hữu được bổ sung case cho cả 4 loại tương tác; không tạo file test mới.

Bước tiếp theo (ngoài phạm vi code đã xong):

1. Chạy end-to-end với RabbitMQ + Chroma thật để xác nhận event `user.genre.update` đến consumer và metadata `genre_scores` trong `user_genre_vectors` thay đổi đúng.
2. Kiểm tra dữ liệu legacy `user_profile_vectors`/`user_genre_vectors` trên môi trường thật; nếu cần thì chạy backfill hoặc dọn một lần.
3. Theo dõi log score/weight và tỉ lệ nguồn trong ForYou sau khi deploy; không cần đổi API/envelope.
