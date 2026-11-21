# Các service trong hệ thống Movie Discovery & Recommendation System

- Hệ thống gồm nhiều service, mỗi service có chức năng riêng, giao tiếp với nhau qua API hoặc message queue. Các service chính bao gồm:
  - **AI service**: Cung cấp API gợi ý phim, học từ dữ liệu người dùng, tính toán vector user/movie, inference recommendation.
  - **Search service**: Cung cấp API tìm kiếm phim, lưu trữ dữ liệu phim vào ElasticSearch, giảm tải cho backend chính và database.
  - **Backend service**: Cung cấp API cho các chức năng backend, quản lý dữ liệu người dùng, phim, đánh giá, v.v.

## Cấu trúc thư mục

- Thư mục cha `root/services/` chứa các service chính:

- `search-service/`: ElasticSearch service cho movie search.

- Các service như `backend/`, `ai-service/`, chưa được đưa vào thư mục code này

## Tổng quan các service

<!-- Table: name, description, technologies, note -->

| Service         | Description                                                                                                                                                             | Technologies                     | Note              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | ----------------- |
| AI service      | Cung cấp API gợi ý phim, học từ dữ liệu người dùng, tính toán vector user/movie, inference recommendation                                                               | FastAPI + Chroma + RabbitMQ      | Chưa đưa code `X` |
| Search service  | Cung cấp API tìm kiếm phim, lưu trữ dữ liệu phim vào ElasticSearch, giảm tải cho backend chính và database, hỗ trợ tìm kiếm theo từ khóa, thể loại, năm phát hành, v.v. | Java Spring Boot + ElasticSearch | Chưa đưa code `X` |
| Backend service | Cung cấp API cho các chức năng backend, quản lý dữ liệu người dùng, phim, đánh giá, v.v.                                                                                | NestJS + TypeORM + PostgreSQL    | Chưa đưa code `X` |

## Các docs tham chiếu

- `root/docs/`: chứa các tài liệu tổng quan, quy ước code (RULES), kế hoạch triển khai, tóm tắt các module.

## Lưu ý

- Thư mục này chưa có code và chưa triển khai tính năng search service. Các agent chưa làm việc và code trong thư mục này.
