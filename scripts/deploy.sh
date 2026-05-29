#!/usr/bin/env bash
# Pholex stack control
#   scripts/deploy.sh                  dev stack up
#   scripts/deploy.sh --down           dev stack down (volumes preserved)
#   scripts/deploy.sh --prod           prod(HTTPS) stack up (build frontend + up)
#   scripts/deploy.sh --prod --down    prod stack down (volumes preserved)
#
# --sync-db, Docker Swarm 등은 docs/infra.md 설계만 남기고 아직 구현하지 않는다.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# 기본값: dev. --prod 로 운영 스택 선택.
PROJECT="pholex-dev"
ENV_FILE=".env.dev"
MODE="dev"

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy.sh                  # bring dev stack up (build + detach)
  scripts/deploy.sh --down           # tear dev stack down (volumes preserved)
  scripts/deploy.sh --prod           # bring prod(HTTPS) stack up
  scripts/deploy.sh --prod --down    # tear prod stack down (volumes preserved)
  scripts/deploy.sh -h               # this help
USAGE
}

ensure_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    if [[ -f ".env.example" ]]; then
      cp .env.example "$ENV_FILE"
      echo "[deploy] '$ENV_FILE' not found — copied from .env.example."
      echo "[deploy] Edit '$ENV_FILE' as needed (mirror URLs, ADAPTER_MODE)."
    else
      echo "[deploy] '$ENV_FILE' not found and .env.example is missing." >&2
      exit 1
    fi
  fi
}

DO_DOWN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prod) MODE="prod"; PROJECT="pholex"; ENV_FILE=".env.prod"; shift ;;
    --down) DO_DOWN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$MODE" == "prod" ]]; then
  COMPOSE_ARGS=(-p "$PROJECT" -f docker-compose.yml -f docker-compose.prod.yml)
else
  COMPOSE_ARGS=(-p "$PROJECT" -f docker-compose.yml -f docker-compose.dev.yml)
fi

if [[ "$DO_DOWN" == 1 ]]; then
  echo "[deploy] tearing $MODE stack down (volumes preserved)"
  docker compose "${COMPOSE_ARGS[@]}" down
  exit 0
fi

ensure_env_file

if [[ "$MODE" == "prod" ]]; then
  # 인증서 존재 확인 (없으면 nginx 가 기동 실패하므로 미리 막아줌)
  if [[ ! -f docker/nginx/certs/pholex.crt || ! -f docker/nginx/certs/pholex.key ]]; then
    echo "[deploy] TLS 인증서가 없어요. 아래 두 파일을 넣은 뒤 다시 실행하세요:" >&2
    echo "         docker/nginx/certs/pholex.crt (fullchain)" >&2
    echo "         docker/nginx/certs/pholex.key (private key)" >&2
    echo "         자세한 안내: docker/nginx/certs/README.md" >&2
    exit 1
  fi

  echo "[deploy] 1/2 frontend 빌드 (npm ci && npm run build)"
  npm --prefix frontend ci
  npm --prefix frontend run build

  echo "[deploy] 2/2 prod stack up (project=$PROJECT, env-file=$ENV_FILE)"
  docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE" up -d --build

  cat <<'INFO'

[deploy] prod stack is up.
  Service (HTTPS)   https://<도메인>      (80 → 443 자동 리다이렉트)

  Stop:  scripts/deploy.sh --prod --down
  Logs:  docker compose -p pholex logs -f
INFO
  exit 0
fi

echo "[deploy] bringing dev stack up (project=$PROJECT, env-file=$ENV_FILE)"
docker compose "${COMPOSE_ARGS[@]}" --env-file "$ENV_FILE" up -d --build

cat <<'INFO'

[deploy] dev stack is up.
  Frontend (via nginx)   http://localhost:8080
  Backend (direct)       http://localhost:8081
  Frontend Vite (direct) http://localhost:8082
  Postgres (host port)   localhost:5433

  Stop:  scripts/deploy.sh --down
  Logs:  docker compose -p pholex-dev logs -f
INFO
