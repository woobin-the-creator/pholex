# Pholex — 사내 환경 구축 가이드

> 개발 완료된 코드베이스를 사내 서버로 가져와 배포하는 절차.
> 이 가이드의 모든 설정은 `infra.md`의 설계를 기반으로 한다.

---

## 전제 조건

- 사내 서버에 Docker + Docker Compose 설치됨
- 사내 미러 레포지터리 주소를 알고 있음 (Docker, npm, pip, apt)
- LDAP 서버 주소 및 접근 권한 확인됨
- 코드베이스가 서버에 전달됨 (`git clone` 또는 압축 전달)

---

## Step 1. 서버 준비

```bash
# Docker 설치 확인
docker --version
docker compose version

# 방화벽 포트 오픈
# beta 환경: 80, 443
# dev 환경:  8080 (nginx), 8081 (FastAPI), 8082 (Vite HMR)
```

---

## Step 2. 환경변수 파일 생성

`.env.example`을 복사해서 목적 환경에 맞는 파일을 생성한다.

```bash
# dev 환경
cp .env.example .env.dev

# beta 환경
cp .env.example .env.beta
```

아래 항목을 실제 값으로 채운다.

### 미러 레포지터리 (사내 환경 핵심)

```bash
# .env.dev 또는 .env.beta

DOCKER_REGISTRY=registry.internal/   # 반드시 / 로 끝나야 함
NPM_REGISTRY_URL=https://npm.internal/
PIP_INDEX_URL=https://pypi.internal/simple/
PIP_TRUSTED_HOST=pypi.internal
APT_MIRROR=http://apt.internal/ubuntu
```

> **주의**: `DOCKER_REGISTRY` 값 끝에 `/`를 반드시 포함해야 한다.
> `registry.internal/` (O) — `registry.internal` (X)

### 사내 인프라

```bash
LDAP_SERVER=ldap://ldap.internal
SECRET_KEY=<openssl rand -hex 32 로 생성>
POSTGRES_DB=pholex
POSTGRES_USER=pholex
POSTGRES_PASSWORD=<설정>

# beta
REDIS_URL=redis://redis:6379/0
DATABASE_URL=postgresql+asyncpg://pholex:<password>@postgres:5432/pholex
ALLOWED_HOSTS=pholex.internal

# dev
REDIS_URL=redis://redis:6379/1
DATABASE_URL=postgresql+asyncpg://pholex:<password>@postgres:5432/pholex
ALLOWED_HOSTS=localhost,127.0.0.1
DEBUG=true
```

---

## Step 3. 사내 Python 라이브러리 확인

`backend/requirements.txt`에 사내 전용 라이브러리 패키지명이 올바르게 등록되어 있는지 확인한다.
배포 전 pip 미러에서 해당 패키지가 조회되는지 사전 검증을 권장한다.

```bash
pip install \
  --index-url $PIP_INDEX_URL \
  --trusted-host $PIP_TRUSTED_HOST \
  <패키지명> \
  --dry-run
```

---

## Step 4. 사내 Docker 레지스트리 이미지 확인

`docker-compose.yml`에서 사용하는 base 이미지가 사내 레지스트리에 미러링되어 있는지 확인한다.

| 이미지 | 용도 |
|--------|------|
| `python:3.12-slim` | backend Dockerfile base |
| `node:20-alpine` | frontend Dockerfile base |
| `redis:7-alpine` | Redis 서비스 |
| `postgres:16-alpine` | PostgreSQL 서비스 |
| `nginx:alpine` | 리버스 프록시 |

이미지가 없으면 사내 레지스트리 관리자에게 미러 요청 후 진행한다.

```bash
# 확인 방법
docker pull ${DOCKER_REGISTRY}redis:7-alpine
```

---

## Step 5. 배포 실행

```bash
# dev 환경 (현재 브랜치 기준, 포트 8080)
scripts/deploy.sh

# beta 환경 (main 브랜치에서, 포트 80)
git checkout main
scripts/deploy.sh --yes
```

`deploy.sh`가 자동으로 처리하는 항목:
- 브랜치 기반 환경 자동 선택 (`main` → beta, 그 외 → dev)
- frontend 빌드 (beta만)
- docker compose up (미러 환경변수 포함)

---

## Step 6. Beta 추가 설정 (beta 환경만)

```bash
# SSL 인증서 설정 (사내 인증서 또는 Let's Encrypt)
# docker/nginx/beta.conf 에 ssl_certificate 경로 지정

# LDAP 화이트리스트에 베타 사용자 계정 등록
```

---

## 문제 발생 시 확인 포인트

| 증상 | 원인 | 조치 |
|------|------|------|
| `image name invalid` 오류 | `DOCKER_REGISTRY` trailing slash 누락 | 값 끝에 `/` 추가 |
| `apt-get update` 실패 | apt 미러 주소 오류 | `APT_MIRROR` 값 확인. Dockerfile이 `.sources`와 `.list` 경로를 자동으로 시도함 |
| `pip install` 404 | 사내 pip 미러에 패키지 없음 | Step 3 사전 검증으로 확인 후 레지스트리 관리자에게 패키지 등록 요청 |
| 로그인 불가 | LDAP 서버 주소 오류 | `ldapsearch -H $LDAP_SERVER -x` 로 연결 테스트 |
| DB 연결 실패 | `DATABASE_URL` 오류 | `POSTGRES_PASSWORD`가 URL 인코딩 필요한 특수문자 포함 여부 확인 |
| npm install 실패 | npm 미러 인증 오류 | `NPM_REGISTRY_URL`에 인증이 필요한 경우 `.npmrc`에 토큰 설정 필요 |

---

## 참고 문서

| 문서 | 내용 |
|------|------|
| `docs/infra.md` Section 14 | Docker Compose 환경 구성, deploy.sh 전체 스크립트 |
| `docs/infra.md` Section 15 | 미러 레포지터리 전략 상세 (Dockerfile 패턴 포함) |
| `.env.example` | 전체 환경변수 목록 및 설명 |
