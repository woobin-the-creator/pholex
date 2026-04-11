# Deep Interview Spec: Pholex 개발 킥오프

## Metadata
- Interview ID: pholex-dev-kickoff-2026-04-11
- Rounds: 6
- Final Ambiguity Score: 18.5%
- Type: brownfield
- Generated: 2026-04-11
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.88 | 0.35 | 0.308 |
| Constraint Clarity | 0.75 | 0.25 | 0.188 |
| Success Criteria | 0.75 | 0.25 | 0.188 |
| Context Clarity | 0.88 | 0.15 | 0.132 |
| **Total Clarity** | | | **0.815** |
| **Ambiguity** | | | **18.5%** |

---

## Goal

docs 폴더의 설계 문서를 기반으로 Pholex 개발을 본격 시작한다.
미정 항목들(데이터 소스, 랏 필드, 테이블 슬롯 용도, 알림 조건)을 구체화했으며,
**Mock-first + 점진적 확장** 전략으로 Phase 1(스캐폴딩) → Phase 2(코어 대시보드) 순으로 진행한다.

---

## 확정된 설계 결정

### 데이터 소스 전략
- **Primary**: 사내 REST API — 필수 파라미터 `lot_id`를 포함한 HTTP 호출, 랏 데이터 반환
- **Fallback**: 사내 전용 Python 라이브러리 → SQL 쿼리 → pandas DataFrame → `df.to_sql` → PostgreSQL 저장 → Pholex API 호출
- **전환 기준**: API 호출이 block될 조짐(429, 연결 오류 급증) 시 Fallback 전환
- **폴링 주기**: 30~60초 (API rate limit 문서 없음 → 보수적 설정 + block 감지 모니터링)

### 랏 데이터 필드 (lot_status 테이블)
| 필드 | 타입 | 설명 |
|------|------|------|
| `lot_id` | VARCHAR(100) | 랏 식별자 (API 필수 파라미터) |
| `status` | VARCHAR(20) | `run` / `wait` / `hold` |
| `equipment` | VARCHAR(100) | 장비명 |
| `process_step` | VARCHAR(100) | 현재 공정 단계 |
| `hold_comment` | TEXT | 홀드 사유 (hold 상태일 때) |
| `hold_user_name` | VARCHAR(100) | 홀드 담당자 |

### 상태값 및 UI 매핑
| 상태 | 행 하이라이트 | 알림 severity |
|------|-------------|--------------|
| `run` | 없음 (기본) | warning (상태 변경 시) |
| `wait` | 없음 (기본) | warning (상태 변경 시) |
| `hold` | Critical Red (`#e53e3e`) | **critical** (상태 변경 시) |

### 알림 조건
- **트리거**: 모든 상태 변경 (`run↔wait↔hold` 모든 방향)
- **→hold**: critical severity (빨강 토스트 + 행 하이라이트)
- **나머지 변경**: warning severity (주황 토스트)
- 구현: `alert_service.py`에서 diff 비교 시 status 변경 감지

### 테이블 슬롯 전략 (2x3 그리드)
- **공통 원칙**: 같은 DB/API 소스를 다른 방식으로 조합 → 6가지 성격의 테이블
- **개발 전략**: Mock-first — 와이어프레임 레이아웃 먼저 완성, 구체 테이블은 하나씩 점진적 추가
- `table_type`은 플러그인 구조로 설계 (추가 시 기존 코드 수정 최소화)
- Phase 2에서 첫 번째 실제 테이블 타입 1개 구현 목표

---

## Constraints
- 사내 API rate limit 문서 없음 → 폴링 30초 이상 유지, block 감지 시 Fallback 전환
- LDAP/AD SSO 필수 (사내 전용 서비스)
- 1920×1080 기준 2x3 그리드 렌더링
- 동시 접속 10~50명 시작, 200명까지 확장 가능하게 설계
- Docker Compose dev 환경 → Docker Swarm 전환 경로 유지
- **[신규] 사내 미러 레포지터리**: 사내 배포 시 공식 레포 접근 불가. 모든 패키지/이미지 소스를 환경변수로 추상화

### 미러 레포지터리 전략 (신규 — infra.md 반영 필요)

개발 컴퓨터(Claude 환경): 환경변수 미설정 → 공식 레포 사용
사내 환경: `.env.beta` / `.env.dev`에 미러 URL 설정 → 미러 레포 사용

**관리할 환경변수 (확정):**

| 환경변수 | 적용 범위 | 미설정 시 기본값 |
|----------|-----------|---------------|
| `DOCKER_REGISTRY` | docker-compose.yml 모든 외부 이미지 prefix | Docker Hub |
| `NPM_REGISTRY_URL` | frontend/Dockerfile npm install | registry.npmjs.org |
| `PIP_INDEX_URL` | backend/Dockerfile pip install | PyPI |
| `PIP_TRUSTED_HOST` | backend/Dockerfile pip install | (없음) |
| `APT_MIRROR` | backend/Dockerfile apt-get | deb.debian.org |

**Docker base image 선택 (확정):**
- backend: `python:3.12-slim` (Debian slim) → apt 사용
- frontend: `node:20-alpine` → apk (시스템 패키지 최소), npm 미러로 관리

**docker-compose.yml 이미지 처리:**
```yaml
services:
  redis:
    image: ${DOCKER_REGISTRY:-}redis:7-alpine
  postgres:
    image: ${DOCKER_REGISTRY:-}postgres:16-alpine
  nginx:
    image: ${DOCKER_REGISTRY:-}nginx:alpine
```

**backend/Dockerfile:**
```dockerfile
ARG DOCKER_REGISTRY=""
FROM ${DOCKER_REGISTRY}python:3.12-slim

ARG APT_MIRROR
RUN if [ -n "$APT_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org/debian|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
      sed -i "s|http://deb.debian.org/debian|$APT_MIRROR|g" /etc/apt/sources.list; \
    fi && apt-get update && apt-get install -y --no-install-recommends \
      libldap2-dev libsasl2-dev gcc && rm -rf /var/lib/apt/lists/*

ARG PIP_INDEX_URL
ARG PIP_TRUSTED_HOST
RUN pip install --upgrade pip \
    ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
    ${PIP_TRUSTED_HOST:+--trusted-host $PIP_TRUSTED_HOST} && \
    pip install -r requirements.txt \
    ${PIP_INDEX_URL:+--index-url $PIP_INDEX_URL} \
    ${PIP_TRUSTED_HOST:+--trusted-host $PIP_TRUSTED_HOST}
```

**frontend/Dockerfile:**
```dockerfile
ARG DOCKER_REGISTRY=""
FROM ${DOCKER_REGISTRY}node:20-alpine

ARG NPM_REGISTRY_URL
RUN if [ -n "$NPM_REGISTRY_URL" ]; then npm config set registry "$NPM_REGISTRY_URL"; fi
RUN npm ci
```

**docker-compose.yml build args 전달:**
```yaml
services:
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

## Non-Goals
- 다크모드 (추후 확장)
- 모바일 반응형 (데스크탑 전용)
- 외부 사용자 (사내 SSO로만 접근)
- 첫 번째 구체 테이블 외 나머지 5개 슬롯 즉시 구현

---

## Acceptance Criteria

### Phase 1 (기반 구축)
- [ ] `docker-compose.yml` + `docker-compose.dev.yml` 실행 → 모든 서비스 healthy
- [ ] `scripts/deploy.sh` (dev 모드) 실행 성공
- [ ] Alembic 마이그레이션 적용 → `user_lots`, `lot_status`, `filter_presets`, `table_configs` 테이블 생성
- [ ] LDAP 로그인 → JWT 발급 → `/api/me` 200 응답
- [ ] Redis 연결 확인 (세션 저장/조회)
- [ ] `.env.example` 모든 변수 문서화

### Phase 2 (코어 대시보드)
- [ ] 2x3 그리드 렌더링 (6개 슬롯, Mock 데이터로 채워짐)
- [ ] `TableHeader` 컴포넌트: 테이블명 + 리프레시 버튼 + 마지막 갱신 시간 표시
- [ ] WebSocket 연결 → heartbeat 정상 동작
- [ ] `table_update` 메시지 수신 → 해당 슬롯만 업데이트 (나머지 슬롯 리렌더 없음)
- [ ] 상태 변경 감지 → 토스트 알림 발생 (hold→critical, 나머지→warning)
- [ ] 행 하이라이트: hold 상태 행 빨강

---

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 데이터 소스가 하나일 것 | API와 DB 라이브러리 둘 다 언급됨 | Primary=API, Fallback=DB lib, Adapter 패턴으로 추상화 |
| lot_status 필드가 기본 4개 | hold 관련 필드 없었음 | hold_comment, hold_user_name 추가 확정 |
| 6개 슬롯이 다른 데이터 종류 | 완전히 다른 타입 vs 같은 소스 | 같은 소스, 다른 조합 — Mock-first 점진적 추가 |
| 알림이 hold 전환 시에만 | 다른 변경 포함 여부 불명확 | 모든 상태 변경 시 알림, severity로 구분 |
| API rate limit이 알려져 있을 것 | 문서 없음 | 보수적 폴링(30s+) + block 감지 모니터링 전략 |

---

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Lot | core domain | lot_id, status, equipment, process_step, hold_comment, hold_user_name | Lot belongs to User via user_lots |
| LotStatus | supporting | run, wait, hold | Lot has one LotStatus |
| TableSlot | core domain | slot_index(0~5), table_type, config | User has 6 TableSlots |
| User | supporting | user_id, team_id | User has many Lots, 6 TableSlots |
| DataSource | external | REST API (primary), Python lib (fallback) | Collector uses DataSource |
| Alert | supporting | lot_id, severity, message, status_from, status_to | triggered by LotStatus change |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 3 | 3 | - | - | N/A |
| 2 | 4 | 1 | 0 | 3 | 75% |
| 3 | 4 | 0 | 0 | 4 | 100% |
| 4 | 5 | 1 | 0 | 4 | 80% |
| 5 | 6 | 1 | 0 | 5 | 83% |
| 6 | 6 | 0 | 0 | 6 | 100% |

---

## Technical Context

### 확정된 기술 스택 (docs/overview.md 기반)
- Frontend: React + Vite + TypeScript + TanStack Table v8 + Jotai
- Backend: FastAPI (async) + SQLAlchemy 2.0 + Redis + PostgreSQL
- Auth: python-ldap (LDAP/AD SSO) + JWT
- Deploy: Docker Compose (dev) → Docker Swarm (prod)

### lot_status 테이블 수정 (스키마 확정)
```sql
CREATE TABLE lot_status (
    id SERIAL PRIMARY KEY,
    lot_id VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('run', 'wait', 'hold')),
    equipment VARCHAR(100),
    process_step VARCHAR(100),
    hold_comment TEXT,
    hold_user_name VARCHAR(100),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);
```

### Collector 전략 (추상화 확정)
```python
# collectors/base.py
class BaseCollector(ABC):
    @abstractmethod
    async def fetch_lot(self, lot_id: str) -> LotData: ...

# collectors/api_collector.py  → Primary (사내 REST API)
# collectors/db_collector.py   → Fallback (사내 Python lib → PostgreSQL)
# collectors/registry.py       → 현재 활성 Collector 선택 + block 감지 전환
```

### 알림 severity 매핑
```python
def get_severity(status_from: str, status_to: str) -> str:
    if status_to == "hold":
        return "critical"
    return "warning"
```

---

## Interview Transcript
<details>
<summary>Full Q&A (6 rounds)</summary>

### Round 1
**Q:** 랏 데이터를 어디서 가져오나요?
**A:** Primary: 사내 REST API (lot_id 필수 파라미터). Fallback: 사내 Python 라이브러리 → SQL → pandas → df.to_sql → PostgreSQL. API block 우려 시 fallback 전환 고려.
**Ambiguity:** 45% (Goal: 0.70, Constraints: 0.50, Criteria: 0.30, Context: 0.70)

### Round 2
**Q:** 테이블에 표시할 랏 데이터 필드는?
**A:** hold_comment, hold_user_name (기존 lot_id, status, equipment, process_step에 추가)
**Ambiguity:** 40% (Goal: 0.75, Constraints: 0.55, Criteria: 0.35, Context: 0.75)

### Round 3
**Q:** status 필드 값들은?
**A:** run / wait / hold
**Ambiguity:** 35% (Goal: 0.80, Constraints: 0.60, Criteria: 0.40, Context: 0.80)

### Round 4
**Q:** 2x3 그리드 6개 슬롯은 어떻게 쓸 계획인가요?
**A:** 같은 DB/API를 다른 방식으로 조합해 6가지 성격의 테이블. Mock-first, 하나씩 점진적 추가.
**Ambiguity:** 29% (Goal: 0.85, Constraints: 0.65, Criteria: 0.50, Context: 0.85)

### Round 5
**Q:** 알림 조건은?
**A:** 상태 변경 전체 (run↔wait↔hold 모든 방향)
**Ambiguity:** 21.5% (Goal: 0.87, Constraints: 0.68, Criteria: 0.72, Context: 0.87)

### Round 6
**Q:** API rate limit 기준은?
**A:** 알 수 없음 / 문서 없음
**Ambiguity:** 18.5% ✅ PASSED

</details>
