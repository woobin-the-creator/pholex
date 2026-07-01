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

> **알람 확장 (2026-06-22)**: dump가 upsert 전 스냅샷과 diff해 변경 이벤트를 `lot_change_event`에 **같은 트랜잭션**으로 적재하는 transactional outbox가 추가됐다. 이 부분 사양은 [`ai-prompts/260622-1253-alarm-outbox-lot-change-event.md`](../ai-prompts/260622-1253-alarm-outbox-lot-change-event.md) §3 참조. 본 문서의 §3·§4·§5(lot_status/lot_dump_meta upsert·원자성)는 그대로 유효하며, 거기에 이벤트 INSERT가 같은 BEGIN/COMMIT 안에 더해진다.

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
-- 적재 대상 1: lot별 현재 상태 (lot_id가 PK) — [Phase 2] hold는 lot_hold로 분리
CREATE TABLE lot_status (
    lot_id VARCHAR(100) PRIMARY KEY,
    status VARCHAR(32) NOT NULL,      -- raw lot_status_seg 값 그대로 (매핑·변환 금지)
    equipment VARCHAR(100),           -- [Phase 2] hold lot=stocker 적재 → NULL 정상 (소스 eqp_id_list 100% NULL)
    process_step VARCHAR(100),        -- 공정 스텝(step_desc) — 채운다
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- 적재 대상 1-b: lot별 hold 목록 (1:N) — [Phase 2 신규]
CREATE TABLE lot_hold (
    id BIGSERIAL PRIMARY KEY,              -- surrogate (자연키 불가: (lot_id,operator_ad_id) 비유일)
    lot_id VARCHAR(100) NOT NULL REFERENCES lot_status(lot_id) ON DELETE CASCADE,
    operator_ad_id VARCHAR(100) NOT NULL,  -- opertr_id의 '(' 앞부분 (AD id). users.email 로컬파트와 매칭 (CONTRACT-1)
    operator_name VARCHAR(100),            -- opertr_id 괄호 안 (한글 이름)
    item_type VARCHAR(50),                 -- USER/SPC/DEFECT/L·L 등 (표시용)
    issue_comment TEXT,
    issue_date TIMESTAMPTZ
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

### 3.1 컬럼 매핑 (CONTRACT-1, CONTRACT-3, CONTRACT-5) — [Phase 2]

소스 테이블은 `T_ISSUE_LOT`(가명, 같은 BDQ). **active hold만** 적재: `WHERE complt_date IS NULL AND catg_type = 'HOLD'` (실측상 100% 정확한 active 필터 — status_type과 0건 불일치). reference 구현은 `backend/app/adapters/fake/pg_lot_source.py`.

**소스는 1:N** — 한 lot이 여러 행으로 온다(콤마 아님, 행 분리). 한 행의 `opertr_id`에 담당자가 콤마로 여럿일 수 있어(active 약 3.5%, 499행) **행으로 explode**한다. `lot_id_list`는 콤마 없음(단일 lot).

**`lot_status` (lot당 1행, `lot_id`로 dedup):**

| `lot_status` 컬럼 | 소스 컬럼 | 변환 | 필수 |
|------|------|------|:--:|
| `lot_id` | `lot_id_list` | 그대로 (단일 lot) | ✅ |
| `status` | `status_type` | **raw 그대로** (매핑 금지). active만 담으므로 사실상 hold | ✅ |
| `equipment` | `eqp_id_list` | 100% NULL → 항상 NULL | |
| `process_step` | `step_desc` | 그대로 (공정 코드/명, 예 `PHOTO-01`) | |
| `updated_at` | `issue_date`(그 lot 최신) | naive면 **KST→UTC** | ✅ |

**`lot_hold` (explode된 hold당 1행):**

| `lot_hold` 컬럼 | 소스 | 변환 | 필수 |
|------|------|------|:--:|
| `lot_id` | `lot_id_list` | 그대로 (FK) | ✅ |
| `operator_ad_id` | `opertr_id` | 파싱 `split(',')`→`strip()`→`split('(')[0]` | ✅ |
| `operator_name` | `opertr_id` | 파싱 `split('(')[1]`의 `)` 제거 (없으면 NULL) | |
| `item_type` | `item_type` | 그대로 (표시용) | |
| `issue_comment` | `issue_comment` | 그대로 | |
| `issue_date` | `issue_date` | naive면 **KST→UTC** | |

**`opertr_id` 파싱 규칙 (CONTRACT-5):**
1. `opertr_id.split(',')` → 각 요소로 담당자 explode
2. 각 요소 `.strip()` (뒤 공백/콤마 제거)
3. `.split('(', 1)` → `[operator_ad_id, "이름)"]`
4. 이름은 `)` 제거. 괄호 없으면 `operator_ad_id`만, `operator_name=NULL`
5. 순수 숫자 `opertr_id`(약 0.14%, 25행)는 AD id 아님 → email 매칭 안 됨(알려진 손실, [gh #87]). 그대로 적재

> **CONTRACT-1 (개정)**: `lot_hold.operator_ad_id`는 `users.email`의 로컬파트(`split_part(email,'@',1)`, 예 `gd01.hong`)와 **문자열 매칭**되는 키다. 이 매칭으로 슬롯[1] "내 hold"가 동작한다. ⚠️전제(미검증): email 로컬파트 == `opertr_id`의 AD id 부분(`history/decisions.html` era 6 revisit — 사내 표본 대조 필요). 이전 사번(`lot_hold_user_id`) 매칭은 폐기.

### 3.2 upsert 문 (멱등)

```sql
-- (1) lot_status: lot당 1행 upsert
INSERT INTO lot_status
    (lot_id, status, equipment, process_step, updated_at)
VALUES (...)
ON CONFLICT (lot_id) DO UPDATE SET
    status       = EXCLUDED.status,
    equipment    = EXCLUDED.equipment,
    process_step = EXCLUDED.process_step,
    updated_at   = EXCLUDED.updated_at;

-- (2) lot_hold: surrogate PK(자연키 없음)라 ON CONFLICT 불가 → 같은 트랜잭션에서 재구성
DELETE FROM lot_hold WHERE lot_id = ANY(:active_lot_ids);   -- 이번 active 집합의 기존 hold 제거
INSERT INTO lot_hold
    (lot_id, operator_ad_id, operator_name, item_type, issue_comment, issue_date)
VALUES (...);                                                -- explode된 hold 행 전체 삽입
```

- 같은 dump를 두 번 돌려도 결과가 동일해야 한다 (멱등). `lot_hold`는 "해당 lot 삭제 후 재삽입"으로 멱등을 얻는다 (surrogate `id`는 재생성돼도 무방).
- **1·2는 한 트랜잭션**이어야 한다 — `lot_status`만 갱신되고 `lot_hold`가 옛 상태면 화면이 어긋난다.
- hold가 해제된 lot(이번 active 집합에서 빠짐)은 `lot_hold`에서 자동으로 사라진다(위 DELETE). `lot_status` 행 자체의 유지/삭제는 DEL-POLICY(§3.3) 따름.
- 컬럼셋은 CONTRACT-3에 고정: `lot_status` = lot_id, status, equipment, process_step, updated_at / `lot_hold` = lot_id, operator_ad_id, operator_name, item_type, issue_comment, issue_date. 이 외 컬럼을 dump가 쓰지 않는다.

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
AD id gd01.hong → LOT-A2948 2건(다른 item_type) + LOT-B1175 1건 = 3 holds  (뷰어)
AD id pk02.kim  → LOT-A2948 1건  (cross-contamination: gd01.hong 화면에 안 보여야)
AD id sk03.lee  → LOT-C3320 1건
```

검증 포인트:
- `lot_status`에 lot별 1행(LOT-A2948, LOT-B1175, LOT-C3320) — `equipment` NULL
- `lot_hold`에 explode된 hold 행, `operator_ad_id`가 AD id **문자열**(예 `'gd01.hong'`)
- 같은 lot(LOT-A2948)에 여러 담당자 행이 공존하는가 (1:N)
- dump 실행 직후 `lot_dump_meta.last_run_at`이 갱신됐는가
- Pholex에서 email `gd01.hong@...`로 로그인 시 LOT-A2948(2건)+LOT-B1175(1건)만, `pk02.kim`/`sk03.lee` hold가 안 섞이는가

---

## 8. 사내 AI 체크리스트

- [ ] **선행: Pholex alembic 마이그레이션(`lot_status` 컬럼 변경 + `lot_hold` 생성)이 사내 DB에 적용됐는지 확인** — 없으면 dump가 쓸 테이블이 없다
- [ ] 소스 `T_ISSUE_LOT` → `lot_status`+`lot_hold` 컬럼 매핑 구현 (§3.1 표)
- [ ] active 필터 `complt_date IS NULL AND catg_type='HOLD'`
- [ ] `status`(`status_type`) raw 그대로 적재 (canonical 매핑 금지)
- [ ] `opertr_id` 파싱 → `operator_ad_id`/`operator_name`, 콤마 담당자 explode (CONTRACT-5)
- [ ] **`operator_ad_id` == `users.email` 로컬파트 매칭 표본 대조 (CONTRACT-1 미검증 전제 — 안 맞으면 즉시 보고)**
- [ ] `updated_at`/`issue_date` timezone 변환 (§3.1)
- [ ] `lot_status` upsert + `lot_hold` DELETE-후-INSERT **한 트랜잭션** (멱등)
- [ ] **매 실행 끝 `lot_dump_meta.last_run_at = now()` upsert (변경 0건이어도)**
- [ ] 사내 스케줄러에 30분 주기 등록 + 동시 실행 lock
- [ ] dev DB에 GOLDEN_DATASET 동치 시드 + §7 검증
- [ ] §6 미결 항목(CONTRACT-2, TZ, DDL 소유) 확인·회신
