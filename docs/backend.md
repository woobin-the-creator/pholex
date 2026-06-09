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
-- 사용자-랏 매핑 — 슬롯[2] "내 관심 랏" watchlist (유저가 수동 등록한 lot 목록)
-- 식별자는 사번(employee_number) 단일키 정책에 정렬 (employee_id 제거 결정과 일관)
CREATE TABLE user_lots (
    id SERIAL PRIMARY KEY,
    employee_number VARCHAR(50) NOT NULL,  -- 사번 (users.employee_number 참조), 기존 user_id 대체
    lot_id VARCHAR(100) NOT NULL,
    order_index INT NOT NULL DEFAULT 0,    -- 입력 순서 보존 (저장=전체교체 시 화면 순서대로 재표시)
    team_id VARCHAR(100),                  -- (예약) 현재 스코프 미사용, NULL 허용
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(employee_number, lot_id)
);
CREATE INDEX idx_user_lots_employee_number ON user_lots(employee_number);  -- 내 관심 랏 목록 조회

-- 랏 상태 (수집된 데이터) — lot_id가 유니크하므로 PK로 직접 사용
CREATE TABLE lot_status (
    lot_id VARCHAR(100) PRIMARY KEY,
    status VARCHAR(20) NOT NULL CHECK (status IN ('run', 'wait', 'hold')),
    equipment VARCHAR(100),
    process_step VARCHAR(100),
    hold_comment TEXT,                -- hold 상태일 때 홀드 사유
    hold_operator_id BIGINT,          -- hold 담당자 사번 [CONTRACT-1] 실제 dump 컬럼명 사내 확인 필요(예 lot_hold_user_id), 값=employee_number(사번). 도메인은 문자열 hold_operator_employee_number 사용 → 타입 매핑 주의
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);
-- 수집 시: INSERT ... ON CONFLICT (lot_id) DO UPDATE SET ...  [CONTRACT-3] dump 컬럼셋 = 위 lot_status 컬럼 전체
CREATE INDEX idx_lot_status_updated_at ON lot_status(updated_at);
CREATE INDEX idx_lot_status_status ON lot_status(status);
CREATE INDEX idx_lot_status_hold_operator ON lot_status(hold_operator_id) WHERE status = 'hold';  -- 슬롯[1] "내 lot hold" fallback 필터

-- dump 생존 heartbeat — 행 1개 고정(id=1). "내 lot hold" 신선도(🟡/🔴) + "내 관심 랏" 갱신 판정의 단일 소스
-- ⚠ lot_status 행의 updated_at으로 dump 생존을 추론하지 말 것: 변동 없는 lot은 updated_at이 정상적으로 오래됨 → 거짓 stale
CREATE TABLE lot_dump_meta (
    id          INT PRIMARY KEY DEFAULT 1,        -- 단일 행
    last_run_at TIMESTAMPTZ NOT NULL,             -- [CONTRACT-4] 사내 dump가 매 실행 끝에 now로 upsert (lot 변경 유무와 무관)
    row_count   INT,                              -- (옵션) 이번 dump가 처리한 lot 수
    status      VARCHAR(20) DEFAULT 'ok'          -- (옵션) ok | partial | error
);

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

### 4.3 "내 관심 랏"(슬롯[2]) + "내 lot hold"(슬롯[1]) fallback — 데이터 흐름

> 전체 설계 시각화: `docs/watchlist-final-design.html`

**배경**: 슬롯[2]는 placeholder "수율 계측" → "내 관심 랏"으로 교체. 기존 슬롯[1] "내 lot hold"는 유지하되 신호등 + 캐시 fallback 추가. `lot_status`는 30분 dump 마스터 캐시로, 두 슬롯의 공용 소스가 된다.

**슬롯[1] "내 lot hold" (유지 + 보강)** — 실시간 LotSource(`hold_operator=나` 자동) primary. 실패 시 `lot_status WHERE hold_operator_id=나`로 캐시 fallback. 응답 payload에 `health` 필드(백엔드 주도, 프론트는 값만 따름):

| health | 의미 |
|--------|------|
| `live` | LotSource 실시간 성공 (🟢) |
| `cache` | 실시간 실패 → lot_status 캐시 응답, ≤30분 (🟡) |
| `stale`/`down` | `lot_dump_meta.last_run_at`이 dump 주기 2배(≈60분) 초과 또는 완전 실패 (🔴) |

**슬롯[2] "내 관심 랏" (신규)** — 유저가 lot_id 수동 입력·저장하는 watchlist.
- **저장**: 전체 교체(set semantics) — 화면 리스트가 곧 watchlist 전체. `user_lots`에서 내 행 전부 삭제 후 재삽입(UnitOfWork 원자성). 빈 row drop / 중복 dedupe / `order_index`로 순서 보존.
- **검증/표시**: lot_id 무조건 저장(유저 의도). 표시 시 `user_lots ⨝ lot_status` live JOIN — 매칭 안 되면 "조회 대기/없음" 행 유지, 다음 dump에서 자동 채워짐.
- **갱신**: 저장 직후 + 탭 포커스 복귀 + `lot_dump_meta.last_run_at` 변경 시(가벼운 폴링). 신선도는 "데이터 기준 HH:MM(+stale ⚠️)" 라벨. WS 미사용.

**🔴 사내 AI ↔ pholex 계약** (real dump 구현 시 반드시 매칭):

| ID | 내용 |
|----|------|
| CONTRACT-1 | `lot_status.hold_operator_id` 실제 dump 컬럼명(예 `lot_hold_user_id`) + 값=employee_number(사번). 도메인 문자열 `hold_operator_employee_number`와 타입 매핑 주의 |
| CONTRACT-2 | `lot_id` 형식(자릿수/접두어 패턴) — 슬롯[2] 클라이언트 형식 검증용 |
| CONTRACT-3 | `lot_status` dump 컬럼셋 = lot_id, status, equipment, process_step, hold_comment, hold_operator_id, updated_at |
| CONTRACT-4 | `lot_dump_meta.last_run_at` 매 dump 실행마다 upsert (lot 변경 무관) — 신선도 판정 소스 |

> **dump 소유**: bigdataquery → `lot_status` + `lot_dump_meta` 적재 잡은 **사내 AI 소유·레포 바깥**, 사내 스케줄러 30분 주기. pholex는 push 없이 읽기만. 신선도는 `lot_dump_meta`로 추론(콜백 결합 없음). 단, 30분 dump cadence는 §7의 기존 5~30초 스케줄러 모델과 상충 → §7 후속 갱신 필요.

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

> ⚠️ **§4.3과의 cadence reconciliation (2026-06-06)** — 아래 흐름은 "5~30초 collector가 `lot_status`를 갱신 → WS push" 모델인데, §4.3에서 `lot_status`의 writer를 **사내 AI 소유 30분 dump(레포 바깥)** 로 바꿨다. **MVP/goal 범위로 정리** (실시간 redesign은 미해결 blocker가 아니라 의식적으로 연기한 stretch goal):
> - **MVP 범위 = "랏 데이터를 보여준다"** (30분 dump 데이터로 충분). 이 경로는 다 결정됨 → 슬롯[1] "내 lot hold"는 **기존 실시간 LotSource/WS 코드를 그대로 유지**하고, 거기에 `lot_status`(30분) fallback + `lot_dump_meta` heartbeat 신선도만 **추가**한다. 작동하는 코드를 뜯지 않으므로 "live가 30분보다 신선한가"라는 사내 사실은 **MVP에선 moot**.
> - **goal 범위 = "실시간/준실시간 랏 데이터"** (stretch). LotSource가 **포트**라 MVP는 30분 캐시 어댑터로 두고, 나중에 빠른 live 어댑터를 같은 포트에 꽂으면 된다 — 그래서 아래 항목은 지금 정하지 않아도 build가 안 막힌다.
> - **goal로 연기된 항목**: 30분 dump가 `lot_status`의 유일 writer일 때 WS 실시간 push의 트리거 정의, 슬롯[1] "실시간"의 실제 cadence, ①사내 REST API가 30분 dump보다 신선한지, collector(api/db) 역할이 dump로 흡수되는지. 본 §7 트레이드오프 표·아래 흐름도는 **과거 결정 기록으로 보존**하며, 실시간 goal 착수 시 갱신한다.

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
