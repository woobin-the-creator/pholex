# Pholex 프로젝트 설계 문서

> 제조 랏(Lot) 모니터링 대시보드

## 1. 프로젝트 개요

### 목적
엔지니어들이 관리하는 제조 랏(Lot)을 개인별/팀별로 실시간 모니터링하는 웹 대시보드.
24/7 교대 근무 환경에서 사용되며, **속도와 안정성이 최우선**.

### 핵심 요구사항
- 동시 접속: 중규모(10~50명) 시작 → 대규모(50~200명) 확장 가능
- 데이터 갱신: 5~30초 주기 (서버 폴링 + WebSocket 변경분 푸시)
- 인증: 사내 SSO (LDAP/AD)
- 알림: 대시보드 내 실시간 알림 (토스트, 행 하이라이트)
- 데이터 소스: 복합/미정 → 추상화된 데이터 수집 레이어

## 2. 기술 스택

| 레이어 | 기술 | 선택 이유 |
|--------|------|-----------|
| **프론트엔드** | React + Vite + TypeScript | 넓은 생태계, 빠른 HMR, 타입 안전성 |
| **테이블** | TanStack Table v8 | 무료, 가상 스크롤, 헤드리스 UI로 커스텀 자유 |
| **실시간 통신** | WebSocket (native) | 양방향 통신 (필터 변경 → 서버, 데이터 푸시 → 클라이언트) |
| **상태 관리** | Zustand | 경량, 보일러플레이트 최소, WebSocket 상태 통합 용이 |
| **백엔드** | FastAPI (Python) | 비동기 네이티브, WebSocket 내장, 빠른 개발 |
| **ORM** | SQLAlchemy 2.0 (async) | FastAPI와 최적 호환, 비동기 쿼리 |
| **세션/캐시** | Redis | 실시간 사용자 세션, WebSocket pub/sub 브로커 |
| **데이터 저장** | PostgreSQL | 랏 데이터, 사용자-랏 매핑, 필터 프리셋 |
| **인증** | LDAP/AD via python-ldap | 사내 SSO 연동 |
| **배포** | Docker Swarm | 멀티 노드 오케스트레이션, rolling update |
| **리버스 프록시** | Nginx / Traefik | WebSocket 프록시, SSL 터미네이션, 로드밸런싱 |

## 3. 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                        Docker Swarm                         │
│                                                             │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────┐   │
│  │  Nginx/  │    │   FastAPI    │    │   FastAPI        │   │
│  │  Traefik │───▶│   Worker 1   │    │   Worker N       │   │
│  │  (LB)    │    │  (WebSocket) │    │  (WebSocket)     │   │
│  └──────────┘    └──────┬───────┘    └────────┬─────────┘   │
│                         │                      │             │
│                    ┌────┴──────────────────────┴────┐        │
│                    │         Redis Cluster          │        │
│                    │  - 세션 관리                     │        │
│                    │  - WebSocket pub/sub            │        │
│                    │  - 실시간 사용자 추적             │        │
│                    │  - 쿼리 결과 캐시               │        │
│                    └────────────┬───────────────────┘        │
│                                │                             │
│                    ┌───────────┴───────────────────┐         │
│                    │       PostgreSQL (Primary)     │         │
│                    │  - 사용자-랏 매핑               │         │
│                    │  - 랏 상태 데이터               │         │
│                    │  - 필터 프리셋                  │         │
│                    │  - 감사 로그                    │         │
│                    └───────────────────────────────┘         │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │            Data Collector (추상화 레이어)             │    │
│  │  - Adapter 패턴으로 다양한 데이터 소스 플러그인       │    │
│  │  - MES/EAP DB 직접 조회                              │    │
│  │  - REST API 호출                                     │    │
│  │  - ETL 동기화                                        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 4. 데이터베이스 설계

### 4.1 Redis (세션 & 캐시)

| 키 패턴 | 용도 | TTL |
|---------|------|-----|
| `session:{user_id}` | 사용자 세션 정보 | 8h (교대 주기) |
| `active_users` | 실시간 접속 사용자 Set | - |
| `cache:table:{table_id}:{filter_hash}` | 쿼리 결과 캐시 | 5~30s (갱신 주기) |
| `ws:channel:{user_id}` | WebSocket pub/sub 채널 | - |

### 4.2 PostgreSQL 스키마

```sql
-- 사용자-랏 매핑
CREATE TABLE user_lots (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,  -- SSO 사용자 ID
    lot_id VARCHAR(100) NOT NULL,
    team_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, lot_id)
);

-- 랏 상태 (수집된 데이터)
CREATE TABLE lot_status (
    id SERIAL PRIMARY KEY,
    lot_id VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    equipment VARCHAR(100),
    process_step VARCHAR(100),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);
CREATE INDEX idx_lot_status_lot_id ON lot_status(lot_id);
CREATE INDEX idx_lot_status_updated_at ON lot_status(updated_at);

-- 필터 프리셋 (사용자별 저장)
CREATE TABLE filter_presets (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    name VARCHAR(200) NOT NULL,
    filters JSONB NOT NULL,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 테이블 레이아웃 설정
CREATE TABLE table_configs (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    slot_index INT NOT NULL,  -- 0~5 (2col x 3row)
    table_type VARCHAR(100),
    config JSONB DEFAULT '{}',
    UNIQUE(user_id, slot_index)
);
```

## 5. 프론트엔드 구조

### 5.1 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│  Header: 로고 | 팀 선택 | 사용자 정보 | 알림 벨        │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  Sidebar   │   ┌─────────────┐  ┌─────────────┐         │
│            │   │  Table [0]  │  │  Table [1]  │         │
│  - 글로벌  │   │             │  │             │         │
│    필터    │   └─────────────┘  └─────────────┘         │
│            │   ┌─────────────┐  ┌─────────────┐         │
│  - 팀 선택 │   │  Table [2]  │  │  Table [3]  │         │
│            │   │             │  │             │         │
│  - 기간   │   └─────────────┘  └─────────────┘         │
│            │   ┌─────────────┐  ┌─────────────┐         │
│  - 프리셋  │   │  Table [4]  │  │  Table [5]  │         │
│    저장    │   │             │  │             │         │
│            │   └─────────────┘  └─────────────┘         │
└────────────┴─────────────────────────────────────────────┘
```

### 5.2 디렉토리 구조

```
frontend/
├── src/
│   ├── app/
│   │   ├── App.tsx              # 루트 컴포넌트
│   │   ├── router.tsx           # 라우팅 (대시보드, 설정 등)
│   │   └── providers.tsx        # 전역 프로바이더
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── DashboardGrid.tsx    # 2x3 그리드 컨테이너
│   │   ├── table/
│   │   │   ├── DataTable.tsx        # TanStack Table 래퍼
│   │   │   ├── TableSlot.tsx        # 빈 슬롯 / 테이블 선택 UI
│   │   │   ├── VirtualRow.tsx       # 가상 스크롤 행
│   │   │   └── columns/            # 컬럼 정의 모듈
│   │   ├── filters/
│   │   │   ├── GlobalFilter.tsx
│   │   │   ├── TableFilter.tsx
│   │   │   └── FilterPreset.tsx
│   │   └── alerts/
│   │       ├── ToastAlert.tsx
│   │       └── RowHighlight.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts          # WebSocket 연결 관리
│   │   ├── useTableData.ts          # 테이블 데이터 페칭 + 캐시
│   │   └── useFilters.ts            # 필터 상태 관리
│   ├── stores/
│   │   ├── authStore.ts             # 인증 상태
│   │   ├── filterStore.ts           # 글로벌/테이블 필터
│   │   ├── tableStore.ts            # 테이블 데이터 + 레이아웃
│   │   └── alertStore.ts            # 알림 상태
│   ├── services/
│   │   ├── api.ts                   # HTTP API 클라이언트
│   │   ├── ws.ts                    # WebSocket 클라이언트
│   │   └── auth.ts                  # SSO 인증 로직
│   └── types/
│       ├── lot.ts
│       ├── filter.ts
│       └── table.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## 6. 백엔드 구조

```
backend/
├── app/
│   ├── main.py                      # FastAPI 앱 엔트리포인트
│   ├── config.py                    # 환경 설정
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.py              # SSO 인증 엔드포인트
│   │   │   ├── lots.py              # 랏 데이터 CRUD
│   │   │   ├── filters.py           # 필터 프리셋 관리
│   │   │   ├── tables.py            # 테이블 설정 관리
│   │   │   └── ws.py                # WebSocket 엔드포인트
│   │   └── deps.py                  # 의존성 주입
│   ├── core/
│   │   ├── auth.py                  # LDAP/AD 인증 로직
│   │   ├── security.py              # JWT 토큰 관리
│   │   └── websocket_manager.py     # WebSocket 연결 관리 + Redis pub/sub
│   ├── collectors/
│   │   ├── base.py                  # 추상 데이터 수집기
│   │   ├── db_collector.py          # 외부 DB 직접 조회
│   │   ├── api_collector.py         # REST API 호출
│   │   └── registry.py              # 수집기 레지스트리
│   ├── models/
│   │   ├── user.py
│   │   ├── lot.py
│   │   └── filter.py
│   ├── schemas/
│   │   ├── lot.py                   # Pydantic 스키마
│   │   ├── filter.py
│   │   └── ws.py                    # WebSocket 메시지 스키마
│   ├── services/
│   │   ├── lot_service.py           # 랏 비즈니스 로직
│   │   ├── cache_service.py         # Redis 캐시 관리
│   │   ├── session_service.py       # 실시간 세션 관리
│   │   └── alert_service.py         # 알림 조건 평가 + 발행
│   └── db/
│       ├── database.py              # async SQLAlchemy 엔진
│       ├── redis.py                 # Redis 연결 풀
│       └── migrations/              # Alembic 마이그레이션
├── tests/
├── alembic.ini
├── requirements.txt
└── Dockerfile
```

## 7. 실시간 데이터 흐름

```
1. [Scheduler] 5~30초 주기로 Data Collector 실행
       │
2. [Data Collector] 외부 소스에서 랏 데이터 수집
       │
3. [Lot Service] 기존 데이터와 diff 비교
       │
4. [변경 감지?] ─── No ──▶ (다음 주기까지 대기)
       │
      Yes
       │
5. [PostgreSQL] 변경된 랏 데이터 업데이트
       │
6. [Redis Cache] 관련 캐시 무효화
       │
7. [Redis Pub/Sub] 변경 이벤트 발행
       │
8. [WebSocket Manager] 구독 중인 사용자에게 변경분 푸시
       │
9. [프론트엔드] 해당 테이블만 부분 업데이트 (전체 리렌더 아님)
```

### 실시간 사용자 우선순위
- Redis `active_users` Set으로 현재 접속 사용자 추적
- 접속 중인 사용자가 구독한 랏 데이터를 **우선 수집**
- 비활성 사용자의 데이터는 낮은 우선순위로 지연 수집

## 8. WebSocket 메시지 프로토콜

```typescript
// 클라이언트 → 서버
{ type: "subscribe", payload: { tableId: 0, filters: {...} } }
{ type: "unsubscribe", payload: { tableId: 0 } }
{ type: "filter_change", payload: { scope: "global"|"table", tableId?: 0, filters: {...} } }
{ type: "heartbeat" }

// 서버 → 클라이언트
{ type: "table_update", payload: { tableId: 0, rows: [...], diff: true } }
{ type: "alert", payload: { lotId: "...", message: "...", severity: "warning"|"critical" } }
{ type: "session_info", payload: { activeUsers: 23 } }
{ type: "heartbeat_ack" }
```

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
    deploy:
      replicas: 1
      placement:
        constraints: [node.role == manager]
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

## 10. 수용 기준 (Acceptance Criteria)

| # | 기준 | 측정 방법 |
|---|------|-----------|
| AC-1 | 테이블 데이터 초기 로드 < 1초 (p99) | 브라우저 Performance API |
| AC-2 | WebSocket 데이터 푸시 지연 < 500ms (서버 감지 → 클라이언트 수신) | 서버/클라이언트 타임스탬프 비교 |
| AC-3 | 동시 50명 접속 시 CPU < 70% | Docker stats 모니터링 |
| AC-4 | SSO 로그인 < 3초 | LDAP 응답 시간 포함 |
| AC-5 | 필터 변경 후 테이블 업데이트 < 500ms | UI 인터랙션 측정 |
| AC-6 | 24시간 무중단 운영 (메모리 누수 없음) | 장기 부하 테스트 |
| AC-7 | 2x3 그리드 레이아웃 정상 렌더링 (1920x1080 기준) | E2E 스크린샷 테스트 |

## 11. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 외부 데이터 소스 지연/장애 | 테이블 데이터 미갱신 | 캐시 fallback + 마지막 갱신 시간 표시 + 장애 알림 |
| WebSocket 연결 끊김 | 실시간 업데이트 중단 | 자동 재연결 (exponential backoff) + 재연결 시 full sync |
| Redis 장애 | 세션/캐시 손실 | Redis Sentinel 또는 클러스터 구성, JWT로 세션 보조 |
| Docker Swarm 노드 장애 | 서비스 다운 | 레플리카 최소 2개, health check + 자동 재스케줄링 |
| LDAP 서버 장애 | 로그인 불가 | JWT 토큰 만료 전까지 기존 세션 유지 (graceful degradation) |

## 12. 구현 우선순위 (Phase)

### Phase 1: 기반 구축
- [ ] 프로젝트 스캐폴딩 (React + FastAPI + Docker Compose)
- [ ] PostgreSQL 스키마 + Alembic 마이그레이션
- [ ] Redis 연결 + 기본 캐시 레이어
- [ ] SSO(LDAP) 인증 플로우

### Phase 2: 코어 대시보드
- [ ] 2x3 그리드 레이아웃 + 빈 슬롯 UI
- [ ] TanStack Table 기본 테이블 컴포넌트
- [ ] 글로벌 필터 사이드바
- [ ] REST API (랏 데이터 CRUD)

### Phase 3: 실시간 기능
- [ ] WebSocket 연결 관리
- [ ] Redis pub/sub 기반 변경 브로드캐스트
- [ ] 서버 폴링 스케줄러 + diff 감지
- [ ] 프론트엔드 부분 업데이트

### Phase 4: 고도화
- [ ] 테이블별 필터
- [ ] 필터 프리셋 저장/불러오기
- [ ] 실시간 알림 (토스트 + 행 하이라이트)
- [ ] 사용자별 테이블 레이아웃 커스터마이징

### Phase 5: 배포 & 안정화
- [ ] Docker Swarm 배포 구성
- [ ] Nginx/Traefik WebSocket 프록시 설정
- [ ] 부하 테스트 + 성능 튜닝
- [ ] 24시간 안정성 테스트
