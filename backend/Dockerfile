ARG DOCKER_REGISTRY=""
FROM ${DOCKER_REGISTRY}python:3.12-slim

ARG APT_MIRROR=""
ARG PIP_INDEX_URL=""
ARG PIP_TRUSTED_HOST=""

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Optional apt mirror swap (no-op when APT_MIRROR is empty)
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org/debian|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
      sed -i "s|http://deb.debian.org/debian|$APT_MIRROR|g" /etc/apt/sources.list 2>/dev/null || true; \
    fi

WORKDIR /app

COPY pyproject.toml ./
RUN pip install --upgrade pip \
    ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
    ${PIP_TRUSTED_HOST:+--trusted-host $PIP_TRUSTED_HOST} \
 && pip install \
    ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
    ${PIP_TRUSTED_HOST:+--trusted-host $PIP_TRUSTED_HOST} \
    "fastapi>=0.115" "uvicorn[standard]>=0.32" "pydantic>=2.9" "pydantic-settings>=2.6" \
    "sqlalchemy[asyncio]>=2.0" "asyncpg>=0.30" "python-ulid>=3.0" "httpx>=0.27"

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
