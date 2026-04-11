# Pholex — 프로젝트 개요

> 제조 랏(Lot) 모니터링 대시보드 · 공통 설계 문서

---

## 1. 프로젝트 개요

### 목적
엔지니어들이 관리하는 제조 랏(Lot)을 개인별/팀별로 실시간 모니터링하는 웹 대시보드.
24/7 교대 근무 환경에서 사용되며, **속도와 안정성이 최우선**.

### 핵심 요구사항
- 동시 접속: 중규모(10~50명) 시작 → 대규모(50~200명) 확장 가능
- 데이터 갱신: 자동 폴링 30~60초 (백그라운드) + **테이블별 수동 리프레시 버튼** (즉시, < 1초) + WebSocket 변경분 푸시
- 인증: 사내 SSO (OIDC)
- 알림: 대시보드 내 실시간 알림 (토스트, 행 하이라이트)
- 데이터 소스: 복합/미정 → 추상화된 데이터 수집 레이어

---

## 2. 기술 스택

| 레이어 | 기술 | 선택 이유 |
|--------|------|-----------|
| **프론트엔드** | React + Vite + TypeScript | 넓은 생태계, 빠른 HMR, 타입 안전성 |
| **테이블** | TanStack Table v8 | 무료, 가상 스크롤, 헤드리스 UI로 커스텀 자유 |
| **실시간 통신** | WebSocket (native) | 양방향 통신 (필터 변경 → 서버, 데이터 푸시 → 클라이언트) |
| **상태 관리** | Jotai | atomFamily로 테이블별 상태 구조적 분리, 리렌더 격리 보장 |
| **백엔드** | FastAPI (Python) | 비동기 네이티브, WebSocket 내장, 빠른 개발 |
| **ORM** | SQLAlchemy 2.0 (async) | FastAPI와 최적 호환, 비동기 쿼리 |
| **세션/캐시** | Redis | 실시간 사용자 세션, WebSocket pub/sub 브로커 |
| **데이터 저장** | PostgreSQL | 랏 데이터, 사용자-랏 매핑, 필터 프리셋 |
| **인증** | OIDC + `python-jose[cryptography]` | 사내 IdP 연동, JWT 검증/세션 관리 단순화 |
| **배포** | Docker Swarm | 멀티 노드 오케스트레이션, rolling update |
| **리버스 프록시** | Nginx / Traefik | WebSocket 프록시, SSL 터미네이션, 로드밸런싱 |

### 결정 근거 — 핵심 기술 선택

| 결정 | 고려한 대안 | 대안 거절 이유 | 선택 이유 |
|------|-------------|---------------|-----------|
| **React** (프론트엔드) | Vue 3, Svelte | Vue: 사내 React 경험 부재 시 전환 비용 큼. Svelte: 생태계 협소, TanStack Table 공식 지원 불안정 | 팀 기존 역량, TanStack Table·Zustand 등 핵심 라이브러리의 1급 지원 |
| **Vite** (번들러) | Webpack 5, Parcel | Webpack: HMR 느림, 설정 복잡. Parcel: 대형 프로젝트 커스터마이징 한계 | ESM 기반 즉시 서버 기동, 빌드 속도 5~10배 우위, React 공식 권장 |
| **TanStack Table v8** (테이블) | AG Grid, react-table v7 | AG Grid Community: Excel 내보내기·행 그룹핑이 Enterprise 전용(유료). v7: 헤드리스 아님, 스타일 커스텀 어려움 | 완전 헤드리스·무료·가상 스크롤 내장, SheetJS 조합으로 Excel 내보내기 자체 구현, Notion 디자인 시스템 완전 적용 가능 |
| **Jotai** (상태 관리) | Zustand, Redux Toolkit | Zustand: selector 미사용 시 store 전체 구독으로 6개 테이블이 함께 리렌더되는 위험. Redux: 보일러플레이트 과도, WebSocket 미들웨어 추가 필요 | `atomFamily(tableId)` 패턴으로 테이블별 상태 구조적 분리 — 테이블 0 업데이트가 테이블 1~5 리렌더를 유발하지 않음이 보장됨. atom effect로 WebSocket 이벤트를 해당 테이블 atom에 직접 연결 |
| **FastAPI** (백엔드) | Django + Channels, Node.js/Express | Django + Channels: WebSocket 지원 가능하나 channel layer 추상화 레이어 추가. Node: 팀 Python 역량 우선 | Pydantic으로 WebSocket 메시지 스키마 자동 검증, OpenAPI 자동 문서화, 직접 Redis pub/sub 통합으로 channel layer 없이 투명한 멀티워커 브로드캐스트 |
| **SQLAlchemy 2.0 async** (ORM) | Tortoise-ORM, raw asyncpg | Tortoise: FastAPI 통합 문서 부족, 마이그레이션 도구 성숙도 낮음. raw asyncpg: 보일러플레이트 많고 마이그레이션 부재 | FastAPI 공식 문서 기준 스택, Alembic 마이그레이션 완벽 지원 |
| **Redis** (세션/캐시) | Memcached, 인메모리 dict | Memcached: Pub/Sub 기능 없어 WebSocket 브로드캐스트 불가. 인메모리: 멀티 워커 간 상태 공유 불가 | Pub/Sub + 세션 + 쿼리 캐시를 단일 인스턴스로 처리, 다중 FastAPI 워커 간 이벤트 브로드캐스트 필수 |
| **PostgreSQL** (데이터 저장) | MySQL, SQLite | MySQL: JSONB 지원 약함(랏 메타데이터 저장에 불리). SQLite: 멀티 워커 동시 쓰기 부적합 | JSONB 네이티브 지원, TIMESTAMPTZ 타임존 처리, 고성능 동시성 |
| **Docker Swarm** (오케스트레이션) | Kubernetes, K3s, Docker Compose 단독 | K8s: 베어메탈 환경에서 etcd·control plane 운영 인력 과도. K3s: 경량이나 베어메탈 CNI 설정(Flannel 등) 추가 부담. Compose 단독: 멀티 노드·롤링 업데이트 불가 | 소규모 VM/베어메탈(2~5노드)에서 Compose 문법 재사용, 별도 오케스트레이션 학습 없이 운영 가능 |

---

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

---

## 10. 수용 기준 (Acceptance Criteria)

| # | 기준 | 측정 방법 |
|---|------|-----------|
| AC-1 | 테이블 데이터 초기 로드 < 1초 (p99) | 브라우저 Performance API |
| AC-2 | WebSocket 데이터 푸시 지연 < 500ms (서버 감지 → 클라이언트 수신) | 서버/클라이언트 타임스탬프 비교 |
| AC-3 | 동시 50명 접속 시 CPU < 70% | Docker stats 모니터링 |
| AC-4 | SSO 로그인 < 3초 | IdP 리다이렉트 + 세션 생성 시간 포함 |
| AC-5 | 필터 변경 후 테이블 업데이트 < 500ms | UI 인터랙션 측정 |
| AC-6 | 24시간 무중단 운영 (메모리 누수 없음) | 장기 부하 테스트 |
| AC-7 | 2x3 그리드 레이아웃 정상 렌더링 (1920x1080 기준) | E2E 스크린샷 테스트 |
| AC-8 | 테이블 수동 리프레시 버튼 클릭 후 데이터 갱신 < 1초 (Redis 캐시 바이패스) | 버튼 클릭 → table_update 수신 타임스탬프 |

---

## 11. 리스크 및 대응

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 외부 데이터 소스 지연/장애 | 테이블 데이터 미갱신 | 캐시 fallback + 마지막 갱신 시간 표시 + 장애 알림 |
| WebSocket 연결 끊김 | 실시간 업데이트 중단 | 자동 재연결 (exponential backoff) + 재연결 시 full sync |
| Redis 장애 | pub/sub 중단 → 실시간 업데이트 멈춤, 캐시 손실 | Docker Swarm 자동 재시작(통상 1분 이내 복구) + `appendonly yes`로 캐시 데이터 영속. JWT로 세션 보조. 허용 다운타임 5분 이내. Sentinel은 요구사항 상향 시 추후 도입 |
| Docker Swarm 노드 장애 | 서비스 다운 | 레플리카 최소 2개, health check + 자동 재스케줄링 |
| IdP/SSO 인증 장애 | 신규 로그인 불가 | 기존 Redis 세션 유지 + 장애 원인(`SSO_*`, 인증서, nonce) 로그 확인 |

---

## 12. 구현 우선순위 (Phase)

### Phase 1: 기반 구축
- [ ] 프로젝트 스캐폴딩 (React + FastAPI + Docker Compose)
- [ ] PostgreSQL 스키마 + Alembic 마이그레이션
- [ ] Redis 연결 + 기본 캐시 레이어
- [ ] SSO(OIDC) 인증 플로우

### Phase 2: 코어 대시보드
- [ ] 2x3 그리드 레이아웃 + 빈 슬롯 UI
- [ ] TanStack Table 기본 테이블 컴포넌트
- [ ] 글로벌 필터 사이드바
- [ ] REST API (랏 데이터 CRUD)

### Phase 3: 실시간 기능
- [ ] WebSocket 연결 관리
- [ ] Redis pub/sub 기반 변경 브로드캐스트
- [ ] 서버 폴링 스케줄러 (30~60초) + diff 감지
- [ ] 수동 리프레시 (`refresh` WS 메시지 → 캐시 바이패스 즉시 수집)
- [ ] TableHeader 컴포넌트 (리프레시 버튼 + 마지막 갱신 시간)
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
