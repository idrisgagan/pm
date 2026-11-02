# Stage 1: build the frontend to static files in /app/frontend/out.
# Node 22.12 or later is required by vitest 5, a dev dependency npm ci installs.
FROM node:24-slim AS frontend

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: the app. Only the built files are copied from stage 1.
FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /usr/local/bin/uv

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PM_STATIC_DIR=/app/frontend/out

WORKDIR /app/backend

# Install dependencies before copying the code, so code changes reuse this layer.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY backend/ ./
COPY --from=frontend /app/frontend/out /app/frontend/out

# The data folder must exist and belong to the app user before the volume is
# mounted, so Docker copies that ownership into a new volume.
RUN useradd --create-home --uid 1000 app \
    && mkdir -p data \
    && chown -R app:app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3)"]

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
