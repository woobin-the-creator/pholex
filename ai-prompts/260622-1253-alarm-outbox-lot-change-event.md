# 알람 outbox — `lot_change_event` 테이블 + dump diff + `RealLotSource.subscribe_changes` 확정 (사내 위임)

> **이 문서가 닫는 미결**: [`260615-1325-pr28-29-real-adapters-handoff.md`](./260615-1325-pr28-29-real-adapters-handoff.md) **파트 A(알람 스트림)** 는 "옵션 B(30분 dump diff) 유력"까지만 정하고 **substrate(이벤트를 어디에 두고 프로세스 간 어떻게 전달할지)** 를 열어 뒀다. 그래서 `RealLotSource.subscribe_changes`가 **stub**으로 남았고, 운영 dev에서 알람 박스가 비어 있다(=정상, 미구현 상태였음).
>
> 본 문서는 그 substrate를 **Postgres outbox 테이블 `lot_change_event`** 로 확정한다. 파트 A의 "옵션 B + 재구독 replay C-1"의 **구체 구현 사양**이다. 파트 A를 대체(supersede)하며, 파트 B(키워드 Hold)는 무관하다.

---

## 0. 왜 stub이었나 — 근본 원인 (읽고 시작)

`subscribe_changes`는 **웹서버 프로세스**(WS 핸들러) 안에서 돈다. 그런데 변경을 감지하는 **30분 dump 잡은 별도 cron 프로세스**(`docs/dump-job-spec.md`)다. fake(`InMemoryLotSource`)는 같은 프로세스라 `asyncio.Queue` fan-out으로 되지만, real은 **두 프로세스를 잇는 매개가 없어서** 이벤트를 만들 원천이 없었다. → in-memory `emit` 패턴은 real에 그대로 못 쓴다.

**해결: 두 프로세스를 Postgres 테이블 하나로 잇는다 (transactional outbox).**

```
[cron] 30분 dump  ──(같은 트랜잭션)──▶  lot_status upsert + lot_change_event INSERT + lot_dump_meta
                                                  │
                                                  ▼ (웹서버가 폴링으로 읽음)
[web]  WS subscribe_changes  ──tail/backfill──▶  LotChangeEventDTO 스트림 ──▶ StreamHoldChanges(usecase, severity 분류) ──▶ 프론트 알람 박스
```

데이터가 본질적으로 30분 주기라 **실시간 push API는 불필요**하다. dump 시점에 변경을 합성하는 것이 타협이 아니라 올바른 주기다.

---

## 1. 단일 기준 (source of truth) — 규율 1·2

| 항목 | 유일한 기준(레포) | 역산 금지 |
|------|------------------|-----------|
| 이벤트 형태 | `app/ports/dto.py` `LotChangeEventDTO` (frozen, extra=forbid) | DB 컬럼을 그대로 흘리기 |
| 스트림 인터페이스 | `app/ports/lot_source.py` `subscribe_changes` | 시그니처/반환 타입 변경 |
| severity | usecase `stream_hold_changes.py`가 분류 | **어댑터가 severity를 채우지 않는다** |
| 모드 env | `app/config.py` `ADAPTER_MODE` | **새 env 발명 금지** (폴링 주기·replay 창은 어댑터 내부 상수) |

`LotChangeEventDTO` 필드(재확인): `lot_id`, `change_type`(`status`|`hold`|`comment`|`created`|`removed`), `previous_status`, `new_status`, `new_hold_comment`, `occurred_at`(**tz-aware 필수**), `event_id`(**unique + 시간 정렬 가능**). 프론트는 `eventId`로 dedup, `occurredAt`로 정렬(파트 A 계약 유지).

---

## 2. 새 테이블 `lot_change_event` (계약 — DDL은 사내 alembic)

`keyword_presets`와 동일 선례: **컬럼·의미 계약은 본 문서가 정의**하고, **alembic 마이그레이션은 사내가 작성**한다(`adapter-spec.md §11`, 260615 파트 B-3와 같은 패턴). 타입의 세부(VARCHAR 길이 등)는 사내 자율.

```sql
CREATE TABLE lot_change_event (
    seq         BIGSERIAL PRIMARY KEY,          -- 단조 증가. tail 커서 + 정렬 기준 (DTO에는 안 나감)
    event_id    VARCHAR(120) NOT NULL UNIQUE,   -- DTO.event_id. 결정적 키 → dedup·멱등 (ALARM-2)
    affected_employee_number VARCHAR(50) NOT NULL, -- 이 이벤트가 "누구 알람"인지. 필터/fan-out용 (ALARM-3). DTO엔 없음
    lot_id      VARCHAR(100) NOT NULL,
    change_type VARCHAR(16)  NOT NULL,          -- status|hold|comment|created|removed
    previous_status VARCHAR(32),
    new_status      VARCHAR(32),
    new_hold_comment TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,           -- tz-aware. lot updated_at 우선, 없으면 dump 시각
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()  -- 적재 시각 (retention 기준)
);
CREATE INDEX ix_lce_emp_seq ON lot_change_event (affected_employee_number, seq);
```

- `affected_employee_number`는 **테이블 전용 필터 컬럼**이다. `LotChangeEventDTO`로 매핑할 때는 빼고 나머지 필드만 채운다 → DTO 무변경, CI gate 안전.
- `seq`(BIGSERIAL)는 tail 커서·정렬용, `event_id`(결정적 문자열)는 프론트 dedup용. **둘은 역할이 다르다.**

---

## 3. dump 잡이 추가로 할 일 (`dump-job-spec.md` 확장) — ALARM-1

기존 dump(`lot_status` upsert + `lot_dump_meta` 갱신)에 **변경 이벤트 적재**를 더한다. 핵심은 **한 트랜잭션**이다.

```text
BEGIN
  old := SELECT lot_id, status, hold_comment, hold_operator_id FROM lot_status   -- upsert 전 스냅샷
  for each incoming row r:
      o := old[r.lot_id]
      if o is None:                      change_type = "created"
      elif o.status != r.status:         change_type = "status"   (previous=o.status, new=r.status)
      elif o.hold_operator_id != r.hold_operator_id: change_type = "hold"
      elif o.hold_comment != r.hold_comment:         change_type = "comment" (new_hold_comment=r.hold_comment)
      else: continue                     -- 변경 없음, 이벤트 없음
      → affected 계산(ALARM-3) → 각 affected마다 1행:
        INSERT INTO lot_change_event (event_id, affected_employee_number, lot_id, change_type,
                                      previous_status, new_status, new_hold_comment, occurred_at)
        VALUES (...) ON CONFLICT (event_id) DO NOTHING     -- 멱등
  upsert lot_status        -- 기존 §3.2 그대로
  upsert lot_dump_meta     -- 기존 §4 그대로 (변경 0건이어도 last_run_at 갱신)
COMMIT
```

- **ALARM-1 원자성**: 이벤트 INSERT는 `lot_status`/`lot_dump_meta` upsert와 **같은 트랜잭션**이어야 한다. dump가 중간에 죽으면 셋 다 롤백 — "데이터는 Hold인데 알람은 없는" split-brain을 원천 차단. (Redis outbox로는 이 보장이 불가능해서 Postgres로 확정함.)
- **삭제된 lot(`removed`)**: `DEL-POLICY`(dump-job-spec §3.3)가 MVP에서 "stale 유지(삭제 안 함)"이므로 `removed`는 **MVP 범위 밖**. 정책 바뀌면 그때 추가.
- **status 전이가 제일 중요**: usecase는 `status` & `new=hold` & `prev≠hold`만 critical로 분류한다. 그러니 `previous_status`/`new_status`를 raw 값 그대로(매핑 금지) 정확히 채우는 게 알람 정확도의 핵심.

### ALARM-2 — `event_id` 결정적 키 (dedup·멱등)

```
event_id = f"{dump_run_id}:{lot_id}:{change_type}"
```
- `dump_run_id`: 이번 dump 실행을 식별하는 안정 값(예: `last_run_at`의 ISO/epoch). 같은 dump의 같은 논리 변경 → **항상 같은 id**. dump 재실행(멱등)에도 같은 id라 `ON CONFLICT DO NOTHING`으로 중복 차단.
- 매번 변하면 → 재연결 중복 적립. 서로 다른 변경에 같은 id → 알람 누락(dedup으로 삼켜짐). 둘 다 금지(파트 A 계약).
- **stop-and-ask**: 소스에 변경을 고유 식별할 안정 컬럼/타임스탬프가 없으면 **임의 키를 발명하지 말고**, 가용 컬럼 목록과 함께 멈춰 보고. `dump_run_id`를 쓰는 위 공식이면 소스 컬럼 없이도 성립한다(우선 적용 권장).

### ALARM-3 — `affected_employee_number` 산출 (relevance / fan-out)

이 이벤트가 **누구의 알람**인가 = 그 hold의 담당 사번.

| 변경 | affected |
|------|----------|
| run/wait → hold (신규 hold) | **새** `hold_operator_id`(잡은 사람) |
| hold → run/wait (해제) | **이전** `hold_operator_id`(놓은 사람) |
| hold 유지·comment 변경 | 현재 `hold_operator_id` |
| 담당자 이관(prev≠new, 둘 다 non-null) | **두 행**: 이전 담당(해제 관점) + 새 담당(획득 관점) 각각 1행 |

- 규칙: `affected = COALESCE(new hold_operator_id, previous hold_operator_id)`. 이관이면 두 사번 각각에 행 생성.
- `hold_operator_id`가 둘 다 NULL이면(hold 무관 lot) 알람 대상 없음 → 이벤트 생략.
- 이 컬럼으로 `subscribe_changes(emp)`가 `WHERE affected_employee_number = :emp`로 자기 알람만 가져간다 = fetch_my_holds("내 hold")와 같은 범위.
- **MVP 범위**: hold 담당자 기준만. watchlist(관심 랏) 알람은 별도 슬롯으로 추후(§7 미결).

---

## 4. `RealLotSource.subscribe_changes` 구현 — ALARM-4

`backend/app/adapters/real/lot_source.py`의 `RealLotSource`. **fan-out은 in-memory 큐가 아니라 "각 구독자가 같은 테이블을 읽는다"로 달성**한다(테이블이 공유 매개).

```text
def subscribe_changes(self, employee_number) -> AsyncIterator[LotChangeEventDTO]:
    async def _iter():
        # (1) backfill: 재연결 시 못 본 최근 이벤트 replay (옵션 C-1 확정)
        last_seq = 0
        rows = SELECT * FROM lot_change_event
               WHERE affected_employee_number = :emp
                 AND created_at >= now() - REPLAY_WINDOW
               ORDER BY seq
        for row in rows: last_seq = row.seq; yield to_dto(row)
        # (2) tail: 신규 이벤트 폴링
        while True:
            await asyncio.sleep(POLL_INTERVAL)
            rows = SELECT * FROM lot_change_event
                   WHERE affected_employee_number = :emp AND seq > :last_seq
                   ORDER BY seq
            for row in rows: last_seq = row.seq; yield to_dto(row)
    return _iter()
```

- **REPLAY_WINDOW / POLL_INTERVAL은 어댑터 내부 상수**(예: 24h / 15s). **새 env 만들지 말 것**(규율: 새 env 금지). 30분 주기라 POLL_INTERVAL은 정확도에 무관(15~30s면 충분).
- **옵션 C-1 확정(replay 함)**: 재연결 시 REPLAY_WINDOW 내 이벤트를 다시 흘려보낸다. `event_id`가 결정적이라 **프론트가 dedup**하므로 중복 적립 없음. 이것이 "자리를 비운 사이 알람이 쌓여 있다"는 요구를 충족하는 지점.
- **다중 구독자 fan-out**: 같은 사번 두 iterator는 각자 같은 테이블을 폴링 → 둘 다 동일 이벤트 수신(계약 충족). 공유 큐 불필요.
- **`to_dto`**: 행 → `LotChangeEventDTO`. `affected_employee_number`/`seq`/`created_at`은 **제외**, `occurred_at`은 tz-aware 보장(naive면 validator 실패).
- **멱등 unsubscribe**: `aclose()`로 루프 종료 시 raise 금지(fake `_iter` finally 패턴 참고).
- **ALARM-5(재확인)**: 어댑터는 severity를 **채우지 않는다**. `previous_status`/`new_status`만 정확히 주면 usecase가 분류.

---

## 5. 검증 + 증거 (규율 4) — 명령 결과를 붙여 보고

```bash
# 1) 경계 gate(CI): 사내는 real/·alembic·contract 시드만 — 아래 빈 diff여야 함
git diff origin/main -- backend/app/domain backend/app/usecases backend/app/api backend/app/ports
#    (DTO/Port/usecase/api 무변경. lot_change_event는 새 테이블이라 도메인 코드 안 건드림)

# 2) wire 계약(eventId/occurredAt) 회귀
cd backend && pytest tests/api/test_ws_wire_format.py -q

# 3) 계약 동치(fake=real) — real 분기에서 subscribe 테스트 방식만 교체
cd backend && pytest tests/contract -k 'fake or real' -q

# 4) 전체
cd backend && pytest -q
```

- 계약 테스트 주의: `test_subscribe_multi_subscriber_fanout`는 fake `emit` 헬퍼를 쓰므로 real은 skip된다(현재도 그렇게 설계됨). **real 전용 통합 테스트를 추가**하라 — `lot_change_event`에 1행 INSERT → 같은 사번 두 구독자가 모두 그 `event_id`를 수신하는지.
- **운영 스모크(증거로 첨부)**:
  1. dev DB에서 한 lot을 `run`→`Hold`로 바꾸는 dump 한 사이클 실행 → `lot_change_event`에 `change_type='status'`, `new_status='Hold'`, `affected_employee_number='99999'` 행이 생겼는지 `SELECT`로 확인.
  2. `ADAPTER_MODE=real` 기동 후 99999로 접속 → **알람 박스에 그 알람이 뜨는지**.
  3. 페이지 새로고침(재연결) → **같은 알람이 중복 적립되지 않는지**(eventId dedup).
  4. dump를 두 번째로(동일 입력) 재실행 → `lot_change_event` 행 수 **불변**(ON CONFLICT 멱등).

---

## 6. 사내 AI 체크리스트

- [ ] alembic: `lot_change_event` 테이블 + `ix_lce_emp_seq` 인덱스 (§2 계약대로) upgrade/downgrade
- [ ] dump 잡: upsert 전 스냅샷 diff → 이벤트 합성 → **lot_status·lot_dump_meta와 같은 트랜잭션**으로 INSERT (ALARM-1)
- [ ] `event_id = {dump_run_id}:{lot_id}:{change_type}` 결정적 키 + `ON CONFLICT(event_id) DO NOTHING` (ALARM-2)
- [ ] `affected_employee_number` 산출 규칙(이관 시 2행 포함) (ALARM-3)
- [ ] `previous_status`/`new_status` raw 값 그대로(매핑 금지), `occurred_at` tz-aware
- [ ] `RealLotSource.subscribe_changes`: backfill(REPLAY_WINDOW) + tail(POLL_INTERVAL 상수, **새 env 금지**) + 멱등 unsubscribe (ALARM-4)
- [ ] `to_dto`에서 `affected_employee_number`/`seq` 제외하고 DTO 매핑
- [ ] real 전용 다중 구독자 통합 테스트 추가
- [ ] §5 스모크 4단계 증거 첨부 보고

---

## 7. 미결 / 협상 항목 (사내 확인 후 회신)

| ID | 내용 | 기본값 |
|----|------|-------|
| RETAIN | `lot_change_event` retention(예: `created_at < now()-30d` 주기 삭제) | 사내 자율, 30일 권장 |
| WATCHLIST-ALARM | 관심 랏(hold 아님) 변경도 알람 줄지 | **MVP 제외**(hold 담당자만). 추후 슬롯 |
| RUNID | `dump_run_id` 실제 소스(예: `last_run_at` epoch) | §ALARM-2 공식 우선, 소스 컬럼 부재 시 stop-and-ask |
| TXN-SCOPE | dump가 별도 ETL 도구라 단일 트랜잭션 묶기 어려운 구조면 보고 | 묶기 어려우면 멈춰 보고(임의 분리 금지) |

> **DTO/Port 변경이 필요하다고 판단되면** 임의로 고치지 말고 멈춰 보고하라. `app/ports`·`app/domain`·`app/usecases`·`app/api`는 Claude의 별도 PR 영역이다(CI gate가 강제). 본 작업은 `real/` + alembic + contract 시드 + 레포 밖 dump 잡만 건드린다.
