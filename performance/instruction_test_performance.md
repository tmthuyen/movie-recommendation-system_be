# Yêu cầu xây dựng Performance Testing bằng k6

Bạn là Senior Performance Engineer, có kinh nghiệm về Grafana k6, NestJS, FastAPI, PostgreSQL, Redis, RabbitMQ và Prometheus/Grafana.

Hãy phân tích source code hiện tại và xây dựng một bộ Performance Testing hoàn chỉnh cho dự án Movie Recommendation System.

## Công nghệ

- Backend: NestJS, TypeORM, PostgreSQL.
- AI Service: FastAPI.
- Cache: Redis.
- Message Broker: RabbitMQ.
- API Gateway: Kong.
- Monitoring: OpenTelemetry.
- Load Testing: Grafana k6.

## Dữ liệu

- Đã có 1.000 user fake với email/password.
- Có hàng nghìn movie và metadata.
- Cần sử dụng JWT riêng cho từng authenticated user.
- Public API không phụ thuộc vào số lượng account.
- Interaction phải sử dụng movie ID và user ID thực tế.

## Các API cần kiểm thử

**Authentication**

- Register
- Login
- Refresh token

**Public Movie APIs**

- Movie list/detail
- Search keyword
- Filter nhiều điều kiện
- Sort
- Pagination
- Trending/popular movies

**Private APIs**

- Click, Like, Rating, Comment
- Recommendation

## Các chiến lược kiểm thử

Triển khai đầy đủ:

- Smoke Test
- Load Test
- Stress Test
- Spike Test
- Soak Test
- Breakpoint Test
- Capacity Test
- Scalability Test
- Concurrency Test
- Volume Test
- Recovery Test

## Yêu cầu về VU và RPS

Hỗ trợ các mức:

100, 500, 1.000, 2.000, 5.000, 10.000, 20.000+ VUs.

Phải phân biệt VUs, registered accounts và RPS.

- Public API: Có thể tạo lượng VU lớn, không cần đăng nhập.
- Private API: Sử dụng JWT hợp lệ, account mapping riêng và có cơ chế account reuse khi cần.
- Login: Đo riêng authentication throughput.
- Dùng `ramping-vus`, `constant-vus`, `constant-arrival-rate`, `ramping-arrival-rate` phù hợp với từng bài test.

## Synthetic User Behavior

Tạo interaction theo sở thích thực tế:

- User Persona.
- Genre preference.
- Topic preference.
- Movie popularity.
- Click, Like, Rating, Comment.
- Exploration và hành vi khám phá phim mới.

Tách Synthetic Data Generator khỏi k6 Load Testing. k6 phải gửi interaction qua API thật.

## Metrics cần đo

- Total Requests và RPS.
- Throughput.
- Average, p50, p90, p95, p99 latency.
- Error rate, HTTP 4xx/5xx.
- Active VUs và dropped iterations.
- CPU, RAM.
- PostgreSQL connections, query latency, locks.
- Redis hit/miss ratio.
- RabbitMQ publish/consume rate, queue depth.
- FastAPI inference latency.

Phải có thresholds riêng cho từng nhóm API.

## Monitoring

Tích hợp Prometheus + Grafana để theo dõi:

- Public API.
- Authentication.
- Search.
- Interaction.
- Recommendation.
- PostgreSQL.
- Redis.
- RabbitMQ.
- NestJS/FastAPI.

## Yêu cầu triển khai

- Phân tích endpoint và DTO từ source code, không tự bịa API.
- Thiết kế cấu trúc thư mục chuyên nghiệp.
- Viết code k6 hoàn chỉnh, có thể chạy được.
- Tách từng chiến lược và từng nhóm API.
- Có mixed workload test.
- Có file cấu hình VU, RPS và thời gian chạy.
- Có README hướng dẫn cài đặt, chạy test và đọc kết quả.
- Có báo cáo tổng hợp để so sánh hiệu năng giữa các lần test.

# Hướng dẫn test với public API

Bạn là Senior Performance Engineer. Hãy xây dựng bộ Performance Testing bằng **Grafana k6** cho các **Public API** của project Movie Recommendation hiện tại.

### Public API cần test

- Movie list/search
- Keyword search
- Filter
- Sort
- Pagination
- Movie detail
- Genres
- Countries
- Peoples
- Interaction stats
- Public recommendation APIs nếu endpoint thực tế không yêu cầu JWT
- Health check

Hãy **đọc source code hiện tại để lấy đúng endpoint, query parameter, DTO và response structure**, không tự tạo API giả.

### Chiến lược test

Triển khai các loại:

- **Smoke Test** — 1–10 VUs để kiểm tra API hoạt động.
- **Load Test** — tăng dần tải theo các mức 100 → 500 → 1K → 2K → 5K RPS.
- **Stress Test** — tiếp tục tăng tải để tìm giới hạn hệ thống.
- **Spike Test** — tăng traffic đột ngột, ví dụ 100 → 1K → 5K → 10K RPS.
- **Breakpoint Test** — tìm mức RPS bắt đầu vượt SLO hoặc xuất hiện lỗi.
- **Soak Test** — duy trì tải ổn định trong thời gian dài để phát hiện memory leak, connection leak hoặc degradation.

Sử dụng đúng executor của k6, đặc biệt:

- `constant-vus`
- `ramping-vus`
- `constant-arrival-rate`
- `ramping-arrival-rate`

Phải giải thích khi nào dùng VU-based và khi nào dùng RPS/arrival-rate.

### High-load testing

Hỗ trợ cấu hình:

```text
100
500
1,000
2,000
5,000
10,000+
```

Không hard-code các giá trị này. Cho phép truyền bằng environment variables.

Phải theo dõi `dropped_iterations` và đảm bảo máy chạy k6 không trở thành bottleneck.

### Test workload

Không gọi duy nhất một endpoint.

Tạo workload gần với thực tế, ví dụ:

```text
30% search
20% filter + sort
20% movie detail
10% movie list
10% metadata
10% recommendation
```

Cho phép thay đổi tỷ lệ bằng configuration.

Search phải sử dụng nhiều:

- keyword
- genre
- country
- release year
- sort
- pagination

Không dùng duy nhất một movie/keyword lặp lại.

### Metrics

Đo và hiển thị riêng theo từng API:

- RPS
- Total requests
- p50
- p90
- p95
- p99
- Average latency
- Max latency
- HTTP 2xx
- HTTP 4xx
- HTTP 5xx
- Error rate
- Active VUs
- Dropped iterations

Tạo custom metrics/Trend cho từng nhóm API để biết endpoint nào trở thành bottleneck.

### Threshold

Thiết kế threshold có thể cấu hình cho:

- `http_req_failed`
- `http_req_duration`
- p95
- p99
- từng API riêng

Ví dụ:

```text
Error rate < 1%
p95 < 800ms
p99 < 1500ms
```

Không coi đây là giới hạn cố định; cho phép thay đổi qua environment variables.

### Kết quả

Sau mỗi test phải có:

- Summary rõ ràng.
- RPS thực tế.
- p95/p99.
- Error rate.
- API chậm nhất.
- Thời điểm latency bắt đầu tăng mạnh.
- Thời điểm 4xx/5xx tăng.
- Có đạt target RPS hay không.
- Có `dropped_iterations` hay không.
- Kết luận hệ thống đang bottleneck ở mức tải nào.

Hỗ trợ **k6 Web Dashboard** để xem realtime và xuất HTML report.

### Output

Tạo:

```text
performance/
├── tests/
│   ├── smoke.js
│   ├── load.js
│   ├── stress.js
│   ├── spike.js
│   ├── breakpoint.js
│   └── soak.js
├── config/
├── utils/
└── README.md
```

Code phải chạy được với project hiện tại. Không chỉ giải thích lý thuyết; hãy trực tiếp viết code k6 hoàn chỉnh dựa trên source code thực tế.
