#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

required_paths=(
  "docker-compose.yml"
  "docker-compose.dev.yml"
  "frontend"
  "backend"
  "scripts/seed_dev.sql"
  "e2e/pholex-mvp-slot1.spec.ts"
  "playwright.config.ts"
)

missing=0
for path in "${required_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    echo "MISSING: $path"
    missing=1
  fi
done

if [[ "$missing" -ne 0 ]]; then
  cat <<'EOF'
Smoke prerequisites are incomplete.
- Expected MVP runtime files are not all present yet.
- This failing smoke harness is intentional until backend/frontend scaffolding lands.
EOF
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "MISSING: docker"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "MISSING: docker compose"
  exit 1
fi

docker compose -f docker-compose.yml -f docker-compose.dev.yml config >/dev/null
echo "PASS: smoke prerequisites present and docker compose config resolves"
