# V21 — Tái cấu trúc unit test ai-service theo module/file/def

## Thông tin chung

| Hạng mục | Nội dung |
|---|---|
| Trạng thái | ✅ Hoàn thành (2026-11-04) |
| Người thực hiện | AI Agent (main) + SA-API + SA-CORE + SA-SVC |
| Thời gian | 2026-11-04 |
| Scope | `testing` |
| Nhánh | `ci-cd` |
| Yêu cầu | Developer: "unit test ai-service chưa chạy được; cần chia module, test từng file và def của class; mock các class hạ tầng; mỗi module phải có test; cấu trúc hiện rất loạn, không biết test thuộc module/folder/class nào" |
| Module liên quan | `ai-service/tests/**`, `ai-service/.venv/pyvenv.cfg` (môi trường), `docs/AI-SERVICE.md`, `docs/guildes/CICD_GUILDLINES.md`, `docs/CODE_RULES.md` |
| Không sửa | Code `ai-service/src/**` — trừ 2 bug nhỏ bắt buộc để test chạy được (ghi ở "Bug đã sửa") |

## Bối cảnh

1. **Test không chạy được trong venv của project**: `ai-service/.venv` chỉ có pytest/black/isort — thiếu gần hết dependency (`numpy`, `fastapi`, `torch`, `underthesea`…). Chạy `\.venv\Scripts\python -m pytest tests` → **15 lỗi collection** `ModuleNotFoundError`. Trước đó cả nhóm phải dùng Python global (workaround, không phải cách chuẩn).
2. **Cấu trúc test phẳng, không phản ánh `src/`**: 21 file nằm chung `tests/unit/`, tên không theo module (`test_models_baseline.py` gộp cả TF-IDF + BM25; `test_api_response.py` thay vì `api/test_response.py`; test của `scripts/` trộn vào unit test).
3. **Thiếu test cho 14 module**: `api/{middleware,server}`, `api/routes/{health,recommendations}`, `core/{base_model,config,monitoring,telemetry}`, `data/data_loader`, `services/{model_training_service,recommend_service}`, `utils/{checkpoint_manager,experiment_tracker,teencode_dict}`.

## Mục tiêu (đã đạt)

- `cd ai-service && .venv\Scripts\python -m pytest` chạy được **ngay**, không cần Python global.
- Cây test **1-1 với `src/`**: mỗi module `src/<pkg>/<file>.py` có đúng `tests/unit/<pkg>/test_<file>.py`.
- Trong mỗi file test: **mỗi class/def công khai có ít nhất 1 test class** (`Test<Class>` / `Test<func>`); mock toàn bộ hạ tầng (Redis, RabbitMQ, Chroma, S3, model, HTTP, OTEL).
- Test của `scripts/` tách khỏi unit test của service.

## Cấu trúc đã chốt

```
tests/
├── conftest.py                     # env JWT, FakeChroma/FakeModel, stub boto3, fixtures
├── unit/
│   ├── api/
│   │   ├── test_response.py            test_schemas.py
│   │   ├── test_middleware.py          test_server.py
│   │   ├── dependencies/test_auth.py
│   │   └── routes/{test_health.py, test_recommendations.py}
│   ├── core/
│   │   ├── test_base_model.py     test_config.py       test_integrations.py
│   │   ├── test_interaction_queue.py   test_message_queue.py
│   │   ├── test_monitoring.py     test_redis_service.py
│   │   └── test_telemetry.py      test_tokenizer.py
│   ├── data/test_data_loader.py
│   ├── models/{test_tfidf_search.py, test_bm25_search.py}
│   ├── services/
│   │   ├── test_embedding_service.py        test_interaction_event_handler.py
│   │   ├── test_mapping_service.py          test_model_training_service.py
│   │   ├── test_movie_event_handler.py      test_recommend_service.py
│   │   └── test_storage_service.py
│   └── utils/
│       ├── test_checkpoint_manager.py  test_clean_text_utils.py
│       ├── test_config_loader.py       test_experiment_tracker.py
│       └── test_logger.py              test_teencode_dict.py
└── scripts/                            # test cho scripts/benchmark, không thuộc src/
    ├── test_benchmark_metrics.py   test_benchmark_queries.py
    └── test_evaluation_guard.py    test_ground_truth_v2.py
```

Mỗi package test có `__init__.py` để pytest không nhầm module trùng tên.

## Mapping module ↔ file test (32/32)

| Module `src/` | File test | Số test |
|---|---|---|
| `api/middleware.py` | `api/test_middleware.py` | 19 |
| `api/response.py` | `api/test_response.py` | 11 |
| `api/schemas.py` | `api/test_schemas.py` | 32 |
| `api/server.py` | `api/test_server.py` | 25 |
| `api/dependencies/auth.py` | `api/dependencies/test_auth.py` | 2 |
| `api/routes/health.py` | `api/routes/test_health.py` | 10 |
| `api/routes/recommendations.py` | `api/routes/test_recommendations.py` | 41 |
| `core/base_model.py` | `core/test_base_model.py` | 19 |
| `core/config.py` | `core/test_config.py` | 45 |
| `core/integrations.py` | `core/test_integrations.py` | — |
| `core/interaction_queue.py` | `core/test_interaction_queue.py` | 12 |
| `core/message_queue.py` | `core/test_message_queue.py` | 12 |
| `core/monitoring.py` | `core/test_monitoring.py` | 24 |
| `core/redis_service.py` | `core/test_redis_service.py` | 4 |
| `core/telemetry.py` | `core/test_telemetry.py` | 17 |
| `core/tokenizer.py` | `core/test_tokenizer.py` | 19 |
| `data/data_loader.py` | `data/test_data_loader.py` | 63 |
| `models/tfidf_search.py` | `models/test_tfidf_search.py` | 12 |
| `models/bm25_search.py` | `models/test_bm25_search.py` | 9 |
| `services/embedding_service.py` | `services/test_embedding_service.py` | 10 |
| `services/interaction_event_handler.py` | `services/test_interaction_event_handler.py` | 43 |
| `services/mapping_service.py` | `services/test_mapping_service.py` | 8 |
| `services/model_training_service.py` | `services/test_model_training_service.py` | 18 |
| `services/movie_event_handler.py` | `services/test_movie_event_handler.py` | 10 |
| `services/recommend_service.py` | `services/test_recommend_service.py` | 40 |
| `services/storage_service.py` | `services/test_storage_service.py` | 12 |
| `utils/checkpoint_manager.py` | `utils/test_checkpoint_manager.py` | 2 (+4 skip) |
| `utils/clean_text_utils.py` | `utils/test_clean_text_utils.py` | 38 |
| `utils/config_loader.py` | `utils/test_config_loader.py` | 5 |
| `utils/experiment_tracker.py` | `utils/test_experiment_tracker.py` | 13 |
| `utils/logger.py` | `utils/test_logger.py` | 4 |
| `utils/teencode_dict.py` | `utils/test_teencode_dict.py` | 45 |

## Phases

### Phase 0 — Môi trường
- [x] Bật `include-system-site-packages = true` trong `ai-service/.venv/pyvenv.cfg` (venv dùng chung package đã cài của Python global — không phải tải lại torch ~2GB).
- [x] Cài thêm vào venv: `python-jose`, `prometheus-fastapi-instrumentator`, `opentelemetry-instrumentation-requests`, `boto3` (đều là dependency đã khai báo trong `pyproject.toml`).
- [x] Dọn 2 warning môi trường (không phải lỗi test):
  - `chardet 7.6.0` (do `textract` kéo vào) vượt range `requests 2.32.5` hỗ trợ (`<6`) → `pip install "chardet<6"` (venv còn 5.2.0).
  - `Starlette 1.6` deprecate TestClient dùng `httpx` → cài `httpx2` (2.16.0, kèm `httpcore2`) để Starlette dùng `httpx2`.
  - Sau khi sửa: `pytest tests -q` → **659 passed, 4 skipped, 0 warning**.
- [x] Xác minh `import numpy, fastapi, torch` trong venv OK; `pytest tests -q` → 278 passed (trước đó 15 lỗi collection).

### Phase 1 — Tái cấu trúc
- [x] Tạo cây thư mục đích + `__init__.py` cho từng package test.
- [x] Di chuyển/đổi tên 17 test hiện có vào đúng package.
- [x] Tách `test_models_baseline.py` → `models/test_tfidf_search.py` + `models/test_bm25_search.py` (mỗi class 1 file).
- [x] Chuyển 4 test benchmark/evaluation sang `tests/scripts/`.
- [x] Chạy lại full suite sau khi di chuyển.

### Phase 2 — Bổ sung test module còn thiếu
- [x] `api/middleware.py` (19), `api/server.py` (25), `api/routes/health.py` (10), `api/routes/recommendations.py` (41).
- [x] `core/base_model.py` (19), `core/config.py` (45), `core/monitoring.py` (24), `core/telemetry.py` (17).
- [x] `data/data_loader.py` (63).
- [x] `services/model_training_service.py` (18), `services/recommend_service.py` (40).
- [x] `utils/checkpoint_manager.py` (2 + 4 skip), `utils/experiment_tracker.py` (13), `utils/teencode_dict.py` (45).

### Phase 3 — Kiểm tra & báo cáo
- [x] Full suite trong venv: **659 passed, 4 skipped, 0 failed**, coverage **94%** (từ 66%).
- [x] 32/32 module có file test tương ứng (script kiểm tra mapping = 0 missing).
- [x] Cập nhật `docs/AI-SERVICE.md` + `CICD_GUILDLINES.md` + `CODE_RULES.md` §3.8.
- [x] Không commit.

## Acceptance

- [x] `cd ai-service && .venv\Scripts\python -m pytest -q` xanh, không cần Python global.
- [x] Mỗi module trong `src/` có 1 file test tương ứng; mỗi public class/def có test class.
- [x] Không còn file test đặt sai package; `tests/scripts/` tách riêng.
- [x] Báo cáo mapping + coverage.

---

## Báo cáo thực hiện (2026-11-04)

### Kết quả lệnh

| Lệnh (trong `ai-service/`) | Kết quả |
|---|---|
| `.\.venv\Scripts\python.exe -m pytest tests -q` | **659 passed, 4 skipped, 0 warning** (~17s) |
| `.\.venv\Scripts\python.exe -m pytest tests -q --cov=src` | **94%** (1875 stmts, 112 miss) |
| `.\.venv\Scripts\python.exe -m pytest tests/unit/<pkg> -q` | từng package xanh độc lập |

**Coverage theo package** (trước → sau): api ~46% → **98%**, core ~73% → **87%**, services ~61% → **99%**, models 100% → **100%**, utils ~82% → **100%**, data_loader 23% → **100%**.

### Bug đã sửa (nhỏ, bắt buộc để test chạy)

| File | Bug | Sửa |
|---|---|---|
| `src/core/monitoring.py` | 6 `Gauge` tạo ở module level → import module dưới 2 tên package (`core.monitoring` và `src.core.monitoring`) ném `DuplicateTimeseries`, làm test/entrypoint crash | Thêm `_create_gauge()`: trả collector đã đăng ký nếu trùng tên, re-raise nếu registry lạ |
| `src/data/data_loader.py` | `str(row.get("title_vi") or row.get("title"))` — ô CSV trống khi đọc bằng pandas là `NaN` (truthy) → `search_text` = `"nan nan <genres>"`, phim bị lọc khỏi corpus | Thêm `_as_text()` xử lý `None`/`NaN` trước khi fallback |

### Bug phát hiện, CHƯA sửa (cần dev quyết định)

1. **`model_training_service._preprocess_data` trả 3-tuple ở nhánh lỗi** (dòng 95/107/114) nhưng signature 4-tuple và caller unpack 4 → `ValueError` bị `except` nuốt, pipeline trả `False` thay vì skip êm. (HIGH)
2. **`/search` hỏng 2 lớp**: `SearchRequest` không annotate `Query()` → FastAPI coi là body (GET + query string trả 422); nếu gửi body thì route đọc `request.pageSize` trong khi schema là `page_size` → 500. (HIGH)
3. **Token thiếu `email`/`fullName` → 500**: middleware chỉ bắt `ExpiredSignatureError`/`JWTError`, `CurrentUser(...)` ném `ValidationError`. (MEDIUM)
4. **`server.py:96`**: `await metrics_thread.join()` trong khi `Thread.join()` sync → `TypeError` khi shutdown thật. (MEDIUM)
5. **R2 upload/delete trong training bỏ qua bool trả về** → pipeline báo `True` dù upload/xoá thất bại; `_manage_r2_data` phụ thuộc `r2_parquet_files` chỉ set trong `_download_training_data` → gọi trực tiếp sẽ `AttributeError`. (MEDIUM)
6. **`hybrid_recommendation` dùng `item["id"]`/`item["score"]` trực tiếp** → hit thiếu field làm hỏng cả request (semantic_search thì an toàn nhờ `_format_item`). (MEDIUM)
7. **`experiment_tracker`**: run dir chỉ có timestamp tới giây → 2 run cùng giây ghi đè config/metrics. (MEDIUM)
8. **`checkpoint_manager.py` bị comment 100%** (213 dòng), không có `CheckpointManager`, không nơi nào import → 4 test skip chờ implement. (HIGH — dead module)
9. **LOW**: `middleware.get_correlation_id` dead-code `trace_id is None` + type hint `tuple[str,str,str]` sai; `evidences` trả `list[str]` nhưng schema `str | None`; `delete_movie_vector` giả định `_get_collection` trả `None` (Chroma raise `RuntimeError`); `teencode_dict` `"wa'"→"qua"` (nghi typo) và `normalize_typing_rules` case-sensitive; `/tracing` hardcode `localhost:8081` không timeout; `/hybrid/no-auth` và các route không auth trên app production.

### Ghi chú

- 4 test skip nằm ở `utils/test_checkpoint_manager.py` — module nguồn chưa implement; skip có lý do rõ trong file, không phải test hình thức.
- Test `scripts/` (benchmark/evaluation/ground-truth) vẫn giữ nguyên nội dung, chỉ đổi vị trí sang `tests/scripts/`.
- Không kết nối Redis/RabbitMQ/Chroma/S3/model thật; toàn bộ mock qua `conftest.py` + `monkeypatch`.
