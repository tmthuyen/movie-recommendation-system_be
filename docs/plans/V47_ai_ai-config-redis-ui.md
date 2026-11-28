# V47 — AI Config động qua Redis + UI Admin

> **Trạng thái:** 🟢 Task 1 + Task 2 đã triển khai (2026-11-28), chờ QA trên stack thật
> **Người thực hiện:** AI agent
> **Thời gian lập plan:** 2026-11-28
> **Scope:** `ai` + `frontend`
> **Phạm vi file:** `ai-service/config/ai_config.yaml`, `ai-service/src/core/ai_config.py`, `ai-service/src/api/**`, `ai-service/src/services/**`, `ai-service/src/infra/messaging/**`, `frontend/src/apis/ai-config.api.ts`, `frontend/src/hooks/tankstack/admin-ai-config.ts`, `frontend/src/app/(admin-layout)/admin/ai-config/**`, `frontend/src/components/sidebar/nav-data.ts`, `docker/docker-compose*.yml`
> **Không làm:** cron job, TTL cache backend, pubsub, dynamic cron

---

# 0. Chốt lại

- Tên đúng: **AI config**, không phải “model config”.
- Không hard-code value trong Python.
- Default + metadata nằm trong **1 file YAML**.
- Redis chỉ override value.
- Class `AIConfig` đọc YAML → registry; đọc Redis → value; thiếu Redis → default YAML.
- 2 API: GET + POST AI config.
- UI `/admin/ai-config`.

---

# 1. Nguồn config

## 1.1. File default

```text
ai-service/config/ai_config.yaml
```

Chứa toàn bộ key + default + group + label + description + type + validate.

Ví dụ:

```yaml
groups:
  - id: ai.for_you.weights
    label: For You — Weights
    items:
      - key: ai.for_you.weights.CF
        label: CF weight
        description: Trọng số collaborative filtering
        type: float
        default: 0.375
        min: 0
        max: 1

      - key: ai.for_you.weights.LONG_TERM
        label: Long-term weight
        description: Trọng số vector sở thích dài hạn
        type: float
        default: 0.1875
        min: 0
        max: 1

  - id: ai.for_you.rrf
    label: For You — RRF
    items:
      - key: ai.for_you.rrf.k
        label: RRF k
        description: Hằng số làm mượt RRF
        type: int
        default: 60
        min: 1

  - id: ai.genre
    label: Genre
    items:
      - key: ai.genre.alpha
        label: Genre alpha
        description: Tốc độ cập nhật weight thể loại
        type: float
        default: 0.05
        min: 0.001
        max: 1

      - key: ai.genre.min_abs_weight
        label: Min abs weight
        description: Ngưỡng weight thể loại tối thiểu
        type: float
        default: 0.05
        min: 0

      - key: ai.genre.top_movies_per_genre
        label: Top movies / genre
        description: Số phim tối đa mỗi thể loại
        type: int
        default: 100
        min: 1

  - id: ai.training.cf
    label: Training — CF
    items:
      - key: ai.training.cf.factors
        label: ALS factors
        description: Số chiều latent factor
        type: int
        default: 64
        min: 1

      - key: ai.training.cf.alpha
        label: ALS alpha
        description: Confidence scaling
        type: float
        default: 40.0
        min: 0.1

      - key: ai.training.cf.regularization
        label: Regularization
        description: Hệ số regularization
        type: float
        default: 0.1
        min: 0

      - key: ai.training.cf.iterations
        label: Iterations
        description: Số vòng lặp ALS
        type: int
        default: 15
        min: 1

      - key: ai.training.cf.random_state
        label: Random state
        description: Seed tái lập
        type: int
        default: 42

      - key: ai.training.cf.min_user_interactions
        label: Min user interactions
        description: User tối thiểu để đưa vào train CF
        type: int
        default: 5
        min: 1

      - key: ai.training.cf.min_item_interactions
        label: Min item interactions
        description: Item tối thiểu để đưa vào train CF
        type: int
        default: 1
        min: 1
```

Các nhóm còn lại:

- `ai.for_you.cold_weights.*`
- `ai.for_you.cf_popular_weights.*`
- `ai.for_you.popular_only_weight`
- `ai.for_you.candidate_multiplier`
- `ai.for_you.segments.*`
- `ai.recommendation.ema_alpha`
- `ai.training.action_scores.*`

## 1.2. Redis override

```text
config:v1:ai          HASH   field = flat key, value = JSON
config:v1:ai:version  STRING version hiện tại
```

- Redis chỉ lưu key bị đổi.
- Key không có Redis → dùng default YAML.
- Không cache RAM, không pubsub.

## 1.3. Thứ tự ưu tiên

```text
Redis value > YAML default
```

Nếu YAML thiếu key → fail fast lúc startup, vì registry không đầy đủ.

---

# 2. Task 1 — AI-service

## Phase 1.1 — `AIConfig`

### File

```text
ai-service/src/core/ai_config.py
```

Một file duy nhất, gồm:

- `ConfigDef`
- `AIConfig`
- `ForYouConfig`
- `TrainingConfig`

### Load YAML

- Đọc `config/ai_config.yaml` một lần lúc startup.
- Sinh `CONFIG_DEFS`.
- Không hard-code default trong Python.
- Nếu YAML thiếu key bắt buộc → log error + raise lúc startup.

### API class

```python
class AIConfig:
    async def get(self, key: str) -> Any
    async def get_many(self, keys: list[str]) -> dict[str, Any]
    async def set_many(self, changes: dict[str, Any]) -> int
    async def for_you_snapshot(self) -> ForYouConfig
    async def training_snapshot(self) -> TrainingConfig
    def describe(self) -> list[dict]
```

### `get`

1. Key không có registry → log warning, trả `None`.
2. `HGET config:v1:ai key`.
3. Redis lỗi → log warning, trả default YAML.
4. Không có value → log debug `miss`, trả default YAML.
5. Có value:
   - `json.loads`;
   - cast type;
   - validate;
   - log debug `hit`;
   - trả value.
6. JSON/type/validate lỗi → log warning, trả default YAML.

### `get_many`

- `HMGET` một lần.
- Key thiếu/lỗi → default YAML.
- Trả đủ key.

### `set_many`

1. Chỉ nhận `ai.*`.
2. Key phải có registry.
3. Validate.
4. `HSET config:v1:ai`.
5. `INCR config:v1:ai:version`.
6. Trả version.

### Logging

```text
[AIConfig] hit key=ai.for_you.rrf.k value=80 source=redis
[AIConfig] miss key=ai.genre.alpha default=0.05 source=yaml
[AIConfig] invalid key=ai.genre.alpha raw="abc" error=float parse fallback=0.05
[AIConfig] redis_error key=ai.for_you.weights.CF fallback=0.375 error=...
[AIConfig] snapshot=for_you version=12 loaded=9
```

### Output Phase 1.1

- [ ] Không còn default value trong Python.
- [ ] YAML là nguồn default duy nhất.
- [ ] `get` fallback YAML khi Redis thiếu/lỗi.
- [ ] `get_many` dùng HMGET.
- [ ] `set_many` validate + version.
- [ ] Logging đủ hit/miss/fallback.

---

## Phase 1.2 — Gắn config vào service

| File | Việc làm |
|---|---|
| `src/services/user_vector_aggregator_service.py` | Dùng `ForYouConfig`, bỏ import weights hard-code |
| `src/services/recommend_service.py` | Lấy snapshot trước khi gọi aggregator |
| `src/services/genre_vector_service.py` | Đọc `ai.genre.*` |
| `src/infra/messaging/consumers/interaction_event_handler.py` | EMA alpha từ config |
| `src/services/model_training_service.py` | Dùng `TrainingConfig`, min thresholds |
| `src/services/IALSRecommendationService.py` | Nhận params từ `TrainingConfig` |
| `src/core/vector_constants.py` | Không còn là source-of-truth value |

Quy tắc:

- Mỗi request For You đọc **1 snapshot**.
- Mỗi lần train đọc **1 snapshot**.
- Không đọc Redis lại trong vòng lặp.
- Thiếu source → default YAML.

### Output Phase 1.2

- [ ] For You không còn hard-code weights.
- [ ] RRF k/candidate multiplier lấy từ config.
- [ ] Genre lấy alpha/minAbs/topK từ config.
- [ ] Training lấy params + min threshold từ config.
- [ ] Log snapshot mỗi request/train.

---

## Phase 1.3 — API AI config

### File

Sửa `src/api/routes/recommendations.py`, không tạo router mới.

### GET

```http
GET /api/recommendations/admin/ai-config
```

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Lấy cấu hình AI thành công",
  "result": {
    "version": 12,
    "groups": [
      {
        "group": "ai.for_you.weights",
        "label": "For You — Weights",
        "items": [
          {
            "key": "ai.for_you.weights.CF",
            "label": "CF weight",
            "description": "Trọng số collaborative filtering",
            "type": "float",
            "value": 0.375,
            "default": 0.375,
            "source": "redis"
          }
        ]
      }
    ]
  }
}
```

### POST

```http
POST /api/recommendations/admin/ai-config
```

```json
{
  "changes": {
    "ai.for_you.weights.CF": 0.35,
    "ai.for_you.rrf.k": 80
  }
}
```

```json
{
  "success": true,
  "statusCode": 200,
  "message": "Cập nhật cấu hình AI thành công",
  "result": {
    "version": 13,
    "updated": ["ai.for_you.weights.CF", "ai.for_you.rrf.k"]
  }
}
```

### Auth

- `get_current_user`.
- `scopes` có `ADMIN`/`SUPERADMIN`.
- Không đủ → `403`.

### Output Phase 1.3

- [ ] GET trả group + flat key + default + source.
- [ ] POST validate + HSET + version.
- [ ] Chỉ ADMIN.
- [ ] Key ngoài `ai.*` → 400.
- [ ] Log `[AIConfigApi]`.

---

# 3. Task 2 — UI Admin

## Phase 2.1 — API client + hook

### File

```text
frontend/src/apis/ai-config.api.ts
frontend/src/hooks/tankstack/admin-ai-config.ts
```

### API client

```ts
export interface AIConfigItem {
  key: string;
  label: string;
  description?: string;
  type: 'float' | 'int' | 'string' | 'boolean' | 'json';
  value: unknown;
  default: unknown;
  source: 'redis' | 'default';
}

export interface AIConfigGroup {
  group: string;
  label: string;
  items: AIConfigItem[];
}

export interface AIConfigResult {
  version: number;
  groups: AIConfigGroup[];
}
```

Methods:

```ts
getAll(): Promise<ApiResponse<AIConfigResult>>
update(changes: Record<string, unknown>): Promise<ApiResponse<{ version: number; updated: string[] }>>
```

Path:

```text
/ai/recommendations/admin/ai-config
```

### Hook

```ts
AI_CONFIG_QUERY_ROOT = 'admin-ai-config'

useAdminAIConfig()
useUpdateAIConfig()
```

- `queryKey: ['admin-ai-config']`.
- Mutation invalidate đúng key.
- Error dùng `parseAxiosError` + `toast.error`.

### Output Phase 2.1

- [ ] API đọc `response.result`.
- [ ] Không dùng fetch trực tiếp.
- [ ] Hook đúng queryKey.
- [ ] Không bọc lại envelope.

---

## Phase 2.2 — Trang admin

### Route

```text
frontend/src/app/(admin-layout)/admin/ai-config/page.tsx
frontend/src/app/(admin-layout)/admin/ai-config/ai-config-client.tsx
```

- `page.tsx`: metadata + `<AIConfigClient />`.
- `ai-config-client.tsx`: `'use client'`.

UI:

- `AdminPageHeader` tiêu đề “Cấu hình AI”.
- Hiện `Version`.
- Group theo `Card`/`Tabs`.
- Mỗi item: label, description, key, input, default, source badge.

### Nav

Sửa `frontend/src/components/sidebar/nav-data.ts`:

```ts
{
  title: 'Cấu hình AI',
  url: '/admin/ai-config',
  icon: SlidersHorizontal,
}
```

Đặt trong group `interaction`.

### Output Phase 2.2

- [ ] Route `/admin/ai-config`.
- [ ] Nav admin có mục “Cấu hình AI”.
- [ ] Metadata + tiêu đề tiếng Việt.
- [ ] Chỉ ADMIN truy cập.

---

## Phase 2.3 — Form

- `react-hook-form` + `zod`.
- Form value là object flat `Record<key, value>`.
- Submit chỉ gửi dirty fields.
- Numeric parse về number.
- JSON textarea parse JSON; lỗi field không gọi API.
- Nút “Lưu thay đổi” disabled khi không dirty/submitting.
- Không gửi `version`.

### Output Phase 2.3

- [ ] Sửa đúng type.
- [ ] Chỉ gửi key thay đổi.
- [ ] Không đổi → không gửi.
- [ ] Có trạng thái submitting.

---

## Phase 2.4 — UI states

- Loading: skeleton.
- Error: `ErrorState` + “Thử lại”.
- Empty: `EmptyState`.
- Toast success/error.
- Responsive 375px, không scroll ngang.
- Dark mode, token màu, shadcn.
- A11y: label + aria-label + focus ring.

### Output Phase 2.4

- [ ] Đủ loading/error/empty.
- [ ] Toast đúng.
- [ ] Mobile 375px OK.
- [ ] Không hardcode màu.

---

# 4. Thứ tự thực hiện

## Task 1

1. Tạo `config/ai_config.yaml`.
2. Tạo `ai_config.py` load YAML.
3. Viết `get/get_many/set_many`.
4. Gắn snapshot For You.
5. Gắn Genre + EMA.
6. Gắn Training CF.
7. Thêm 2 API admin.
8. Test AI.

## Task 2

1. API client.
2. Hook.
3. Page + client.
4. Render group/key.
5. Form dirty.
6. UI states.
7. Nav.
8. Test UI.

---

# 5. Test

## AI

Cập nhật spec hiện có, không tạo nhiều file test mới:

- `tests/unit/services/test_recommend_service.py`
- `tests/unit/services/test_ials_recommendation_service.py`
- `tests/unit/api/routes/test_recommendations.py`
- `tests/unit/infra/messaging/consumers/test_interaction_event_handler.py`

Case:

1. Redis trống → YAML default.
2. Override 1 key → chỉ key đó đổi.
3. JSON lỗi → YAML default + warning.
4. Redis lỗi → YAML default.
5. Tổng weights = 0 → default.
6. Non-admin POST → 403.
7. Admin POST → version tăng.
8. Training đọc min threshold đúng.

## UI

Cập nhật spec hiện có:

1. Render group/key.
2. Sửa 1 field → POST chỉ key đó.
3. Không đổi → disabled.
4. API lỗi → toast.
5. Loading/error/empty.
6. ADMIN thấy nav.

---

# 6. Logging & comment

AI:

- `[AIConfig]` hit/miss/fallback/version.
- `[AIConfigApi]` GET/POST.
- Comment ngắn ở fallback YAML, validate weight, snapshot.

Frontend:

- Không `console.log`.
- Lỗi qua toast.
- Comment ngắn ở dirty payload + parse JSON.

---

# 7. Acceptance criteria

## Task 1

- [ ] Không hard-code value trong Python.
- [ ] YAML là default duy nhất.
- [ ] Redis override đọc mỗi lần dùng.
- [ ] Fallback YAML khi Redis thiếu/lỗi.
- [ ] Logging đủ.
- [ ] For You/Training dùng snapshot.
- [ ] API GET/POST chỉ ADMIN.

## Task 2

- [ ] `/admin/ai-config` hiển thị group/key/value/default/source.
- [ ] Sửa/lưu chỉ dirty fields.
- [ ] Loading/error/empty/toast.
- [ ] Responsive, dark mode, shadcn.
- [ ] Nav “Cấu hình AI”.

## Chung

- [ ] Không pubsub.
- [ ] Không cron/TTL.
- [ ] Version chỉ hiển thị.
- [ ] Envelope đúng.
- [ ] Test + lint + build xanh.

---

# 8. Docker & reload YAML

## 8.1. YAML trong Docker

Dockerfile hiện tại dùng:

```dockerfile
WORKDIR /app
COPY . .
```

Nên `config/ai_config.yaml` sẽ nằm trong image tại:

```text
/app/config/ai_config.yaml
```

Nếu **bake YAML vào image**:
- sửa YAML → phải build lại image;
- deploy/restart container.

Nếu muốn sửa YAML không cần build lại, mount volume:

```yaml
services:
  ai-service:
    volumes:
      - ../ai-service/config/ai_config.yaml:/app/config/ai_config.yaml:ro
```

Áp dụng cho `docker/docker-compose.yml` và `docker/docker-compose.prod.yml` (đường dẫn tương đối theo file compose).

## 8.2. Có cần restart không?

- **Đổi value qua API/Redis:** không restart. Code đọc Redis mỗi lần dùng.
- **Đổi YAML (default/metadata/group):**
  - nếu loader chỉ đọc lúc startup → cần restart;
  - nếu thêm mtime reload → không cần restart.

Khuyến nghị thêm mtime reload trong `AIConfig`:

```python
# mỗi 30s hoặc trước khi get_many
mtime = path.stat().st_mtime
if mtime != self._yaml_mtime:
    self._reload_registry()
```

- YAML là default/metadata, không phải value runtime.
- Redis vẫn là nguồn value hiện tại.
- Thêm key mới vào YAML → reload registry, không cần restart.
- Code muốn dùng key mới vẫn phải sửa code → rebuild/redeploy.

## 8.3. Kết luận Docker

| Thay đổi | Cần restart? |
|---|---|
| Sửa weight/param qua UI/Redis | Không |
| Sửa default/label/group trong YAML + mount volume + mtime reload | Không |
| Sửa YAML nhưng bake vào image | Có, sau khi build image mới |
| Sửa code Python | Có, rebuild/redeploy |

---

## P9 — Fix runtime UI + encoding (bổ sung sau QA)

- [x] `Controller.name` chuyển từ array sang string `values.${index}` để tránh `name.split is not a function`.
- [x] Form value map theo index; submit map ngược về key config gốc.
- [x] Dirty-field và validate error path dùng index, không dùng key có dấu chấm.
- [x] Nút Lưu dùng `formState.dirtyFields` thay `watch('values') + useMemo`, tránh stale khiến nút bị disable.
- [x] Sửa encoding UTF-8 cho label/group trong `ai-service/config/ai_config.yaml`.

---

# 9. Không làm

- Không sửa cron backend.
- Không sửa TTL cache backend.
- Không thêm pubsub.
- Không dynamic cron.
- Không thêm library UI mới.
- Không tạo nhiều class/file trung gian.
