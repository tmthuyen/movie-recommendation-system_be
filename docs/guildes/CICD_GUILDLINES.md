# Hướng dẫn CI/CD trước khi push code

- Các nhánh: `main`, `dev`, `production`, `ci-cd`
- CI chạy trên `dev` và `ci-cd` (push + pull_request); CD chạy trên `main` và `production` (hiện đang ở mức **placeholder**, chưa deploy thật).

## Bảng workflow hiện tại (`.github/workflows/`)

| Workflow      | File              | Trigger                                | Paths           | Checks                                                                                                                                                                                                        |
| ------------- | ----------------- | -------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BACKEND CI    | `backend-CI.yml`  | push/PR → `dev`, `ci-cd`               | `backend/**`    | npm ci → lint → type-check (`tsc --noEmit`) → test (`npm test -- --coverage`, ngưỡng ở `package.json` → `jest.coverageThreshold`) → upload artifact `backend/coverage` → build (nest) · matrix Node 20.x/22.x |
| Frontend CI   | `frontend-CI.yml` | push/PR → `dev`, `ci-cd`               | `frontend/**`   | npm ci → lint → type-check (`tsc --noEmit`) → test (`npm test -- --coverage`, ngưỡng ở `vitest.config.ts`) → upload artifact `frontend/coverage` → build (next) · matrix Node 20.x/22.x                       |
| AI-SERVICE CI | `ai-CI.yml`       | push/PR → `dev`, `ci-cd`               | `ai-service/**` | pip install `-e ".[dev]"` → black --check → isort --check-only → pytest `--cov=src --cov-fail-under=65` → import check `src.api.server` · matrix Python 3.10/3.11/3.12                                        |
| BACKEND CD    | `backend-CD.yml`  | push → `main`, `production` (+ manual) | `backend/**`    | detect Dockerfile → placeholder deploy                                                                                                                                                                        |
| Frontend CD   | `frontend-CD.yml` | push → `main`, `production` (+ manual) | `frontend/**`   | detect package.json → placeholder deploy                                                                                                                                                                      |
| AI-SERVICE CD | `ai-CD.yml`       | push → `main`, `production` (+ manual) | `ai-service/**` | pip install build-check → detect Dockerfile → placeholder deploy                                                                                                                                              |

Lưu ý: **bước `paths` của workflow file phải khớp đúng tên file** — đổi tên file workflow thì phải sửa `paths` tương ứng (đã từng bị lỗi với `ai-service-CI.yml`).

## Chạy local trước khi push (giống hệt CI)

### AI-Service (Python FastAPI)

```bash
cd ai-service
python -m venv .venv
.\.venv\Scripts\activate        # Windows
pip install -e ".[dev]"         # cài deps + black/isort/pytest
```

| Action |  Type  | Branch         | Commands                                                                                        |
| :----: | :----: | :------------- | :---------------------------------------------------------------------------------------------- |
| **CI** |  Lint  | `dev`, `ci-cd` | `black src`<br>`black --check src`<br> `isort src` <br>`isort --check-only src`                 |
| **CI** |  Test  | `dev`, `ci-cd` | `pytest tests/ -v --cov=src --cov-fail-under=65`                                                |
| **CI** | Verify | `dev`, `ci-cd` | `set JWT_SECRET_KEY=...` + `set JWT_ALGORITHM=HS256` rồi<br>`python -c "import src.api.server"` |

- 2 biến `JWT_SECRET_KEY` / `JWT_ALGORITHM` **bắt buộc** khi import app (`Settings` không có default) — CI đã set giá trị dummy.
- Repo **không có `requirements.txt`**: cache pip theo `ai-service/pyproject.toml` (`cache-dependency-path` trong workflow).
- **Máy dev hiện tại**: `ai-service/.venv/pyvenv.cfg` đã bật `include-system-site-packages = true` và cài thêm `python-jose`, `prometheus-fastapi-instrumentator`, `opentelemetry-instrumentation-requests`, `boto3` → chạy test **trong venv**:
  ```powershell
  cd ai-service
  .\.venv\Scripts\python.exe -m pytest tests -q --cov=src --cov-fail-under=65
  ```
- Cấu trúc test phản ánh `src/` (1 file test / 1 module): xem `docs/plans/V21_testing_ai-service-test-structure.md`. Hiện trạng 2026-11-04: **659 passed / 4 skipped, 0 warning**, coverage **94%**.
- Môi trường dev đã pin `chardet<6` (textract kéo bản 7.x vượt range của `requests`) và cài `httpx2` (Starlette 1.6 deprecate TestClient dùng `httpx`) — 2 warning này là của **package môi trường**, không phải code dự án. Trên CI (`pip install -e ".[dev]"`) có thể vẫn thấy warning; muốn sạch thì thêm `chardet<6` + `httpx2` vào extras `dev`.

### Frontend (NextJS)

| Action |    Type    | Branch         | Commands                                                          |
| :----: | :--------: | :------------- | :---------------------------------------------------------------- |
| **CI** |    Lint    | `dev`, `ci-cd` | `npm ci` rồi `npm run lint` (fix tự động: `npx eslint . --fix`)   |
| **CI** | Type check | `dev`, `ci-cd` | `npm run type-check`                                              |
| **CI** |    Test    | `dev`, `ci-cd` | `npm test -- --coverage` (threshold 60% trong `vitest.config.ts`) |
| **CI** |   Build    | `dev`, `ci-cd` | `npm run build`                                                   |

- Node >= 20.9 (Next 16). Đã có test (Vitest + Testing Library + jsdom), **không còn `passWithNoTests`**.
- Chạy local: `npm test` (hoặc `npm test -- --coverage`) — coverage output ở `frontend/coverage/` (đã gitignore).
- Trang dùng `useSearchParams()` **phải** bọc `<Suspense>`, nếu không `next build` fail khi prerender.

### Backend (NestJS)

| Action |    Type    | Branch         | Commands                                                                             |
| :----: | :--------: | :------------- | :----------------------------------------------------------------------------------- |
| **CI** |    Lint    | `dev`, `ci-cd` | `npm ci` rồi `npm run lint` (fix tự động: `npm run lint:fix`)                        |
| **CI** | Type check | `dev`, `ci-cd` | `npm run type-check`                                                                 |
| **CI** |    Test    | `dev`, `ci-cd` | `npm test -- --coverage` (threshold trong `package.json` → `jest.coverageThreshold`) |
| **CI** |   Build    | `dev`, `ci-cd` | `npm run build`                                                                      |

- Node >= 20 (NestJS 11).
- Jest đã cấu hình `moduleNameMapper` cho alias `@/`, `@config/`, `@modules/`, `@common/`, `@infrastructure/` — spec mới dùng DI token thì mock đúng token trong `providers`.
- `collectCoverageFrom` đã loại `src/seed/**`, `**/*.module.ts`, `main.ts`, `types/**`, `**/*.spec.ts` (seed script cần DB thật, module chỉ là wiring).
- Chạy local nhanh (tránh worker bị chặn trong sandbox Windows): `npx jest --runInBand`. Coverage: `npx jest --runInBand --coverage` → `backend/coverage/`.

## Docker

- `backend/Dockerfile`, `ai-service/Dockerfile` tồn tại; CD hiện chỉ **detect** và log placeholder, chưa build/push image.
- `docker/docker-compose.prod.yml` đang trống — cần flesh out khi bật deploy thật.
