# syntax=docker/dockerfile:1.7
# StockHub backend. Targets: runtime (default, for deployment) and dev (compose dev).
# Needs backend/pyproject.toml with the dependencies and backend/uv.lock (uv sync --frozen).

ARG PYTHON_VERSION=3.14
ARG UV_VERSION=0.13.8

FROM ghcr.io/astral-sh/uv:${UV_VERSION} AS uv

# ---- build the virtualenvs (build tools stay out of the final image) ----
FROM python:${PYTHON_VERSION}-slim-trixie AS builder
COPY --from=uv /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/opt/venv
WORKDIR /src
COPY pyproject.toml uv.lock ./
# Production dependencies only
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# Same plus dev group (ruff, mypy, pytest), for the dev target
FROM builder AS builder-dev
ENV UV_PROJECT_ENVIRONMENT=/opt/venv-dev
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project

# ---- shared runtime base ----
FROM python:${PYTHON_VERSION}-slim-trixie AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid app --home-dir /app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
EXPOSE 8000

# ---- dev: reload, dev tools; source is bind-mounted by docker-compose.yml ----
FROM base AS dev
COPY --from=builder-dev /opt/venv-dev /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
USER 10001:10001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ---- runtime: default target ----
FROM base AS runtime
COPY --from=builder /opt/venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
COPY --chown=app:app app ./app
COPY --chown=app:app indicators ./indicators
COPY --chown=app:app alembic.ini ./
COPY --chown=app:app migrations ./migrations
USER 10001:10001
# Needs a GET /health route on the backend (checks the database); see deploy/README.md
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
