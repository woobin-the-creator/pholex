# Pholex — 인프라 & 배포 설계

> Docker Swarm · Nginx · 환경 분리 (Beta / Dev) · 배포 스크립트

> ⚠️ **현재 운영 현실은 §16을 먼저 보라.** 아래 §9·§14의 Docker Swarm / `beta` 환경 /
> LDAP / `.env.beta` 표기는 **초기 설계(로드맵·레거시)**이며 실제 가동 중인 구성과 다르다.
> 실제는 **prod(10004 HTTPS) + dev(10014 HTTP)** Compose 2스택이고, 3자(사외/사무실 PC/VM)
> Git 동기화로 코드가 흐른다 — §16에 정리했다.

---

## 9. Docker Swarm 배포

```yaml
# docker-compose.swarm.yml
version: "3.8"

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    deploy:
      replicas: 1
      placement:
        constraints: [node.role == manager]

  frontend:
    build: ./frontend
    deploy:
      replicas: 2
      update_config:
        parallelism: 1
        delay: 10s

  backend:
    build: ./backend
    deploy:
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
    environment:
      - REDIS_URL=redis://redis:6379
      - DATABASE_URL=postgresql+asyncpg://...
      - LDAP_SERVER=ldap://...

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes  # 장애 후 재시작 시 캐시 복원
    deploy:
      replicas: 1
      placement:
        constraints: [node.role == manager]
      restart_policy:
        condition: on-failure
        delay: 5s
        max_attempts: 3
    volumes:
      - redis_data:/data

  postgres:
    image: postgres:16-alpine
    deploy:
      replicas: 1
      placement:
        constraints: [node.role == manager]
    volumes:
      - pg_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=pholex
      - POSTGRES_USER=pholex
      - POSTGRES_PASSWORD_FILE=/run/secrets/db_password

volumes:
  redis_data:
  pg_data:
```

### Nginx WebSocket 프록시 설정 (필수)

```nginx
# /etc/nginx/conf.d/pholex.conf
upstream backend {
    server backend:8000;
}

server {
    listen 80;
    server_name pholex.internal;

    # WebSocket 업그레이드 헤더 (없으면 WS 연결 실패)
    location /ws/ {
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;  # WebSocket 장시간 유지
    }

    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location / {
        proxy_pass http://frontend:3000;
    }
}
```

### 결정 근거 — 배포 전략 선택

| 결정 | 고려한 대안 | 대안 거절 이유 | 선택 이유 |
|------|-------------|---------------|-----------|
| **Docker Swarm** | Kubernetes (K8s), Nomad | K8s: etcd·control plane 운영 인력 필요, 소규모(2~5노드) 대비 오버엔지니어링. Nomad: HashiCorp 의존성, 사내 운영 경험 부재 | `docker stack deploy`로 Compose 문법 그대로 재사용. 소규모 팀이 추가 인프라 학습 없이 운영 가능 |
| **Nginx (리버스 프록시)** | Traefik, HAProxy | Traefik: 동적 서비스 디스커버리는 강력하지만 Swarm 레이블 설정 복잡. HAProxy: WebSocket sticky session 설정 번거로움 | 팀 친숙도 높음, WebSocket Upgrade 헤더 처리 설정 문서화 풍부, SSL 터미네이션 간단 |
| **단일 Postgres Primary** | Primary + Replica, CockroachDB | Replica: 읽기 부하 분산 효과 있으나 초기 규모(50명)에서 오버킬. CockroachDB: 운영 복잡도, 라이선스 비용 | 50~200명 규모에서 단일 Primary + 쿼리 최적화로 충분. 향후 읽기 레플리카 추가 경로 열려 있음 |
| **Redis 단일 인스턴스** | Redis Cluster, Redis Sentinel | Cluster: 소규모 트래픽에서 샤딩 오버헤드. Sentinel: 장애 복구 자동화는 좋지만 초기 구성 복잡 | 초기 단계는 단일 인스턴스로 출발, Redis 장애 시 JWT로 세션 보조(graceful degradation). 추후 Sentinel 전환 로드맵 명시됨(리스크 섹션) |
| **서비스별 레플리카 수** | 모든 서비스 균등 레플리카 | 균등 레플리카: Postgres·Redis는 멀티 레플리카 시 데이터 정합성 복잡. Nginx도 2개 시 VIP 설정 필요 | 무상태 서비스(backend 3개, frontend 2개)만 수평 확장. 유상태 서비스(DB, Redis)는 단일 + manager 노드 고정 배치 |

---

## 14. 환경 구성 — 클로즈 베타 & 개발 환경 분리

> 1대 서버에서 Docker Compose 프로젝트 분리로 베타/개발 환경을 운용한다. 트래픽 증가 시 Docker Swarm 멀티노드로 수평 확장한다.

### 14.1 환경 구조 개요

```
VM 서버 1대
├── pholex-beta (Docker Compose 프로젝트)
│   ├── 포트: 80 / 443 (Nginx → FastAPI + Vite 빌드)
│   ├── 브랜치: main
│   ├── 설정: .env.beta
│   └── 대상: 클로즈 베타 사용자 (제한 접근)
│
└── pholex-dev (Docker Compose 프로젝트)
    ├── 포트: 10014 (Nginx) / 8081 (FastAPI HMR) / 8082 (Vite HMR)
    ├── 브랜치: 현재 작업 브랜치 (main 제외)
    ├── 설정: .env.dev
    └── 대상: 개발자 (소스 마운트, 핫 리로드)
```

### 14.2 Docker Compose 파일 구조

```
pholex/
├── docker-compose.yml           # base: 공통 서비스 정의
├── docker-compose.beta.yml      # beta 오버레이: 빌드 이미지, prod 설정
├── docker-compose.dev.yml       # dev 오버레이: 소스 마운트, hot reload
├── .env.beta                    # 베타 환경변수 (git 제외)
├── .env.dev                     # 개발 환경변수 (git 제외)
├── .env.example                 # 환경변수 템플릿 (git 포함)
└── scripts/
    └── deploy.sh                # 브랜치 기반 자동 환경 선택 배포 스크립트
```

#### docker-compose.yml (base)

```yaml
services:
  nginx:
    image: nginx:alpine
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf:ro

  frontend:
    build: ./frontend

  backend:
    build: ./backend
    environment:
      - REDIS_URL=${REDIS_URL}
      - DATABASE_URL=${DATABASE_URL}
      - LDAP_SERVER=${LDAP_SERVER}
      - SECRET_KEY=${SECRET_KEY}

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=${POSTGRES_DB}
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - pg_data:/var/lib/postgresql/data

volumes:
  pg_data:
  redis_data:
```

#### docker-compose.beta.yml (beta 오버레이)

```yaml
services:
  nginx:
    ports:
      - "80:80"
      - "443:443"
    volumes: !override
      - ./docker/nginx/beta.conf:/etc/nginx/conf.d/default.conf:ro
      - frontend_dist:/usr/share/nginx/html:ro

  frontend:
    # beta에서는 빌드된 정적 파일만 제공 (Vite dev server 없음)
    image: alpine:3.20
    command: >
      sh -c "cp -R /built-dist/. /frontend_dist/"
    restart: "no"
    volumes:
      - ./frontend/dist:/built-dist:ro
      - frontend_dist:/frontend_dist

  backend:
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 3
    volumes: !override []  # 소스 마운트 없음 (이미지만)

  redis:
    volumes:
      - redis_data_beta:/data

  postgres:
    volumes: !override
      - pg_data_beta:/var/lib/postgresql/data

volumes:
  frontend_dist:
  pg_data_beta:
  redis_data_beta:
```

#### docker-compose.dev.yml (dev 오버레이)

```yaml
services:
  nginx:
    ports:
      - "10014:80"   # 사내 방화벽 개방 대역(10000~20) + prod=10004 회피
    volumes: !override
      - ./docker/nginx/dev.conf:/etc/nginx/conf.d/default.conf:ro

  frontend:
    # dev에서는 Vite dev server로 HMR 활성화
    command: npm run dev -- --host 0.0.0.0 --port 5173
    ports:
      - "8082:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules

  backend:
    # dev에서는 --reload로 핫 리로드
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
    ports:
      - "8081:8000"
    volumes:
      - ./backend:/app  # 소스 마운트 → 코드 변경 즉시 반영

  redis:
    volumes:
      - redis_data_dev:/data

  postgres:
    volumes: !override
      - pg_data_dev:/var/lib/postgresql/data
    ports:
      - "5433:5432"  # dev DB 외부 접근 허용 (디버깅용)

volumes:
  pg_data_dev:
  redis_data_dev:
```

### 14.3 배포 스크립트

```bash
#!/usr/bin/env bash
# scripts/deploy.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy.sh [--yes] [--dry-run] [--down] [--sync-db]

Behavior:
  - main branch   → beta 모드: frontend 빌드 + beta 오버레이 + .env.beta
                    project: pholex-beta  (포트 80/443)
  - other branch  → dev 모드:  소스 마운트 + hot reload + .env.dev
                    project: pholex-dev   (포트 10014/8081/8082)

Options:
  --yes, -y   beta 배포 확인 프롬프트 생략
  --dry-run   실제 실행 없이 명령어만 출력
  --down      dev 스택(pholex-dev) 종료
  --sync-db   베타 DB를 개발 DB로 복사 (베타 스택 실행 중일 때)
  -h, --help  도움말
USAGE
}

log() { printf '[deploy] %s\n' "$*"; }
run() {
  if [[ "$DRY_RUN" == "1" ]]; then printf '[dry-run] %s\n' "$*"
  else eval "$@"; fi
}

DRY_RUN="0"; ASSUME_YES="0"; DO_DOWN="0"; SYNC_DB="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)   ASSUME_YES="1"; shift ;;
    --dry-run)  DRY_RUN="1";    shift ;;
    --down)     DO_DOWN="1";    shift ;;
    --sync-db)  SYNC_DB="1";    shift ;;
    -h|--help)  usage; exit 0  ;;
    *)          echo "Unknown: $1" >&2; usage; exit 1 ;;
  esac
done

# ── Dev 스택 종료 ──────────────────────────────────────────────────────────────
if [[ "$DO_DOWN" == "1" ]]; then
  log "dev 스택 종료 (pholex-dev)"
  run "docker compose -p pholex-dev \
    -f docker-compose.yml \
    -f docker-compose.dev.yml \
    down"
  exit 0
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
TARGET_ENV="$([[ "$BRANCH" == "main" ]] && echo "beta" || echo "dev")"
log "branch=${BRANCH}  target=${TARGET_ENV}"

# ── Beta ──────────────────────────────────────────────────────────────────────
if [[ "$TARGET_ENV" == "beta" ]]; then
  [[ ! -f ".env.beta" ]] && { echo ".env.beta 없음. 생성 후 재시도."; exit 1; }

  if [[ "$ASSUME_YES" != "1" && "$DRY_RUN" != "1" ]]; then
    printf "BETA 배포 (branch: %s). 계속하시겠습니까? [y/N] " "$BRANCH"
    read -r reply; [[ ! "$reply" =~ ^[Yy]$ ]] && { echo "취소됨"; exit 1; }
  fi

  log "1/2 frontend build"
  run "npm --prefix frontend ci && npm --prefix frontend run build"

  log "2/2 compose up (pholex-beta)"
  run "docker compose -p pholex-beta \
    --env-file .env.beta \
    -f docker-compose.yml \
    -f docker-compose.beta.yml \
    up -d --build --force-recreate"

# ── Dev ───────────────────────────────────────────────────────────────────────
else
  [[ ! -f ".env.dev" ]] && { echo ".env.dev 없음. .env.example 참고해서 생성."; exit 1; }

  log "1/1 compose up (pholex-dev)"
  run "docker compose -p pholex-dev \
    --env-file .env.dev \
    -f docker-compose.yml \
    -f docker-compose.dev.yml \
    up -d --build --force-recreate"

  # ── DB 동기화: beta → dev ─────────────────────────────────────────────────
  if [[ "$SYNC_DB" == "1" ]]; then
    [[ ! -f ".env.beta" ]] && { echo "--sync-db는 .env.beta 필요"; exit 1; }
    source .env.beta

    log "dev DB 준비 대기 중..."
    if [[ "$DRY_RUN" != "1" ]]; then
      for i in $(seq 1 30); do
        docker compose -p pholex-dev exec -T postgres \
          pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" 2>/dev/null && break
        [[ $i -eq 30 ]] && { echo "dev DB 30초 내 준비 실패"; exit 1; }
        sleep 1
      done
    fi

    log "beta DB → dev DB 복사 (${POSTGRES_DB})"
    run "docker compose -p pholex-beta exec -T postgres \
      pg_dump -U '${POSTGRES_USER}' '${POSTGRES_DB}' \
      | docker compose -p pholex-dev exec -T postgres \
      psql -U '${POSTGRES_USER}' '${POSTGRES_DB}'"
  fi
fi

log "done (${TARGET_ENV})"
```

### 14.4 환경변수 구성

```bash
# .env.example (git에 포함, 실제 값 없음)
# ── 공통 ──
SECRET_KEY=change-me-in-production
POSTGRES_DB=pholex
POSTGRES_USER=pholex
POSTGRES_PASSWORD=change-me
LDAP_SERVER=ldap://ldap.internal

# ── Beta ──
# .env.beta 에 복사 후 실제 값 입력
REDIS_URL=redis://redis:6379/0
DATABASE_URL=postgresql+asyncpg://pholex:change-me@postgres:5432/pholex
ALLOWED_HOSTS=pholex.internal

# ── Dev ──
# .env.dev 에 복사 후 실제 값 입력
REDIS_URL=redis://redis:6379/1   # DB 인덱스 분리 (같은 서버일 경우)
DATABASE_URL=postgresql+asyncpg://pholex:change-me@postgres:5432/pholex
ALLOWED_HOSTS=localhost,127.0.0.1
DEBUG=true
```

### 14.5 빠른 클로즈 베타 구축 순서

```
1. 서버에 Docker + Docker Compose 설치
2. .env.beta 파일 생성 (LDAP_SERVER, SECRET_KEY, DB 패스워드)
3. main 브랜치로 전환
4. scripts/deploy.sh --yes
   → frontend 빌드 → pholex-beta 스택 시작 (포트 80)
5. Nginx SSL 설정 (Let's Encrypt or 사내 인증서)
6. LDAP 화이트리스트로 베타 사용자 계정 등록
```

### 14.6 확장 경로 (베타 → 정식)

```
Phase 1 (현재): 1서버 Docker Compose
  pholex-beta + pholex-dev 분리 운용

Phase 2 (트래픽 증가 시): Docker Swarm 전환
  기존 docker-compose.beta.yml → docker-compose.swarm.yml 로 변환
  (Section 9의 Swarm 설정 파일 그대로 활용)
  추가 VM을 worker 노드로 join:
    docker swarm join --token <token> <manager-ip>:2377
  
Phase 3 (대규모): 읽기 레플리카 + Redis Sentinel
  Postgres read replica 추가
  Redis Sentinel 구성
```

---

## 15. 사내 미러 레포지터리 전략

> 사내 환경은 외부 인터넷이 제한되어 공식 레지스트리(Docker Hub, PyPI, npm, apt)에 직접 접근이 불가하다.
> 모든 패키지/이미지 소스를 **환경변수로 추상화**하여 개발 컴퓨터(공식 레포)와 사내 환경(미러 레포)을 동일 코드베이스로 운영한다.

### 15.1 관리 환경변수

```bash
# .env.example 미러 레포지터리 항목 (미설정 시 공식 레포 사용)
DOCKER_REGISTRY=          # Docker 이미지 registry prefix. 예: registry.internal/
                          # redis:7-alpine → ${DOCKER_REGISTRY}redis:7-alpine
NPM_REGISTRY_URL=         # npm 레지스트리 URL. 예: https://npm.internal/
PIP_INDEX_URL=            # PyPI 미러 URL. 예: https://pypi.internal/simple/
PIP_TRUSTED_HOST=         # pip 미러 trusted host. 예: pypi.internal
APT_MIRROR=               # apt 미러 baseURL. 예: http://apt.internal/ubuntu
```

**원칙**: 미설정(빈 문자열) = 공식 레포. 사내 환경은 `.env.beta` / `.env.dev`에 실제 미러 주소 입력.

### 15.2 docker-compose.yml 이미지 처리

```yaml
services:
  redis:
    image: ${DOCKER_REGISTRY:-}redis:7-alpine
  postgres:
    image: ${DOCKER_REGISTRY:-}postgres:16-alpine
  nginx:
    image: ${DOCKER_REGISTRY:-}nginx:alpine
  backend:
    build:
      context: ./backend
      args:
        DOCKER_REGISTRY: ${DOCKER_REGISTRY:-}
        PIP_INDEX_URL: ${PIP_INDEX_URL:-}
        PIP_TRUSTED_HOST: ${PIP_TRUSTED_HOST:-}
        APT_MIRROR: ${APT_MIRROR:-}
  frontend:
    build:
      context: ./frontend
      args:
        DOCKER_REGISTRY: ${DOCKER_REGISTRY:-}
        NPM_REGISTRY_URL: ${NPM_REGISTRY_URL:-}
```

### 15.3 backend/Dockerfile (python:3.12-slim 기반)

```dockerfile
ARG DOCKER_REGISTRY=""
FROM ${DOCKER_REGISTRY}python:3.12-slim

# apt 미러 설정 (미설정 시 공식 deb.debian.org 사용)
ARG APT_MIRROR
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org/debian|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
      sed -i "s|http://deb.debian.org/debian|$APT_MIRROR|g" /etc/apt/sources.list; \
    fi && apt-get update && apt-get install -y --no-install-recommends \
      libldap2-dev libsasl2-dev gcc && rm -rf /var/lib/apt/lists/*

# pip 미러 설정 (미설정 시 PyPI 사용)
ARG PIP_INDEX_URL
ARG PIP_TRUSTED_HOST
RUN pip install --upgrade pip \
    ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
    ${PIP_TRUSTED_HOST:+--trusted-host $PIP_TRUSTED_HOST} && \
    pip install -r requirements.txt \
    ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
    ${PIP_TRUSTED_HOST:+--trusted-host $PIP_TRUSTED_HOST}
```

### 15.4 frontend/Dockerfile (node:20-alpine 기반)

```dockerfile
ARG DOCKER_REGISTRY=""
FROM ${DOCKER_REGISTRY}node:20-alpine

# npm 레지스트리 설정 (미설정 시 registry.npmjs.org 사용)
ARG NPM_REGISTRY_URL
RUN if [ -n "$NPM_REGISTRY_URL" ]; then npm config set registry "$NPM_REGISTRY_URL"; fi
# 락 동기화면 npm ci(재현가능), 없거나 어긋나면 npm install 로 폴백
RUN npm ci || npm install
```

### 15.5 운용 절차

| 환경 | 설정 방법 | Docker 이미지 예시 |
|------|-----------|-----------------|
| 개발 컴퓨터 (Claude) | 환경변수 미설정 | `redis:7-alpine` (Docker Hub) |
| 사내 dev | `.env.dev`에 미러 주소 입력 | `registry.internal/redis:7-alpine` |
| 사내 beta | `.env.beta`에 미러 주소 입력 | `registry.internal/redis:7-alpine` |

> **주의**: `DOCKER_REGISTRY` 값 끝에 `/`를 포함해야 한다. 예: `registry.internal/` (O), `registry.internal` (X)

---

## 16. 운영 현실 — Git 동기화 토폴로지 & 환경 (2026-06 기준)

> §9·§14의 Swarm/`beta` 초안과 달리, 실제 가동 중인 구성과 Pholex 특유의 **3자 협업 + 폐쇄망
> Git 중계** 구조를 여기 정리한다. 사내 작업(opencode)에 지시할 때 이 절이 기준이다.

### 16.1 3자 협업 & Git 동기화 토폴로지

Pholex는 **사용자 ↔ 사외 Claude ↔ 사내 opencode** 3자로 개발/배포된다.

- **사외(개발 PC, Claude)**: canonical 코드 + **fake 어댑터만**. `backend/app/adapters/real/`은
  비어 있고(실데이터 없음), 평소 컨테이너를 띄우지 않는다. 여기서 개발 → PR.
- **사내(VM, opencode)**: real 어댑터 구현(대개 uncommitted) + 백필된 실데이터 Postgres +
  Alembic 마이그레이션. 실제 dev/prod 스택을 여기서 돌리고 E2E 검증한다.

**폐쇄망 제약**: 서버 호스팅 사내 VM은 외부 GitHub에 **직접 접속할 수 없다.** 그래서 사무실 PC가
중계한다. 같은 GitHub 리포를 **위치마다 다른 remote 이름**으로 부르는 점에 주의:

```
   ┌─────────────────────┐   PR 머지    ┌──────────────────────────┐
   │ 사외 개발 PC (Claude) │ ──────────▶ │  GitHub 리포 (정본)        │
   │  remote: origin      │             │  - 사외에선  origin/main   │
   └─────────────────────┘             │  - 사무실 PC에선 external/main │
                                        └────────────┬─────────────┘
                                                     │ git pull external main
                                                     ▼
                                        ┌──────────────────────────┐
                                        │  사무실 PC (중계)          │
                                        │  git push origin dev      │
                                        └────────────┬─────────────┘
                                                     │ git pull origin dev
                                                     ▼
                                        ┌──────────────────────────┐
                                        │  사내 VM (opencode/배포)   │
                                        │  remote: origin (사내)     │
                                        └──────────────────────────┘
```

**브랜치 의미(사내 origin 기준)**:
| 브랜치 | 의미 |
|--------|------|
| `external/main` | 외부 GitHub 정본 = 사외 Claude PR이 머지되는 곳 (사외에선 `origin/main`) |
| `origin/dev` | 사내 개발 브랜치 = **현재 데모/배포 대상** |
| `origin/main` | 사내 미사용 — 데모 성공 후 `origin/dev → origin/main` 병합 예정 |

**⚠️ 사내 작업 지시 시 가드레일**:
- VM에 "정본으로 되돌려라" 지시할 때 **`external/main` checkout은 불가**(VM이 external에 접속 못 함).
  → canonical 코드를 **프롬프트에 직접 박아** 파일을 맞추게 하거나, 동기화 끝난 `origin/dev` 기준으로.
- VM에서 **`git clean`/`git reset --hard` 금지** — uncommitted real 어댑터가 날아간다.
- `.env.dev`/`.env.prod`/실데이터 Postgres는 사내 자산. 사외에서 손대지 않는다.

### 16.2 현재 환경 (Compose 2스택)

| | **prod** (`pholex`) | **dev** (`pholex-dev`) |
|---|---|---|
| 진입 포트 | **10004** (HTTPS, nginx→443) | **10014** (HTTP, nginx→80) |
| 기동 | `scripts/deploy.sh --prod` | `scripts/deploy.sh` |
| compose | `docker-compose.yml` + `docker-compose.prod.yml` | `docker-compose.yml` + `docker-compose.dev.yml` |
| env | `.env.prod` | `.env.dev` |
| 어댑터 | `ADAPTER_MODE=real`, `DEV_SSO_BYPASS=false` (실 ADFS 로그인) | 자급자족 real 모드(아래 16.4) |
| 쿠키 | `pholex_session` (Secure) | `pholex_dev_session` (non-Secure) |
| frontend | 빌드된 dist를 nginx가 직접 서빙 | Vite dev 서버(HMR) |

> **포트 근거**: 사내 방화벽이 **10000~10020만** 외부 개방한다. prod=10004, dev=10014로 회피.
> dev는 환경 무관 단일 포트(10014)로 고정해 미스매치 부채를 없앴다.
>
> **쿠키 이름 분리 이유**: dev/prod가 같은 사내 IP(포트만 다름)라 브라우저 쿠키 저장소를
> 공유한다. prod의 Secure 쿠키를 dev(HTTP)의 non-Secure 동명 쿠키가 못 덮어써(브라우저 정책)
> 저장 거부 → 무한 리다이렉트가 났다. 그래서 dev 쿠키 이름을 분리한다(상세: `docs/auth.md` §5).

### 16.3 환경변수 주입 — `env_file` (footgun 차단)

`deploy.sh`의 `--env-file`은 compose 안의 `${VAR}` **치환용일 뿐 컨테이너로 주입하지 않는다.**
예전엔 변수마다 `backend.environment:`에 `${VAR}` 패스스루를 나열해야 했고, `.env`에 새 키를
넣고 그걸 깜빡하면 빈값 폴백으로 장애가 났다(IDP_* 무한 리다이렉트, SESSION_COOKIE_NAME 등 3회).

→ backend 서비스에 **`env_file:`(`.env.prod` / `.env.dev`)** 을 두어 해당 파일의 **모든 키를
컨테이너에 자동 주입**한다. **새 변수는 `.env` 파일에만 추가하면 도달한다.** `environment:`에는
운영 기본값(폴백)만 남기며, `environment:`가 `env_file`보다 우선하되 `${VAR:-기본값}`이 `.env`
값으로 치환되므로 결과는 동일하다.

### 16.4 dev 데이터 — 자급자족 real 모드

dev는 호스트 Postgres(`host.docker.internal:5432`) 의존을 버리고 **자급자족 real 모드**로 돈다:
prod DB를 `pg_dump`(prod 읽기전용)로 떠서 **dev Postgres 컨테이너로 restore**(스냅샷 ~13.8k행),
`.env.dev`의 `DATABASE_URL=...@postgres:5432`(dev 컨테이너)를 가리킨다.

- host.docker.internal 방식은 호스트 Postgres가 죽으면 `ConnectionRefused`로 깨져서 폐기.
- 데이터 갱신은 **prod→dev 재스냅샷**으로만(방향 고정: prod는 읽기전용, dev로만 쓴다).

### 16.5 Nginx 동적 업스트림 (502 방지)

backend/frontend 업스트림은 `upstream{}`(기동 시 1회 resolve) 대신 **Docker 내장 DNS로 요청마다
재resolve** 한다. 컨테이너 재배포로 IP가 바뀌어도 옛 IP를 물고 502 내지 않게:

```nginx
resolver 127.0.0.11 valid=10s ipv6=off;       # Docker 내장 DNS
location /api/ {
    set $backend backend:8000;                 # 변수로 proxy_pass → 요청 시점 재resolve
    proxy_pass http://$backend;
}
```

conf는 bind-mount라 변경 시 nginx reload가 필요하다. (실파일: `docker/nginx/prod.conf`,
`docker/nginx/dev.conf`)
