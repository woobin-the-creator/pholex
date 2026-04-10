# Pholex — 인프라 & 배포 설계

> Docker Swarm · Nginx · 환경 분리 (Beta / Dev) · 배포 스크립트

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
    ├── 포트: 8080 (Nginx) / 8081 (FastAPI HMR) / 8082 (Vite HMR)
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
      - "8080:80"
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
                    project: pholex-dev   (포트 8080/8081/8082)

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
