# 30분 dump 잡 + RealLotRepository 구현 킥오프 (사내 위임)

> **이 문서의 목적**: 30분 주기 dump 잡과 그 결과를 읽는 `RealLotRepository`를 사내가 구현하도록
> 지시하는 **진입점**이다. 상세 계약은 이미 레포에 있으므로 여기서 중복하지 않고 **정본을 가리킨다**.
> 작성: 2026-06-20. 작성자: 사외 AI(Claude). 수신: 사내 AI(opencode).

## 0. 왜 지금

- pholex **소비측 배관은 완료**됐다 (PR #45 머지, main). `dumpMeta`/`last_run_at`을 읽는
  포트·usecase·wire·프론트 신선도(🟡/🔴 + "마지막 갱신 MM:SS 전")가 모두 들어가 있다.
- 그러나 **공급측이 비어있다**: `backend/app/adapters/real/`은 README + 빈 `__init__`뿐이고,
  사내 dump 잡이 `lot_status`·`lot_dump_meta`를 실제로 채우는지 레포에서 확인 불가.
- 즉 **물탱크로 가는 수도관은 깔렸는데, 탱크를 채우는 펌프(dump)와 탱크에서 읽는 밸브
  (`RealLotRepository`)가 없다.** 이 둘을 사내가 구현하면 슬롯1 신선도가 실제로 동작한다.

## 1. 무엇을 구현하나 (두 갈래)

| # | 산출물 | 위치 | 정본(읽을 문서) |
|---|--------|------|----------------|
| A | **30분 dump 잡** — 사내 lot 데이터 → `lot_status` upsert + 매 실행 끝 `lot_dump_meta.last_run_at=now()` | pholex 레포 **바깥** (사내 소유) | **`docs/dump-job-spec.md`** ← 정본, 그대로 따른다 |
| B | **`RealLotRepository`** — 위 두 테이블을 **읽는** 어댑터 | `backend/app/adapters/real/lot_repository.py` (현재 없음) | `backend/app/ports/lot_repository.py` (포트) + `backend/app/adapters/fake/lot_repository.py` (reference) + `docs/adapter-spec.md` |

### 1.1 스코프 밖 (건드리지 말 것)

- **`RealLotSource`(실시간 API 어댑터)는 이번 스코프가 아니다.** 사내에도 실시간 lot API가
  아직 없음을 확인했고, 그래서 **dump를 primary로 확정**했다. `real/lot_source.py`는 비워 둔다.
  실시간 API가 생기면 그때 같은 `LotSource` 포트로 무변경 교체한다.
- Claude 소유 영역 수정 금지: `ports/` · `usecases/` · `api/` · `domain/` · `di/` · `config/` · `fake/`.
  `RealLotRepository`는 **기존 포트에 맞춰 구현만** 한다. 포트 시그니처가 불편해도 바꾸지 말고 §4로 보고.

## 2. A — 30분 dump 잡: `docs/dump-job-spec.md`가 정본

`dump-job-spec.md`를 처음부터 끝까지 따른다. 절대 어기면 안 되는 3가지만 다시 강조:

1. **`status`는 raw(`lot_status_seg`) 그대로** 적재. canonical(`run`/`wait`/`hold`) 매핑 금지.
2. **`hold_operator_id` ← `lot_hold_user_id` VARCHAR 문자열 그대로**. BIGINT 캐스팅 금지(사번 leading zero 손실 → 조인 실패).
3. **매 dump 실행 끝에 `lot_dump_meta.last_run_at = now()` upsert** — lot 변경이 0건이어도 반드시.
   이 한 줄을 빠뜨리면 데이터가 신선해도 pholex 화면이 🔴(stale)로 뜬다.

> ⚠️ **이 문서(6/20)가 `ai-prompts/260606-1609-watchlist-real-adapter.md`의 dump-잡 부분을 대체한다.**
> 6/6 문서는 PR #45 이전이라 `get_dump_last_run_at` 포트·`dumpMeta` DTO·health 타임스탬프
> 재정의가 빠져 있다. dump 잡과 신선도는 **`docs/dump-job-spec.md`를 정본으로** 따른다.

## 3. B — `RealLotRepository`: 포트의 메서드별 SQL

`backend/app/ports/lot_repository.py`의 8개 메서드를 모두 구현한다. fake 구현
(`backend/app/adapters/fake/lot_repository.py`)이 **동작 정본**이다 — 동일 의미를 SQL로 옮긴다.
포트 docstring에 이미 Real adapter용 SQL 골격이 적혀 있으니 그대로 따른다. 핵심만:

| 포트 메서드 | Real 구현 | 주의 |
|------------|-----------|------|
| `get_dump_last_run_at()` | `SELECT last_run_at FROM lot_dump_meta WHERE id=1` | **신선도 판정 단일 소스.** dump 미실행이면 `None`. `lot_status.updated_at`으로 추론하지 말 것. tz-aware UTC로 반환 |
| `get_my_holds_cached(emp)` | 사번별 hold 캐시 SELECT. **cache miss = `None`, 정상 빈 결과 = `[]`** 구분 필수 | 이 둘을 섞으면 슬롯1 fallback 로직이 깨진다 |
| `cache_my_holds` / `invalidate_cache` | 캐시 적재 / 무효화 | |
| `get_lots_by_ids(ids)` | `SELECT … WHERE lot_id = ANY(:ids)` → `{lot_id: DTO}`, 없는 id는 결과에서 누락 | 슬롯2 watchlist JOIN용 |
| `search(query, limit, offset)` | DNF 키워드 → `WHERE (g1 AND…) OR…` `ORDER BY updated_at DESC, lot_id ASC` `LIMIT/OFFSET` + 별도 `COUNT(*)` | lot_id dedup, 빈 쿼리는 `([],0)` |
| `upsert_lot` / `upsert_lots_batch` | 단건/배치 upsert (배치는 단일 트랜잭션, 전부 또는 전무) | |

> `get_dump_last_run_at`은 **PR #45에서 신규 추가된 메서드**다. 6/6 문서엔 없으니 빠뜨리지 말 것.

## 4. 결정론 규율 (값을 지어내지 말 것)

이 위임은 사내 DB 컬럼·timezone 같은 **외부 계약값**에 묶여 있다. 모호하면 **멈추고 묻는다**:

- `dump-job-spec.md §6` 미결 항목을 **추측으로 채우지 말 것**. 각각 사내 사실을 확인해 회신:
  - **CONTRACT-2**: `lot_id` 실제 형식(자릿수·접두어 패턴).
  - **TZ**: 사내 `last_update_date`의 실제 timezone (KST naive 가정이 맞는지). 틀리면 `updated_at`이 통째로 어긋난다.
  - **DDL 소유**: `lot_status`·`lot_dump_meta` 테이블을 pholex alembic이 생성하는 게 맞는지.
  - **DEL-POLICY**: 사라진 lot 처리 — MVP 기본 "유지", 바꿀 사유 있으면 보고.
- 사내 컬럼명이 `dump-job-spec.md §3.1`의 예시(`lot_status_seg`/`lot_hold_user_id` 등)와 **다르면**,
  임의 매핑하지 말고 실제 컬럼명을 회신에 명시한 뒤 매핑을 확정받는다.

## 5. 검증 — 텍스트 증거로 회신 (스크린샷 불가 환경)

`dump-job-spec.md §7`의 GOLDEN_DATASET 동치 시드로 검증하고, 아래를 **실제 출력**으로 회신:

1. dump 1회 실행 직후:
   `psql -c "SELECT id, last_run_at, row_count, status FROM lot_dump_meta WHERE id=1;"` 결과
2. `psql -c "SELECT lot_id, status, hold_operator_id, pg_typeof(hold_operator_id) FROM lot_status WHERE hold_operator_id IN ('99999','88888') ORDER BY lot_id;"`
   → 4행, `hold_operator_id`가 **문자열(varchar)**, 99999가 3건·88888이 1건인지
3. contract test: `pytest backend/tests/contract -k 'fake or real'` 전부 통과 출력
4. Claude 소유 영역 무변경 gate:
   `git diff origin/main -- backend/app/domain backend/app/usecases backend/app/api backend/app/ports backend/app/di backend/app/config backend/app/adapters/fake`
   → **빈 diff** 여야 한다. (출력 그대로 첨부)

## 6. 사내 AI 체크리스트

- [ ] A: `docs/dump-job-spec.md` §8 체크리스트 전 항목
- [ ] B: `RealLotRepository` 8개 메서드 구현 (특히 `get_dump_last_run_at`)
- [ ] cache miss(`None`) vs 빈 결과(`[]`) 구분 정확
- [ ] §4 미결 항목(CONTRACT-2 / TZ / DDL 소유 / DEL-POLICY) 확인·회신
- [ ] `RealLotSource`는 비워 둠(스코프 밖) — 손대지 않았는지 확인
- [ ] §5 검증 1~4 텍스트 증거 회신
