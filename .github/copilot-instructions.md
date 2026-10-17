# Copilot instructions for `movie-recommendation-system_be`

## Repository shape

This is a monorepo with three independently runnable services:

- `backend/`: NestJS 11 REST API on port `8081`, backed by PostgreSQL through TypeORM. It owns authentication/RBAC, movie metadata, user interactions, messaging, Redis, file storage, and failed-event persistence.
- `ai-service/`: Python/FastAPI recommendation service on port `8082`. It owns semantic search, hybrid recommendation logic, vector storage, model/training integrations, Redis, and RabbitMQ event consumers.
- `frontend/`: Next.js 16 App Router application on port `3002`. It provides the user/admin web UI, calls backend APIs through the client/API-layer code, and uses React Query, Zustand, and route groups for main/admin/auth areas.

The intended cross-service flow is: frontend -> backend HTTP; backend publishes movie/interaction events through RabbitMQ; AI service consumes those events and serves recommendation/search HTTP endpoints. PostgreSQL is the backend system of record. Redis, RabbitMQ, Chroma/Qdrant-compatible vector storage, object storage, and observability services are provisioned by the Docker Compose files, but not every provisioned integration is necessarily enabled in every environment.

Read the relevant current source and service documentation before relying on older roadmap diagrams. In particular, `docs/BACKEND.md` and `docs/AI-SERVICE.md` describe historical gaps; confirm the implementation in `backend/src/`, `ai-service/src/`, and the current plans.

## Commands

Run commands from the service directory that owns the code. Dependencies are managed with npm for the TypeScript services and pip/PEP 621 for Python.

### Backend

```powershell
cd backend
npm install
npm run dev
npm run build
npm run lint
npm test
npm run test:e2e
```

Run one unit test file:

```powershell
npm test -- --runInBand app.controller.spec.ts
```

Run one e2e test file:

```powershell
npm run test:e2e -- --runInBand test/app.e2e-spec.ts
```

Other available checks are `npm run format`, `npm run test:watch`, `npm run test:cov`, and `npm run test:debug`. The backend Jest unit configuration uses `src` as its root; e2e tests use `backend/test/jest-e2e.json`.

### AI service

```powershell
cd ai-service
.\.venv\Scripts\activate
pip install -e .
pip install -e ".[dev]"
uvicorn src.api.server:app --host localhost --port 8082 --reload
pytest
pytest -q
```

Run one test module or one test:

```powershell
pytest -q tests/test_search_consistency.py
pytest -q tests/test_search_consistency.py::test_tfidf_consistency
```

There is no separate Python lint script configured in `ai-service/pyproject.toml`. Scripts for data/model workflows live under `ai-service/scripts/`; notebooks under `ai-service/notebooks/` are exploratory and may require local datasets and services.

### Frontend

```powershell
cd frontend
npm install
npm run dev
npm run build
npm run lint
npm test
npm run test:watch
```

Run a focused Vitest test by passing its path or name:

```powershell
npm test -- src/path/to/file.test.ts
npm test -- -t "test name"
```

The frontend development server is configured for port `3002`, despite the default create-next-app README mentioning port `3000`.

### Local infrastructure

From the repository root:

```powershell
docker compose -p movie-app -f docker/docker-compose.dev.yml -f docker/docker-compose.observability.yml up -d
```

The development compose file provides PostgreSQL, Redis, RabbitMQ, Kong, Prometheus, Grafana, and Jaeger. Backend Swagger is at `http://localhost:8081/api`; AI Swagger is at `http://localhost:8082/docs`; backend health is `GET http://localhost:8081/api/health`.

## Architecture and implementation boundaries

### Backend request pipeline

`backend/src/main.ts` bootstraps the Nest application with the global `api` prefix, strict `ValidationPipe`, camel-case transformation, request logging, the shared HTTP exception filter, cookie parsing, CORS, and Swagger. `backend/src/app.module.ts` wires configuration validation, TypeORM entities, CLS, Winston, scheduling, infrastructure modules, and domain modules.

Domain code is organized by Nest module under `backend/src/modules/`; cross-cutting integrations are under `backend/src/infrastructure/` and `backend/src/common/`. Message publishing/consuming belongs in the messaging/events modules rather than in controllers. Keep persistence concerns behind the repository interfaces/pattern already used by the module instead of injecting raw TypeORM repositories directly into application services.

TypeORM currently uses `synchronize: true` and there is no migration workflow; treat entity/schema changes as high-impact and inspect the database docs and existing entities before changing them.

### AI service lifecycle

`ai-service/src/api/server.py` creates the FastAPI app and initializes dependencies in its lifespan: vector store, `RecommendService`, movie and interaction event handlers, scheduled training, RabbitMQ consumers, Redis, and persisted model mappings. Routes use the configured API prefix (currently `/api/recommendations`) and should access shared runtime objects through `app.state` when following the existing pattern.

AI recommendation code is split between `src/core/` integrations/configuration/queues, `src/services/` business logic and event handling, and `src/models/` search/model implementations. `Settings` is loaded from `.env`, `.env.development`, and `.env.production` through Pydantic settings. Vector providers and collection names are configuration-driven; do not hard-code a provider or collection when an existing setting is available.

RabbitMQ names and retry/DLQ behavior are configuration contracts. Preserve the existing movie exchange/routing keys and interaction exchange/queue/DLQ settings when changing event flows. Keep event handlers idempotent and avoid blocking the HTTP request path with long-running training or indexing work.

### Frontend composition

The frontend uses the App Router with route groups such as `src/app/(main)` and `src/app/(admin-layout)`, plus Next route handlers under `src/app/api`. Global providers are composed in `src/app/layout.tsx` (`ThemeProvider`, React Query, auth initialization, app context, and notifications). Reuse the existing API clients, hooks, stores, shared components, and UI primitives instead of duplicating request or state-management logic.

Before changing Next.js code, read the applicable guide under `frontend/node_modules/next/dist/docs/`. Preserve the generated Next.js agent-rules block in `frontend/AGENTS.md`; it is regenerated by Next tooling.

## Conventions that are repository-specific

- Backend TypeScript identifiers use camelCase; database columns use snake_case. Existing path aliases include `@/*`, `@config/*`, `@modules/*`, `@common/*`, and `@infrastructure/*`.
- Backend list endpoints use the shared pagination contract (`page`, `limit`, optional `keyword`) and return the repository's `ApiResponse` shape. Successful responses include `success`, `statusCode`, `message`, and `result`; paginated responses also include pagination metadata.
- Backend errors must go through Nest `HttpException` or the repository `AppException`/global filter. Client-facing exception messages are Vietnamese, and raw `Error` throws are not the project convention. Do not log passwords, tokens, secrets, or other sensitive data.
- DTO validation is enforced globally with whitelisting, rejection of non-whitelisted properties, and transformation. Keep validation in DTOs/params rather than accepting unvalidated request bodies.
- User behavior such as views, ratings, comments, likes, and favorites is intended to feed the `interactions` history used by recommendation workflows; preserve the corresponding event publication when changing interaction flows.
- AI-service Python imports assume execution from `ai-service` with `src` on the import path. Follow the existing absolute-import style (`core`, `services`, `models`, `utils`) and async service interfaces.
- Semantic search and hybrid recommendation outputs use the existing service formatting and evidence fields. Preserve movie ID mapping and cold-start handling when changing recommendation logic.
- Keep public API naming consistent with the existing camelCase response formatting even when source data or database columns are snake_case.
- Plans and implementation notes belong in `docs/plans/` using the repository's `V{n}_{slug}.md` convention. Update the active plan as work progresses.
- `docs/BACKEND_RULES.md` is a read-only project rule document unless a developer explicitly asks to change it. Do not commit or push unless explicitly requested.

## Source of truth

For a task, read `AGENTS.md` first, then the relevant service-specific assistant rules and the closest existing implementation/test. Prefer current code over README structure diagrams. Important references include:

- `AGENTS.md`
- `docs/BACKEND_RULES.md`
- `docs/ProjectOverview.md`
- `docs/BACKEND.md`
- `docs/AI-SERVICE.md`
- `ai-service/docs/KHOI_DONG_FASTAPI.md`
- `frontend/AGENTS.md` and `frontend/CLAUDE.md`
