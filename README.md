# Movie App - Recommendation System

## About

A modern recommendation system built with NestJS, Python, PostgreSQL and Vector Database.

Tên đề tài *	Ứng dụng mô hình ngôn ngữ vào hệ thống khuyến nghị
Thuộc bộ môn	Mạng máy tính
Ngành	503 - KHMT
Đồng hướng dẫn	
Yêu cầu	Số SV tối đa: 2     Số lượng đăng ký tối đa: 5
Mô tả	
Yêu cầu ban đầu:  SV đọc tìm hiểu, có thể dùng các từ khoá gợi ý. SV lưu ý về việc sẽ báo cáo hàng tuần, đồng bộ git và ghi log các thí nghiệm. Hãy cân nhắc trước khi chọn đề tài.

Mô tả:
Đề tài khai thác mô hình ngôn ngữ để cải thiện hệ thống gợi ý. Thay vì chỉ dựa trên ID sản phẩm hoặc lịch sử mua hàng, hệ thống có thể hiểu mô tả sản phẩm, đánh giá người dùng, câu truy vấn tự nhiên và hồ sơ sở thích. Sinh viên có thể dùng BERT, Sentence-BERT hoặc LLM embedding để biểu diễn văn bản và tính độ phù hợp giữa người dùng với sản phẩm.

Các ứng dụng cụ thể sinh viên có thể triển khai:

Gợi ý sản phẩm dựa trên mô tả bằng ngôn ngữ tự nhiên.
Gợi ý bài báo, sách, khóa học hoặc phim dựa trên tóm tắt nội dung.
Hệ thống tìm kiếm ngữ nghĩa: nhập câu hỏi, trả về sản phẩm phù hợp.
Tạo giải thích đơn giản cho kết quả gợi ý.
So sánh TF-IDF/BM25 với BERT/Sentence-BERT embedding.
Yêu cầu cụ thể từ sinh viên:

Biết xử lý văn bản và embedding.
Biết dùng mô hình pretrained từ Hugging Face.
Hiểu semantic similarity, cosine similarity, vector search.
Biết xây dựng baseline đơn giản như TF-IDF hoặc BM25.
Với luận văn: cần có mô hình lai giữa content-based, collaborative filtering và language model.
Từ khóa tìm hiểu:

Language model
BERT
Sentence-BERT
Text embedding
Semantic search
BM25
TF-IDF
Retrieval-based recommendation
LLM for recommendation
Vector database

<!-- image Screenshots -->

(![Screenshot](assets/screenshot.png))

## Features

- Movie Domain
- Recommendation System
- Semantic Search

## Prerequisites

- Node.js (v18 or higher)
- PostgreSQL (v14 or higher)
- Python (v3.10 or higher)
- Docker (v20.10 or higher)

## Technologies

- NestJS
- Python
- PostgreSQL
- Vector Database
- Docker
- RabbitMQ
- OpenTelemetry
- LLM for Recommendation System (API, self-hosted, or custom model)

## Structure folder

## Installation

- Clone the repository:

```bash
git clone github link
```

- Install dependencies:

```bash
cd backend
npm install
```

- Run backend server:

```bash
npm run dev
```

- Run docker-compose: root folder

```bash
docker compose \
  -p movie-app \
  -f docker/docker-compose.dev.yml \
  -f docker/docker-compose.observability.yml \
  up -d
```

- Health check: http://localhost:8081/health

```curl
curl -X 'GET' \
  'http://localhost:8081/api/health' \
  -H 'accept: application/json'
```

- Response health check:

```json
{
  "status": "ok",
  "info": {
    "nestjs-docs": {
      "status": "up"
    },
    "database": {
      "responseTime": 120,
      "status": "up"
    }
  },
  "error": {},
  "details": {
    "nestjs-docs": {
      "status": "up"
    },
    "database": {
      "responseTime": 120,
      "status": "up"
    }
  }
}
```

## Usage

## Api Documentation

- Backend APIs: http://localhost:8081/api

- AI services APIs: http://localhost:8082/docs

## Contributing

- Thuyendev
- other

## License
