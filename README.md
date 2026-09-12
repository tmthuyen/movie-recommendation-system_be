# Movie App - Recommendation System

## About

A modern recommendation system built with NestJS, Python, PostgreSQL and Vector Database.

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

- AI services APIs: http://localhost:8082/api

## Contributing

- Thuyendev
- other

## License
