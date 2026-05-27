#!/usr/bin/env bash
# Pholex dev stack control (MVP — dev mode only)
#   scripts/deploy.sh           up
#   scripts/deploy.sh --down    down (volumes preserved)
#
# Beta deployment, --sync-db, Docker Swarm 등은 docs/infra.md 설계만 남기고
# MVP 범위에서는 구현하지 않는다.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PROJECT="pholex-dev"
ENV_FILE=".env.dev"
COMPOSE_ARGS=(-p "$PROJECT" -f docker-compose.yml -f docker-compose.dev.yml)

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy.sh           # bring dev stack up (build + detach)
  scripts/deploy.sh --down    # tear dev stack down (volumes preserved)
  scripts/deploy.sh -h        # this help
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
    --down) DO_DOWN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ "$DO_DOWN" == 1 ]]; then
  echo "[deploy] tearing dev stack down (volumes preserved)"
  docker compose "${COMPOSE_ARGS[@]}" down
  exit 0
fi

ensure_env_file
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
