# Dump Job Spec — 30분 `lot_status` / `lot_dump_meta` 적재 잡 (사내 위임)

> **이 문서의 스코프**: 사내 스케줄러가 30분 주기로 실행하는 **레포 바깥 배치 ETL 잡**의 사양이다.
> 사내 lot 데이터를 읽어(fetch) Pholex Postgres의 `lot_status` + `lot_dump_meta` 두 테이블에
> 적재(load)하는 것까지가 이 잡의 책임이다.
>
> **혼동 주의 — `docs/adapter-spec.md`와 다른 작업이다.**
>
> | | `adapter-spec.md` | 본 문서 (`dump-job-spec.md`) |
> |--|--|--|
> | 대상 | Pholex 앱 **안의** Real adapter 4종 | Pholex 앱 **밖의** 배치 dump 잡 |
> | 호출 주체 | `ADAPTER_MODE=real`일 때 앱이 호출 | 사내 스케줄러가 30분마다 실행 |
> | 출력 | DTO 반환 (in-memory) | `lot_status`·`lot_dump_meta` 테이블 적재 |
> | 코드 위치 | `backend/app/adapters/real/` | 레포 바깥 (사내 AI 소유) |
>
> 두 작업의 유일한 접점: 본 잡이 채운 `lot_status`를 `RealLotRepository`의 캐시 fallback이 읽는다.
> 근거 설계: `docs/backend.md` §4.3 / §7. 본 문서는 거기 흩어진 CONTRACT-1~4를 실행 가능한 한 장으로 모은 것이다.

---

## 0. 한 줄 요약

30분마다 사내 lot 데이터를 읽어 `lot_status`(lot별 현재 상태)를 upsert하고, **매 실행 끝에** `lot_dump_meta.last_run_at`를 `now()`로 갱신한다. Pholex는 이 잡을 트리거하지 않고 **결과 테이블을 읽기만** 한다 (push/콜백 결합 없음).

---

## 1. 잡 경계 (반드시 지킬 것)

| 항목 | 규약 |
|------|------|
| 소유 | 사내 AI. 코드는 Pholex 레포 **바깥**. |
| 스케줄 | 사내 스케줄러(cron 등) **30분 주기**. |
| writer 권한 | `lot_status`, `lot_dump_meta` 두 테이블의 **유일한 writer**는 이 잡이다. Pholex 앱은 이 두 테이블에 쓰지 않는다. |
| reader | Pholex 앱이 두 테이블을 **읽기만** 한다. |
| 결합 | Pholex로 push/콜백 **금지**. Pholex는 `lot_dump_meta.last_run_at`을 폴링해 신선도를 추론한다. |
| 트랜잭션 | 한 번의 dump 실행은 **하나의 논리 단위**다. `lot_status` 적재가 부분 성공한 채 `last_run_at`만 갱신하면 안 된다 (§4 참조). |

---

## 2. 출력 테이블 — DDL은 Pholex가 소유

두 테이블의 **스키마(컬럼명·타입·제약)는 Pholex가 소유**한다 (`docs/backend.md` §4.2, Pholex alembic 마이그레이션으로 생성). 사내 dump 잡은 **이미 존재하는 테이블에 데이터만 적재**한다. 컬럼을 임의로 추가·변경·삭제하지 않는다. 스키마 변경이 필요하면 §6 절차로 협상한다.

```sql
-- 적재 대상 1: lot별 현재 상태 (lot_id가 PK)
CREATE TABLE lot_status (
    lot_id VARCHAR(100) PRIMARY KEY,
    status VARCHAR(32) NOT NULL,      -- raw lot_status_seg 값 그대로 (매핑·변환 금지)
    equipment VARCHAR(100),
    process_step VARCHAR(100),
    hold_comment TEXT,
    hold_operator_id VARCHAR(50),     -- 사내 dump 컬럼 lot_hold_user_id 그대로 (CONTRACT-1)
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- 적재 대상 2: dump 생존 heartbeat (행 1개 고정, id=1)
CREATE TABLE lot_dump_meta (
    id          INT PRIMARY KEY DEFAULT 1,
    last_run_at TIMESTAMPTZ NOT NULL,   -- 매 dump 실행 끝에 now()로 upsert (lot 변경 유무와 무관)
    row_count   INT,                    -- (옵션) 이번 dump가 처리한 lot 수
    status      VARCHAR(20) DEFAULT 'ok'-- (옵션) ok | partial | error
);
```

---

## 3. `lot_status` 적재 규약

### 3.1 컬럼 매핑 (CONTRACT-1, CONTRACT-3)

reference 구현 `backend/app/adapters/fake/pg_lot_source.py`의 `_to_dto`와 **동일한 변환 규칙**을 따른다.

| `lot_status` 컬럼 | 사내 소스 컬럼 (예시) | 변환 규칙 | 필수 |
|------|------|------|:--:|
| `lot_id` | `lot_id` | 그대로 | ✅ |
| `status` | `lot_status_seg` | **raw 값 그대로** 적재. canonical 매핑(`run`/`wait`/`hold`) **금지** — unknown 값 위조 방지 | ✅ |
| `equipment` | `eqp_type` | 그대로 (NULL 허용) | |
| `process_step` | `step_name` | 그대로 (NULL 허용) | |
| `hold_comment` | `lot_hold_comment` | 그대로 (NULL 허용) | |
| `hold_operator_id` | `lot_hold_user_id` | **VARCHAR 문자열 그대로** 적재. BIGINT 캐스팅 **금지** (leading zero 손실·타입 불일치). NULL 약 35% 정상 | ✅ |
| `updated_at` | `last_update_date` | naive면 **KST로 localize → UTC 변환** 후 적재 (사내 소스가 UTC면 그대로). lot의 마지막 변경 시각이지 dump 실행 시각이 아니다 | ✅ |

> **CONTRACT-1 (확정)**: `hold_operator_id`는 `users.employee_number`(VARCHAR(50))와 **조인되는 키**다. 둘이 문자열 비교로 매칭되어야 슬롯[1] "내 lot hold" fallback이 동작한다. 예: `'23053056'`. BIGINT로 적재하면 `'00012'` 같은 사번의 leading zero가 깨져 조인이 실패한다.

### 3.2 upsert 문 (멱등)

```sql
INSERT INTO lot_status
    (lot_id, status, equipment, process_step, hold_comment, hold_operator_id, updated_at)
VALUES (...)
ON CONFLICT (lot_id) DO UPDATE SET
    status           = EXCLUDED.status,
    equipment        = EXCLUDED.equipment,
    process_step     = EXCLUDED.process_step,
    hold_comment     = EXCLUDED.hold_comment,
    hold_operator_id = EXCLUDED.hold_operator_id,
    updated_at       = EXCLUDED.updated_at;
```

- 같은 dump를 두 번 돌려도 결과가 동일해야 한다 (멱등).
- `status` 컬럼셋은 CONTRACT-3에 고정: `lot_id, status, equipment, process_step, hold_comment, hold_operator_id, updated_at`. 이 외 컬럼을 dump가 추가로 쓰지 않는다.

### 3.3 삭제된 lot 처리 (정책 결정 필요 — §6)

사내 소스에서 사라진 lot을 `lot_status`에서도 지울지(hard delete) 남길지(stale로 유지)는 **현재 미결**이다. MVP 기본값은 **남김**(과거 행 유지) — 슬롯[2] watchlist가 `found=false`로 표시할 수 있어야 하므로. 변경 시 §6 협상.

---

## 4. `lot_dump_meta` 적재 규약 (CONTRACT-4) — 가장 중요

```sql
INSERT INTO lot_dump_meta (id, last_run_at, row_count, status)
VALUES (1, now(), :row_count, :status)
ON CONFLICT (id) DO UPDATE SET
    last_run_at = EXCLUDED.last_run_at,
    row_count   = EXCLUDED.row_count,
    status      = EXCLUDED.status;
```

- **매 dump 실행이 끝날 때마다** `last_run_at = now()`로 upsert한다. **lot 변경이 0건이어도 반드시 갱신**한다.
- 이유: Pholex는 `lot_status` 행의 `updated_at`으로 dump 생존을 추론하지 **않는다**. 변동 없는 lot은 `updated_at`이 정상적으로 오래되기 때문이다. `lot_dump_meta.last_run_at`이 dump가 살아있다는 **유일한 신호**다.
- `last_run_at`이 갱신되지 않으면 Pholex는 데이터가 신선해도 화면에 🔴(stale/down)을 띄운다. 즉 이 한 줄을 빠뜨리면 정상 데이터가 죽은 것처럼 보인다.

### 4.1 Pholex의 신선도 판정 (이 잡이 영향을 주는 소비측)

| Pholex `health` | 조건 | 화면 |
|------|------|:--:|
| `cache` | `last_run_at` ≤ 30분 | 🟡 |
| `stale`/`down` | `last_run_at`이 dump 주기 2배(≈60분) 초과 | 🔴 |

> `live`(🟢)는 실시간 `LotSource` 성공 시이며 본 dump 잡과 무관하다.

---

## 5. 실패·원자성 정책

| 상황 | 규약 |
|------|------|
| 정상 완료 | `lot_status` 전량 upsert → `lot_dump_meta`(`status='ok'`, `last_run_at=now()`) |
| 부분 실패 | 가능하면 `status='partial'`로 표시하고 `last_run_at` 갱신. 어느 lot이 누락됐는지 로깅 |
| 완전 실패 | `last_run_at`을 갱신하지 **않는다** → Pholex가 자동으로 🔴 stale 판정 (이게 의도된 신호) |
| 동시 실행 | 사내 스케줄러가 이전 실행과 겹치지 않게 보장(잡 lock). 두 dump가 동시에 `lot_status`를 쓰지 않도록 |

---

## 6. 미결 / 협상 항목

사내 AI가 결정·확인 후 본 문서 또는 PR 코멘트에 기록한다.

| ID | 내용 | 상태 |
|----|------|------|
| CONTRACT-2 | `lot_id` 형식(자릿수·접두어 패턴). 슬롯[2] 클라이언트 형식 검증에 필요 | **사내가 채울 빈칸** |
| DEL-POLICY | §3.3 삭제된 lot 처리 (hard delete vs stale 유지) | MVP 기본 "유지", 변경 시 협상 |
| TZ | 사내 `last_update_date`의 실제 timezone (KST naive 가정이 맞는지) | 확인 필요 |
| DDL 소유 | `lot_status`·`lot_dump_meta` DDL을 Pholex alembic이 생성하는지 확정 | §2 가정 — 확인 필요 |

스키마 변경(컬럼 추가 등)이 필요하면: 사내 AI 발견 사항 기록 → Pholex가 DDL/마이그레이션 + 읽기 코드 수정 → 사내 dump 매핑 갱신. (`adapter-spec.md` §10과 동일 패턴.)

---

## 7. dev 검증 — GOLDEN_DATASET 동치 시드

사내 dev DB에 아래 fixture를 시드해 dump 결과를 검증한다. 행 상세는 `backend/app/adapters/fake/golden_dataset.py`.

```
employee 99999 → 3 holds: LOT-A2948, LOT-B1175, LOT-C3320  (status="Hold")
employee 88888 → 1 hold:  LOT-X9999                         (cross-contamination 검증용)
```

검증 포인트:
- `lot_status`에 4행이 위 컬럼 매핑대로 적재됐는가
- `hold_operator_id`가 `'99999'`/`'88888'` **문자열**로 들어갔는가 (BIGINT 아님)
- dump 실행 직후 `lot_dump_meta.last_run_at`이 갱신됐는가
- Pholex에서 `99999`로 로그인 시 3건만, `88888` hold가 섞이지 않는가

---

## 8. 사내 AI 체크리스트

- [ ] 사내 lot 소스 → `lot_status` 컬럼 매핑 구현 (§3.1 표)
- [ ] `status` raw 그대로 적재 (canonical 매핑 금지)
- [ ] `hold_operator_id` ← `lot_hold_user_id` VARCHAR 그대로 (BIGINT 캐스팅 금지)
- [ ] `updated_at` timezone 변환 (§3.1, reference `_to_dto`)
- [ ] `ON CONFLICT (lot_id)` upsert (멱등)
- [ ] **매 실행 끝 `lot_dump_meta.last_run_at = now()` upsert (변경 0건이어도)**
- [ ] 사내 스케줄러에 30분 주기 등록 + 동시 실행 lock
- [ ] dev DB에 GOLDEN_DATASET 동치 시드 + §7 검증
- [ ] §6 미결 항목(CONTRACT-2, TZ, DDL 소유) 확인·회신
