# V44 — Chuyển gateway từ Kong sang Nginx (giữ file Kong, comment container)

> **Trạng thái:** 🟢 Đã triển khai (2026-11-26) — chờ QA tay trên stack thật
> **Người thực hiện:** AI agent (Big Pickle)  
> **Thời gian lập plan:** 2026-11-26  
> **Thời gian triển khai:** 2026-11-26
> **Scope:** `cicd` (liên quan `backend`, `docs`)  
> **Phạm vi file:** `docker/docker-compose*.yml`, `docker/compose.dev.yml`, `gateway/kong.yml` (giữ nguyên), `gateway/nginx.conf` (mới), `docker/promtail/promtail-config.yml`, `docker/prometheus/prometheus.yml`, `docs/**`

---

## 1. Mục tiêu

Thay Kong bằng Nginx làm public entry point, **giữ nguyên `gateway/kong.yml` trong repo** và **comment container Kong trong compose** để có thể rollback. Đồng thời đảm bảo: route đúng, load balancing, WebSocket/Socket.IO, CORS, request id, rate limit và monitoring ổn định.

---

## 2. Hiện trạng Kong

- DB-less: `KONG_DATABASE=off`, declarative `gateway/kong.yml` mount read-only.
- Routes:
  - `/api` → `http://backend:8081`, `strip_path: false`.
  - `/api/ai` → `http://ai-service:8082`, `strip_path: true` — **lệch docs** (`/api/recommendations`) và dễ forward sai prefix vì AI mount `/api/recommendations`.
- Plugin global: CORS (`5173`, `3002`, `credentials: true`, expose `X-Request-ID`), correlation-id uuid, rate-limit 120/phút/IP `policy: redis` db 1.
- Admin API `:8001`; log proxy/admin ra stdout/stderr.
- Port: dev `8000/8443/8001`; prod host `80` → container `8000`.
- **Không** có plugin Prometheus/OpenTelemetry; `gateway/otel-collector-config.yaml` không có collector service chạy.
- Prometheus chỉ scrape `prometheus`, `backend:8081/api/metrics`, `ai-service:8082/api/metrics`.
- Promtail chỉ giữ log `backend|ai-service|kong`.
- Kong **không** proxy `/socket.io`; FE hiện nối thẳng `:8081`.

---

## 3. Quyết định thiết kế Nginx

### Route

| Path | Upstream | Ghi chú |
|---|---|---|
| `/api/` | `http://backend:8081` | giữ nguyên path (không strip) |
| `/api/recommendations/` | `http://ai-service:8082` | sửa lỗi route `/api/ai` + strip_path; AI prefix thật là `/api/recommendations` |
| `/socket.io/` | `http://backend:8081` | `proxy_http_version 1.1`, `Upgrade`, `Connection "upgrade"`; dùng cho Socket.IO |
| `/nginx_status` | local (`:8080`, chỉ network nội bộ) | `stub_status` cho exporter |

Thêm alias legacy `/api/ai/...` → rewrite sang `/api/recommendations/...`. SSE (`/api/chat/stream`, `/api/recommendations/chat/stream`) tắt `proxy_buffering` và dùng timeout 300s.

### Load balancing

- Dùng `upstream backend_upstream`/`ai_upstream` (placeholders cho scale sau).
- `resolver 127.0.0.11 valid=10s ipv6=off` + `zone` + `server ... resolve`: DNS Docker được phân giải **lúc chạy**, nên Nginx không crash khi `backend`/`ai-service` chưa tồn tại (request trả `502` thay vì container `Exited (1)`).
- `keepalive` + `proxy_next_upstream` cho retry cơ bản; không đổi cấu trúc service hiện tại.

### CORS / Request ID

- Xử lý `OPTIONS` → `204`.
- `Access-Control-Allow-Origin` theo origin cho phép (`5173`, `3002`), `Allow-Credentials: true`, expose `X-Request-ID`.
- `proxy_set_header X-Request-ID $request_id;`.

### Rate limit

- Backend đã có global 100 req/phút + limit riêng login/register/refresh → vẫn là lớp bảo vệ chính.
- Nginx dùng `limit_req_zone $binary_remote_addr zone=api_limit:10m rate=2r/s` (tương đương 120/phút) làm lớp thứ nhất; lưu ý **local memory, không share Redis như Kong**.

### Monitoring (không được regression)

- Log Nginx ra **stdout JSON** để Promtail tiếp tục đọc.
- `docker/promtail/promtail-config.yml`: đổi regex `backend|ai-service|kong` → `backend|ai-service|nginx`.
- Thêm `nginx-prometheus-exporter` sidecar đọc `/nginx_status` + thêm job `nginx` trong `docker/prometheus/prometheus.yml`.
- Grafana: giữ datasource hiện tại; không bắt buộc dashboard mới, nhưng có sẵn metric `nginx_up`, `nginx_connections_*`, `nginx_requests`.
- Không đụng trace (Kong vốn không có trace được scrape).

### Container / rollback

- **Giữ nguyên** `gateway/kong.yml`.
- Trong `docker/docker-compose.yml`, `docker/docker-compose.dev.yml`, `docker/docker-compose.prod.yml`, `docker/compose.dev.yml`: **comment** service `kong` (giữ cấu hình cũ dưới dạng comment), thêm service `nginx` dùng `nginx:alpine`.
- Dev mapping `8000:80`; prod mapping `80:80` (giữ `GOOGLE_CALLBACK_URL=http://localhost:80/api/auth/google/callback`). HTTPS 443 khi có cert.

---

## 4. Giới hạn

- ❌ Không xóa `gateway/kong.yml`.
- ❌ Không đổi logic auth/backend trong task này.
- ❌ Không commit/push.

---

## 5. Phases / checklist

### Phase 1 — Config

- [x] Tạo `gateway/nginx.conf` + `gateway/conf.d/*.conf` theo mục 3.
- [x] Comment service `kong`, thêm service `nginx` + exporter trong 4 file compose.
- [x] Mount `gateway/nginx.conf` read-only.

### Phase 2 — Observability

- [x] Đổi Promtail regex sang `nginx`.
- [x] Thêm Prometheus job `nginx` qua exporter.
- [x] Kiểm tra log `{container="nginx"}` xuất hiện trong Loki.

### Phase 3 — Docs & smoke test

- [x] Cập nhật `docs/BACKEND.md`, `docs/FRONTEND.md`, `docs/ProjectOverview.md`, `docs/LOGGING-OBSERVABILITY.md`: Kong → Nginx, sửa route `/api/recommendations`.
- [x] Ghi chú `gateway/otel-collector-config.yaml` đang không dùng (hoặc xóa nếu developer đồng ý).
- [x] Smoke: `/api/health`, `/api/auth/google` redirect, `/api/recommendations/...`, CORS preflight, 429, `/socket.io/`, metric Nginx trong Prometheus.
- [x] `git diff --check`.

---

## 6. Ghi chú

Thực hiện sau V43. Không commit/push cho đến khi developer yêu cầu.
