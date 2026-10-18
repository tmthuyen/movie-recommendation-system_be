# Hướng dẫn CI/CD trước khi push code

- Các nhánh: `main`, `dev`, `production`, `ci-cd`
- CI chạy trên `dev` và `ci-cd` (push + pull_request); CD chạy trên `main` và `production` (hiện đang ở mức **placeholder**, chưa deploy thật).

## Bảng workflow hiện tại (`.github/workflows/`)

| Workflow | File | Trigger | Paths | Checks |
|---|---|---|---|---|
| BACKEND CI | `backend-CI.yml` | push/PR → `dev`, `ci-cd` | `backend/**` | npm ci → lint → type-check (`tsc --noEmit`) → test (jest) → build (nest) · matrix Node 20.x/22.x |
| Frontend CI | `frontend-CI.yml` | push/PR → `dev`, `ci-cd` | `frontend/**` | npm ci → lint → type-check (`tsc --noEmit`) → test (vitest) → build (next) · matrix Node 20.x/22.x |
| AI-SERVICE CI | `ai-CI.yml` | push/PR → `dev`, `ci-cd` | `ai-service/**` | pip install `-e ".[dev]"` → black --check → isort --check-only → pytest tests/ → import check `src.api.server` · matrix Python 3.10/3.11/3.12 |
| BACKEND CD | `backend-CD.yml` | push → `main`, `production` (+ manual) | `backend/**` | detect Dockerfile → placeholder deploy |
| Frontend CD | `frontend-CD.yml` | push → `main`, `production` (+ manual) | `frontend/**` | detect package.json → placeholder deploy |
| AI-SERVICE CD | `ai-CD.yml` | push → `main`, `production` (+ manual) | `ai-service/**` | pip install build-check → detect Dockerfile → placeholder deploy |

Lưu ý: **bước `paths` của workflow file phải khớp đúng tên file** — đổi tên file workflow thì phải sửa `paths` tương ứng (đã từng bị lỗi với `ai-service-CI.yml`).

## Chạy local trước khi push (giống hệt CI)

### AI-Service (Python FastAPI)

```bash
cd ai-service
python -m venv .venv
.\.venv\Scripts\activate        # Windows
pip install -e ".[dev]"         # cài deps + black/isort/pytest
```

| Action | Type | Branch | Commands |
|:---:|:---:|:---|:---|
| **CI** | Lint | `dev`, `ci-cd` | `black --check src`<br>`isort --check-only src` |
| **CI** | Test | `dev`, `ci-cd` | `pytest tests/ -v` |
| **CI** | Verify | `dev`, `ci-cd` | `set JWT_SECRET_KEY=...` + `set JWT_ALGORITHM=HS256` rồi<br>`python -c "import src.api.server"` |

- 2 biến `JWT_SECRET_KEY` / `JWT_ALGORITHM` **bắt buộc** khi import app (`Settings` không có default) — CI đã set giá trị dummy.
- Repo **không có `requirements.txt`**: cache pip theo `ai-service/pyproject.toml` (`cache-dependency-path` trong workflow).

### Frontend (NextJS)

| Action | Type | Branch | Commands |
|:---:|:---:|:---|:---|
| **CI** | Lint | `dev`, `ci-cd` | `npm ci` rồi `npm run lint` (fix tự động: `npx eslint . --fix`) |
| **CI** | Type check | `dev`, `ci-cd` | `npm run type-check` |
| **CI** | Test | `dev`, `ci-cd` | `npm test -- --passWithNoTests` |
| **CI** | Build | `dev`, `ci-cd` | `npm run build` |

- Node >= 20.9 (Next 16). Project chưa có test → `vitest.config.ts` bật `passWithNoTests: true`.
- Trang dùng `useSearchParams()` **phải** bọc `<Suspense>`, nếu không `next build` fail khi prerender.

### Backend (NestJS)

| Action | Type | Branch | Commands |
|:---:|:---:|:---|:---|
| **CI** | Lint | `dev`, `ci-cd` | `npm ci` rồi `npm run lint` (fix tự động: `npm run lint:fix`) |
| **CI** | Type check | `dev`, `ci-cd` | `npm run type-check` |
| **CI** | Test | `dev`, `ci-cd` | `npm test -- --passWithNoTests` |
| **CI** | Build | `dev`, `ci-cd` | `npm run build` |

- Node >= 20 (NestJS 11).
- Jest đã cấu hình `moduleNameMapper` cho alias `@/`, `@config/`, `@modules/`, `@common/`, `@infrastructure/` — spec mới dùng DI token thì mock đúng token trong `providers`.

## Docker

- `backend/Dockerfile`, `ai-service/Dockerfile` tồn tại; CD hiện chỉ **detect** và log placeholder, chưa build/push image.
- `docker/docker-compose.prod.yml` đang trống — cần flesh out khi bật deploy thật.
