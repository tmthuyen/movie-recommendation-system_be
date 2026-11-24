# V40 — Logging tập trung & observability linh hoạt (local / AWS Fargate / VPS)

## Trạng thái

🟡 Đang triển khai — code/config logging đã xong; đang chờ build prod image và smoke runtime. Đã bổ sung `libgomp1` vào image `ai-service` để sửa lỗi `ImportError: libgomp.so.1` khi import `torch` / `implicit`.

## Người thực hiện & thời gian

| Hạng mục        | Nội dung                      |
| --------------- | ----------------------------- |
| Người thực hiện | Dev, Copilot                  |
| Bắt đầu         | 2026-11-25                    |
| Phạm vi         | Backend + AI service + Docker |
| Methodology     | Traditional                   |
| Complexity      | Medium                        |

## 1. Mục tiêu

- `backend` và `ai-service` chỉ ghi log ra **stdout/stderr**, không ghi file trong container.
- Production log dạng **JSON** để CloudWatch/Loki cùng parse được theo `level`, `service`, `message`.
- Thêm stack log tập trung local: **Loki + Promtail + Grafana**.
- Giữ khả năng đổi nơi tập trung log mà không sửa code:
  - Local/VPS: `json-file` + Promtail → Loki.
  - AWS ECS Fargate: `awsfirelens` → Loki VPS, hoặc `awslogs` → CloudWatch.
- Sửa Prometheus scrape đúng service name trong Docker network.
- Build image production cho cả 2 service và smoke ổn định.

## 2. Hiện trạng

- `backend/src/config/logger.config.ts` bật `DailyRotateFile` khi production → lỗi `EACCES: mkdir 'logs/'` trong image chạy `USER node`.
- `ai-service/src/utils/logger.py` luôn tạo `logs/` và ghi `FileHandler`, dù đã có `StreamHandler`.
- `docker/prometheus/prometheus.yml` scrape `host.docker.internal:8081/8082` — chỉ đúng Docker Desktop, sai trên VPS.
- `docker-compose.yml` chưa có Loki/Promtail; Grafana chưa có datasource Loki.
- `gateway/otel-collector-config.yaml` có pipeline logs→Loki nhưng chưa có service Loki/collector trong compose.

## 3. Phases

### Phase 1 — Backend stdout JSON

- [x] Bỏ `DailyRotateFile` khỏi production.
- [x] Thêm `SERVICE_NAME`, `LOG_LEVEL`, JSON format có timestamp/error stack.
- [x] Không tạo thư mục `logs/` khi khởi động.

### Phase 2 — AI service stdout JSON

- [x] Bỏ `os.makedirs("logs")` và `FileHandler`.
- [x] Giữ `StreamHandler` (stderr), JSON formatter khi production/`LOG_FORMAT=json`.

### Phase 3 — Local centralized logs

- [x] Thêm `loki` + `promtail` vào `docker/docker-compose.yml`.
- [x] Thêm config `docker/loki/loki-config.yml`, `docker/promtail/promtail-config.yml`.
- [x] Thêm Grafana datasource Loki.
- [x] Thêm `logging: json-file` + rotation cho backend/ai-service.
- [x] Sửa Prometheus targets sang `backend:8081`, `ai-service:8082`.
- [ ] Thêm `node-exporter` + `cAdvisor` (profile monitoring) và job scrape.

### Phase 4 — Linh hoạt AWS/VPS

- [x] Ghi docs cấu hình AWS ECS Fargate: `awsfirelens`/`awslogs`, SSM secret cho OTLP endpoint.
- [x] Ghi docs cấu hình VPS: json-file + Promtail, Loki retention/volume.
- [x] Env contract: `LOG_FORMAT`, `LOG_LEVEL`, `SERVICE_NAME`, `OTEL_EXPORTER_URL`.

### Phase 5 — Build & smoke

- [ ] Build image production backend + ai-service.
  - [x] Sửa runtime dependency `ai-service`: thêm `libgomp1` vào stage `base` (lỗi `ImportError: libgomp.so.1` từ `torch` / `implicit`).
- [ ] Chạy stack local, kiểm tra `docker logs`, Loki query, `/api/health`, `/api/metrics`.

### Phase 6 — Gate & docs

- [x] Backend: type-check/build/test/lint.
- [x] AI service: kiểm tra import/compile logger.
- [ ] `git diff --check`.
- [x] Cập nhật `docs/BACKEND.md`, `docs/AI-SERVICE.md`, `PLAN_INDEX.md`.

## 4. Tiêu chí chấp nhận

- Không còn lỗi `EACCES mkdir logs/`.
- Không tạo `logs/` trong container production.
- Log 2 service thấy trong `docker logs` và Loki.
- Đổi AWS ↔ VPS chỉ đổi driver/env, không đổi code.
- Build prod image thành công.
