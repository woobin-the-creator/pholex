# Pholex — 백엔드 설계

> FastAPI · PostgreSQL · Redis · 실시간 데이터 흐름 · WebSocket 프로토콜

---

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
CREATE INDEX idx_user_lots_user_id ON user_lots(user_id);  -- 로그인 시 사용자 랏 목록 조회

-- 랏 상태 (수집된 데이터) — lot_id가 유니크하므로 PK로 직접 사용
CREATE TABLE lot_status (
    lot_id VARCHAR(100) PRIMARY KEY,
    status VARCHAR(20) NOT NULL CHECK (status IN ('run', 'wait', 'hold')),
    equipment VARCHAR(100),
    process_step VARCHAR(100),
    hold_comment TEXT,                -- hold 상태일 때 홀드 사유
    hold_operator_id BIGINT,          -- hold 담당자 사번 (number type, 실제 컬럼명은 사내 확인 필요)
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);
-- 수집 시: INSERT ... ON CONFLICT (lot_id) DO UPDATE SET ...
CREATE INDEX idx_lot_status_updated_at ON lot_status(updated_at);
CREATE INDEX idx_lot_status_status ON lot_status(status);
CREATE INDEX idx_lot_status_hold_operator ON lot_status(hold_operator_id) WHERE status = 'hold';

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

---

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
│   │   ├── auth.py                  # OIDC SSO 인증 로직 (python-jose RS256 검증)
│   │   ├── session.py               # Redis 세션 관리 (2주 TTL)
│   │   └── websocket_manager.py     # WebSocket 연결 관리 + Redis pub/sub
│   ├── collectors/
│   │   ├── base.py                  # 추상 데이터 수집기 (LotData 반환 인터페이스)
│   │   ├── api_collector.py         # Primary: 사내 REST API (lot_id 필수 파라미터)
│   │   ├── db_collector.py          # Fallback: 사내 Python lib → SQL → pandas → df.to_sql
│   │   └── registry.py              # 활성 Collector 선택 + block 감지 시 Fallback 전환
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

---

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

> **데이터 소스 확정**: Primary = 사내 REST API (`lot_id` 필수 파라미터). Fallback = 사내 전용 Python 라이브러리 → pandas DataFrame → `df.to_sql` → PostgreSQL. API block 감지 시 자동 전환.
> **폴링 주기**: 30~60초 (사내 API rate limit 문서 없음 → 보수적 설정 + 429/연결 오류 모니터링).

### 알림 조건 (확정)

| 상태 변경 | severity | 처리 |
|-----------|----------|------|
| 모든 방향 (run↔wait, wait↔hold, hold↔run 등) | warning | 주황 토스트 |
| `* → hold` | critical | 빨강 토스트 + 행 하이라이트 (`#e53e3e`) |

```python
# services/alert_service.py
def get_severity(status_from: str, status_to: str) -> str:
    if status_to == "hold":
        return "critical"
    return "warning"
```

상태 변경 감지: `diff` 비교 시 `status` 필드 변화 확인. 변경이 있으면 `alert` 메시지 발행 후 `table_update` 함께 전송.

### 결정 근거 — 실시간 아키텍처 선택

| 결정 | 고려한 대안 | 대안 거절 이유 | 선택 이유 |
|------|-------------|---------------|-----------|
| **폴링 + WebSocket 하이브리드** | 순수 WebSocket 스트리밍 | 순수 WebSocket: 외부 MES/EAP 소스가 이벤트 기반이 아닌 폴링 필요 구조. 커넥션 유실 시 전체 재동기화 복잡 | 폴링으로 데이터 수집(소스 제약), WebSocket으로 변경분만 푸시(클라이언트 효율). 역할 분리로 각 레이어 독립 교체 가능 |
| **서버 사이드 diff 비교** | 클라이언트 사이드 diff | 클라이언트: 전체 행 데이터를 매번 전송해야 하므로 대역폭 낭비. 50명 × N개 테이블 × 수백 행 = 과부하 | 서버에서 변경된 행만 식별 후 `diff: true` 페이로드로 전송, 네트워크 트래픽 80% 이상 절감 |
| **Redis Pub/Sub 브로커** | 직접 WebSocket Manager 브로드캐스트 | 직접 브로드캐스트: FastAPI 워커가 단일 프로세스일 때만 동작. Swarm 멀티 레플리카 환경에서 워커 간 이벤트 공유 불가 | Redis가 모든 워커의 이벤트 허브 역할. 워커 수평 확장 시에도 모든 구독자에게 이벤트 전달 보장 |
| **사용자 우선순위 수집** | 모든 사용자 균등 수집 | 균등 수집: 비활성 사용자의 데이터도 동일 주기로 수집하면 CPU/DB 부하 불필요하게 증가 | 접속 중인 사용자 구독 랏을 우선 수집 → 체감 지연 감소. `active_users` Redis Set으로 O(1) 조회 |
| **테이블 단위 부분 업데이트** | 전체 대시보드 리렌더 | 전체 리렌더: 6개 테이블 × 수백 행을 매 5~30초마다 재렌더하면 UI 버벅임 발생 | 변경된 테이블의 해당 행만 React state 업데이트 → 나머지 테이블 렌더 skip. TanStack Table의 행 단위 업데이트 활용 |

---

## 8. WebSocket 메시지 프로토콜

```typescript
// 클라이언트 → 서버
{ type: "subscribe", payload: { tableId: 0, filters: {...} } }
{ type: "unsubscribe", payload: { tableId: 0 } }
{ type: "filter_change", payload: { scope: "global"|"table", tableId?: 0, filters: {...} } }
{ type: "refresh", payload: { tableId: 0 } }  // 수동 리프레시 — Redis 캐시 바이패스 후 즉시 수집
{ type: "heartbeat" }

// 서버 → 클라이언트
{ type: "table_update", payload: { tableId: 0, rows: [...], diff: true } }
{ type: "alert", payload: { lotId: "...", message: "...", severity: "warning"|"critical" } }
{ type: "session_info", payload: { activeUsers: 23 } }
{ type: "heartbeat_ack" }
```
