# Logging & Observability

Tài liệu mô tả cách `backend` và `ai-service` ghi log, cách thu log tập trung local/VPS/AWS, và cách đổi nơi lưu mà không sửa code.

## 1. Nguyên tắc

- App chỉ ghi **stdout/stderr**, không ghi file trong container.
- Production mặc định **JSON**; dev có thể text cho dễ đọc.
- Nơi thu/lưu log do hạ tầng quyết định:
  - Docker `json-file` + Promtail → Loki (local/VPS).
  - ECS Fargate `awsfirelens` → Loki VPS; hoặc `awslogs` → CloudWatch.
- Cùng một image dùng cho local/AWS/VPS; chỉ đổi env và log driver.

## 2. Env contract

| Biến | Giá trị | Ý nghĩa |
|---|---|---|
| `LOG_FORMAT` | `json` / `text` | Production nên `json` |
| `LOG_LEVEL` | `debug` / `info` / `warn` / `error` | Production `info` |
| `SERVICE_NAME` | `movie-backend` / `ai-service` | Metadata trong log |
| `OTEL_EXPORTER_URL` | URL OTLP | Trace endpoint (Jaeger/Tempo/collector) |

Backend đọc trong `backend/src/config/logger.config.ts`; AI service đọc trong `ai-service/src/utils/logger.py`.

## 3. Local / VPS tự host

Luồng:

```text
backend / ai-service stdout/stderr
  → Docker json-file
  → Promtail (đọc Docker socket)
  → Loki
  → Grafana
```

Các service đã có trong `docker/docker-compose.yml`:

- `loki` — lưu log, volume `loki_data`, retention 30 ngày (`docker/loki/loki-config.yml`).
- `promtail` — đọc container `backend`, `ai-service`, `kong` (`docker/promtail/promtail-config.yml`).
- `grafana` — datasource Prometheus + Loki + Jaeger (`docker/grafana/provisioning/datasources/datasources.yml`).

Chạy local:

```bash
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d --build backend ai-service loki promtail grafana
```

Kiểm tra:

```bash
docker logs backend
docker logs ai-service
```

Grafana: `http://localhost:3000` → Explore → Loki:

```logql
{container="backend"}
{container="ai-service"}
{service="movie-backend"} |= "error"
```

Prometheus scrape `backend:8081/api/metrics` và `ai-service:8082/api/metrics` (không dùng `host.docker.internal`).

## 4. AWS ECS Fargate

### Cách A — log về Loki trên VPS (primary)

Task definition dùng FireLens:

```json
"logConfiguration": {
  "logDriver": "awsfirelens",
  "options": {
    "Name": "loki",
    "Host": "observability.example.com",
    "Port": "443",
    "TLS": "on"
  }
}
```

Thêm log router container Fluent Bit trong task, cấu hình output Loki đầy đủ:

```ini
[OUTPUT]
    Name        loki
    Match       *
    Host        observability.example.com
    Port        443
    TLS         On
    HTTP_User   ${LOKI_USER}
    HTTP_Passwd ${LOKI_PASSWORD}
    Labels      job=backend
```

Khuyến nghị: endpoint qua VPN/WireGuard hoặc public HTTPS + whitelist NAT EIP. Buffer Fluent Bit bằng filesystem để không mất log khi VPS restart.

### Cách B — CloudWatch (fallback)

```json
"logConfiguration": {
  "logDriver": "awslogs",
  "options": {
    "awslogs-create-group": "true",
    "awslogs-group": "/ecs/movie-backend",
    "awslogs-region": "ap-southeast-1",
    "awslogs-stream-prefix": "backend"
  }
}
```

Execution role cần `logs:CreateLogGroup`, `logs:CreateLogStream`, `logs:PutLogEvents`.
Đặt retention (ví dụ 90 ngày) và export sang S3 nếu cần lưu lâu.

## 5. Metrics & traces

- Backend metrics: `GET /api/metrics` (Prometheus).
- AI metrics: `GET /api/metrics`.
- Health: `GET /api/health`.
- Trace: OTLP endpoint `OTEL_EXPORTER_URL` → Jaeger/Tempo/collector.

Với ECS Fargate, Prometheus không scrape ngược qua NAT. Dùng ADOT/OTel sidecar scrape nội bộ task rồi `remote_write` sang Prometheus/Mimir trên VPS.

## 6. Lưu trữ & độ bền

| Nơi | Độ bền | Ghi chú |
|---|---|---|
| `logs/` trong container | Kém | Không dùng; mất khi recreate |
| Docker `json-file` trên host | Trung bình | Chỉ debug; có rotation |
| Loki volume trên VPS | Trung bình | Cần backup; retention 30 ngày |
| Loki + S3/R2 | Tốt | Chunk/index lưu object storage |
| CloudWatch Logs + S3 export | Tốt | Retention + archive dài hạn |

Khi cần đổi nơi tập trung log: chỉ đổi log driver (Docker/ECS) và endpoint OTLP; không sửa code ứng dụng.
