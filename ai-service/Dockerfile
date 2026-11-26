# =========================================================
# BASE
# =========================================================
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    TZ=Asia/Ho_Chi_Minh

WORKDIR /app

# Runtime system libraries required by native wheels:
# - libgomp1: OpenMP runtime for torch / implicit / scikit-learn
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       ca-certificates \
       libgomp1 \
    && rm -rf /var/lib/apt/lists/*


# =========================================================
# BUILDER
# =========================================================
FROM base AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       build-essential \
       gcc \
    && rm -rf /var/lib/apt/lists/*

RUN python -m venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH"

# Copy only requirements to cache dependencies
COPY pyproject.toml ./
COPY . .

# Install dependencies
ARG TORCH_VERSION=2.6.0

RUN pip install --no-cache-dir .
    "torch==${TORCH_VERSION}+cpu" \
    --index-url https://download.pytorch.org/whl/cpu

RUN printf 'torch==%s+cpu\n' "$TORCH_VERSION" > /tmp/torch-constraints.txt \
    && pip install --no-cache-dir \
       -c /tmp/torch-constraints.txt .


# =========================================================
# DEVELOPMENT
# =========================================================
FROM builder AS development

ENV ENVIRONMENT=development

EXPOSE 8082

CMD ["uvicorn", "src.api.server:app", "--host", "0.0.0.0", "--port", "8082", "--reload"]

# =========================================================
# PRODUCTION
# =========================================================
FROM base AS production

COPY --from=builder /opt/venv /opt/venv

ENV PATH="/opt/venv/bin:$PATH" \
    ENVIRONMENT=production

COPY --from=builder /app /app

RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8082

CMD ["uvicorn", "src.api.server:app", "--host", "0.0.0.0", "--port", "8082"]