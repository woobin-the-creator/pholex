# 사내 AI 작업 지시 — "내 관심 랏" watchlist real adapter + 30분 dump 잡

> 작성: 외부 AI (Claude Code) · 2026-06-06
> 대상: 사내 AI (Real adapter 담당)
> 선행 문서: `260527-1318-handoff-to-internal-ai.md`(진입점), `260529-1500-mirror-pg-sample-source-to-real.md`(LotSource 미러링)
> 설계 근거: `docs/backend.md` §4.2~4.3, `docs/watchlist-final-design.html`, `history/decisions.html`(2026-06-06 항목)
> 성격: **신규 기능 real adapter + 운영 dump 잡** — 외부 repo `fake/`에 검증된 reference(75 tests green)가 있습니다.

---

## 0. 이 문서를 읽는 법

- 외부 AI가 슬롯[2] **"내 관심 랏"**(유저가 lot_id를 수동 등록·저장하는 watchlist) 백엔드를 **TDD로 구현 완료**했습니다 (포트 + fake + usecase + api, 전체 75 tests green).
- 당신 할 일은 **새 설계가 아니라**: ① fake를 real로 복제, ② 사내 dump 잡 작성, ③ 계약 4건 매칭 확인.
- 보호 디렉터리(`domain/`, `usecases/`, `api/`, `ports/`, `di/`, `config/`, `adapters/fake/`)는 **건드리지 마세요.** 전부 외부 AI 정본입니다.
- 당신이 만질 곳: `adapters/real/`, 사내 dump 잡(레포 바깥 또는 사내 운영 코드), 사내 DB 마이그레이션.

---

## 1. 배경 — 데이터 플로우 변경

기존 슬롯[1] "내 lot hold"(실시간 hold 자동조회)는 **유지**합니다. 이번에 추가되는 것:

- **슬롯[2] "내 관심 랏"**: 유저가 lot_id를 직접 입력·저장 → 그 lot들의 status/step을 `lot_status`에서 읽어 표시.
- **`lot_status`를 30분 dump 마스터 캐시로** 사용 (bigdataquery → `lot_status` + `lot_dump_meta`). 슬롯[1] fallback + 슬롯[2] 공용 소스.
- 자세한 데이터 흐름·신호등·신선도 설계는 `docs/backend.md §4.3` 참조.

---

## 2. 구현 ① — `real/lot_watchlist_repository.py` (신규)

외부 repo의 reference: `app/adapters/fake/lot_watchlist_repository.py`, 포트 정본: `app/ports/lot_watchlist_repository.py`.

**포트 시그니처 (정본 — 이대로 구현):**

```python
class RealLotWatchlistRepository:
    async def save(self, employee_number: str, lot_ids: list[str]) -> None: ...
    async def get(self, employee_number: str) -> list[str]: ...
```

**`save` — 전체 교체(set semantics):**

```sql
-- 단일 트랜잭션. 받은 lot_ids를 입력 순서(index)대로 재삽입.
DELETE FROM user_lots WHERE employee_number = :employee_number;
INSERT INTO user_lots (employee_number, lot_id, order_index)
VALUES (:employee_number, :lot_id, :idx);   -- lot_ids enumerate 순서대로 idx=0,1,2,…
```

- 정규화(공백 trim·중복 제거)는 **usecase(`SaveWatchlist`)가 이미 처리**합니다. 당신은 받은 리스트를 **순서 그대로** 저장만 하세요.
- 빈 리스트면 DELETE만 수행(watchlist 비우기 = 정상).
- 원자성: `DELETE`+`INSERT`를 한 트랜잭션으로. (외부 정본 usecase가 `UnitOfWork`로 감쌉니다. real `LotRepository.unit_of_work()`가 세션을 주면 그 세션을 공유하세요 — `di/container.py:77-91` 참조.)

**`get` — order_index 순서 반환:**

```sql
SELECT lot_id FROM user_lots
WHERE employee_number = :employee_number
ORDER BY order_index ASC;
```

`user_lots` 스키마는 `docs/backend.md §4.2` (employee_number VARCHAR(50), lot_id VARCHAR(100), order_index INT NOT NULL, team_id 예약 NULL).

---

## 3. 구현 ② — `LotRepository.get_lots_by_ids` real 구현 (신규 메서드)

포트 `app/ports/lot_repository.py`에 **새 메서드가 추가**됐습니다. fake reference: `app/adapters/fake/lot_repository.py`.

```python
async def get_lots_by_ids(self, lot_ids: list[str]) -> dict[str, LotRowDTO]:
    # 캐시(lot_status)에 존재하는 것만 {lot_id: LotRowDTO}. 없는 lot_id는 결과에서 빠짐.
```

### 테이블/컬럼명 경계 — 구조는 **(A) 캐노니컬 `lot_status`로 확정** (외부 AI 결정)

위 SQL의 `lot_status` / `status` / `hold_operator_id`는 **Pholex 캐노니컬 이름**이며, 사내 raw 소스(`sample` / `lot_status_seg` / `lot_hold_user_id` …)와 다르다. **구조는 (A)로 확정한다 — 이건 설계 결정이지 네가 고를 선택지가 아니다:**

- **(A) 캐노니컬 `lot_status` 테이블**: 너는 alembic으로 `docs/backend.md §4.2`의 `lot_status`를 **Pholex Postgres**에 생성하고, 30분 dump가 적재한다(item ④). `get_lots_by_ids`는 위 SQL **그대로 캐노니컬 이름으로** 읽는다. raw 컬럼명은 dump 내부에서만 등장.

> ⚠️ **status 값 정정 (2026-06-09 — 직전 지시 철회)**: 캐노니컬인 건 **컬럼/테이블 *이름*뿐**이다. **`status` *값*은 매핑하지 말고 `lot_status_seg` raw 값을 그대로 적재해라** (`Active`/`Hold`/`PreActive` + 미래 값). `Active→run` 류 변환·`_map_status_to_canonical`·`unknown→wait` 폴백 **전부 폐기**한다 — raw enum이 열려있어 매핑하면 새 값이 위조된다. 따라서 `lot_status.status`는 **`VARCHAR(32)`, CHECK 제약 없음**(closed CHECK면 새 값 INSERT가 거부됨). 슬롯[1] hold 필터만 raw 앵커 `'Hold'`로 닫는다.
- 결정 근거: `LotRepository`는 Pholex Postgres(캐노니컬 저장소)에 붙는다(정본 docstring). 슬롯[1] fallback과 슬롯[2]가 같은 캐노니컬 캐시를 공유하고, raw→canonical 매핑이 한 곳(dump)에 모인다. raw 직접 읽기는 이 패턴과 모순.

**네가 줘야 할 건 '구조 선택'이 아니라 '사내 사실'이다** (외부 AI가 못 보는 정보 — 아래 §5 계약):
- dump가 읽을 **실제 사내 원본 테이블명 + raw 컬럼명** (raw→canonical 매핑표 작성용).
- lot_id 형식, bigdataquery가 7개 캐노니컬 컬럼을 만들 수 있는지.

**(A)가 사내 제약상 물리적으로 불가능하면**(예: Pholex Postgres에 dump가 쓸 수 없음) — 그 **사실만 보고**해라. 대안 구조를 임의로 택하지 말 것. 그 경우 외부 AI가 재설계한다.

```sql
SELECT lot_id, status, equipment, process_step, hold_comment, updated_at, hold_operator_id
FROM lot_status
WHERE lot_id = ANY(:lot_ids);
```

- 결과를 `{lot_id: LotRowDTO}` dict로. 없는 lot_id는 넣지 마세요 (usecase가 "조회 대기"로 표시).
- `is_held_by_me`는 watchlist 표시엔 안 쓰이지만, `LotRowDTO`가 요구하면 `hold_operator_id == 조회자 사번`으로 채우거나 False로 두세요(슬롯[2]는 이 필드 무시).
- **timezone**: `updated_at`이 naive면 `260529-1500` 문서 3번의 KST→UTC 규칙을 동일 적용.

---

## 4. 구현 ③ — bigdataquery → `lot_status` + `lot_dump_meta` 30분 dump 잡 (레포 바깥)

**이건 pholex 레포 코드가 아니라 사내 운영 스케줄러/잡입니다.** 외부 AI는 이 코드를 못 봅니다. **(A) 구조라면 raw→canonical 매핑이 여기서 일어납니다** — 즉 사내 실제 테이블/컬럼명은 dump의 READ 쪽에, Pholex 캐노니컬 이름은 WRITE(`lot_status`) 쪽에. 30분 주기로:

1. bigdataquery(사내 전용 lib)로 lot 정보 조회(**실제 raw 컬럼명**) → 컬럼 *이름*만 캐노니컬로 매핑하고 **`status` 값은 `lot_status_seg` raw 그대로**(매핑·변환 없음) → `lot_status`에 `INSERT … ON CONFLICT (lot_id) DO UPDATE`. (추가 보고: `SELECT DISTINCT lot_status_seg`로 현재 status 전수값 — 프론트 색 레지스트리용, 검증·제한용 아님)
2. **매 실행 끝에** `lot_dump_meta` 1행 갱신:
   ```sql
   INSERT INTO lot_dump_meta (id, last_run_at, row_count, status)
   VALUES (1, NOW(), :n, 'ok')
   ON CONFLICT (id) DO UPDATE SET last_run_at = NOW(), row_count = :n, status = 'ok';
   ```
   - **lot 변경 유무와 무관하게 무조건** 갱신해야 합니다 (이게 dump 생존 heartbeat = 신선도 판정 소스).

`lot_status`/`lot_dump_meta`/`user_lots` DDL은 `docs/backend.md §4.2`에 권위 정의가 있습니다. 사내 alembic 마이그레이션에 반영하세요.

---

## 5. 🔴 계약 4건 — 확인/매칭 필요

| ID | 내용 | 현재 상태 |
|----|------|----------|
| **CONTRACT-1** | `lot_status.hold_operator_id` 실제 컬럼명 + 값=사번 | `260529-1500` 문서에서 사내 sample 컬럼이 **`lot_hold_user_id`(varchar 40)** 로 확인됨. **dump가 `lot_status`에 적재 시 이 값을 `hold_operator_id`(또는 합의된 컬럼)에 사번으로 넣는지 확인.** 도메인은 문자열 사번 기준. |
| **CONTRACT-2** | `lot_id` 형식(자릿수/접두어 패턴) | **[답변 필요]** lot_id에 고정 형식 있나요? 있으면 프론트 입력 검증에 씁니다. |
| **CONTRACT-3** | `lot_status` dump 컬럼셋 | lot_id, **status(=lot_status_seg raw 그대로, 매핑 금지)**, equipment, process_step, hold_comment, updated_at, hold_operator_id(VARCHAR(50)). **컬럼 이름만 매핑, status 값은 raw verbatim.** |
| **CONTRACT-4** | `lot_dump_meta.last_run_at` 매 실행 upsert | 위 4번. **lot 변경 없어도 매번 갱신** — 이게 핵심. |

---

## 6. 검증 — Contract test (CI 게이트)

외부 repo는 fake로 contract/usecase/api 20개 + 전체 75개 green입니다. 당신은 사내 dev DB로:

1. `tests/contract/conftest.py`의 `lot_watchlist_repository` fixture에 `"real"` param 추가:
   ```python
   if request.param == "real":
       from app.adapters.real.lot_watchlist_repository import RealLotWatchlistRepository
       return RealLotWatchlistRepository()
   ```
2. `pytest tests/contract/test_lot_watchlist_repository_contract.py` → **real param 5개 전부 통과**.
   - 핵심: `test_save_and_get_preserves_order`(순서), `test_save_is_full_replace`(전체교체), `test_isolated_per_employee`(사번 격리).
3. `get_lots_by_ids`는 `test_lot_repository_contract.py`에 real param 추가 후 통과 확인.

---

## 7. 보고 양식

```
[사실] dump가 읽을 실제 사내 원본 테이블명 + raw 컬럼명: ___ (raw→canonical 매핑표)
[사실] (A) 구조가 사내 제약상 불가능한가: (no가 정상 / yes면 사유 = fact)
[②] real/lot_watchlist_repository.py save/get 전문: (붙여넣기)
[②] save가 DELETE+INSERT 단일 트랜잭션인가: (yes/no)
[③] get_lots_by_ids 최종 SQL: (붙여넣기 — 캐노니컬 lot_status 기준)
[④] dump 잡: lot_dump_meta를 매 실행 무조건 upsert 하는가: (yes/no) + 잡 스케줄(30분) 확인
[C-1] lot_status.hold_operator_id에 사번이 들어가는 실제 컬럼명: ___
[C-2] lot_id 형식: ___ (없으면 '없음')
[C-3] bigdataquery → lot_status 컬럼 매핑 표: (붙여넣기)
[검증] pytest tests/contract/test_lot_watchlist_repository_contract.py (real param 전부 pass)
[보호] git diff --stat origin/main -- backend/app/{domain,usecases,api,ports,di,config,adapters/fake}: (빈 출력이어야 정상)
```

---

## 8. 한 줄 요약

> `fake/lot_watchlist_repository.py`를 `real/`로 복제(save=DELETE+INSERT 전체교체, get=ORDER BY order_index), `LotRepository.get_lots_by_ids`를 `WHERE lot_id = ANY(:ids)`로 추가, 그리고 **30분 dump 잡이 `lot_dump_meta.last_run_at`을 매 실행 무조건 갱신**하게 하세요. **구조는 (A) 캐노니컬 `lot_status`로 외부 AI가 확정** — 너는 구조를 고르지 말고, dump의 raw→canonical 매핑에 쓸 **실제 사내 원본 테이블/컬럼명**(+ lot_id 형식)만 사실로 보고해라. (A)가 물리적으로 불가능하면 그 사유만 보고. contract test의 real param이 통과하면 끝입니다.
