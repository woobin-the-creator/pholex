# 사내 AI 작업 지시 — fake/PgSampleLotSource를 real/ 로 미러링

> 작성: 외부 AI (Claude Code) · 2026-05-29
> 대상: 사내 AI (Real adapter 담당)
> 선행 문서: `260528-1000-fix-500-504-real-adapter.md`, `260528-1400-followup-real-adapter-verification.md`
> 성격: **코드 미러링 지시** — 외부 repo `fake/`에 검증된 reference 구현이 있습니다. 그대로 `real/`에 복제하세요.

---

## 0. 이 문서를 읽는 법

- 외부 AI가 로컬 Postgres에 20k mock을 띄우고, 그걸 읽는 `PgSampleLotSource`를 `fake/`에 작성해 **contract test로 검증 완료**했습니다.
- 당신 할 일은 **새 설계가 아니라 복제**입니다. `fake/pg_lot_source.py`를 읽고 `real/lot_source.py`에 같은 구조로 옮기세요.
- 이 reference에는 사내 현재 구현의 **두 가지 버그가 이미 수정**되어 있습니다 (아래 2번). 복제하면 자동으로 고쳐집니다.
- 보호 디렉터리(`domain/`, `usecases/`, `api/`, `ports/`)는 **건드리지 마세요.**

---

## 1. 배경 — 왜 이 작업인가

직전까지 확인된 사내 상태:
- `fetch_my_holds`가 `sample` 테이블을 읽음 ✅
- `lot_status_seg` raw 값은 `Active` / `Hold` / `PreActive` 3개
- **owner 필터 없음** → 전체 hold 반환 = "내 hold인데 전체가 나온다" + 504 과부하의 출발점 🔴
- canonical 매핑에 일부 raw 값 누락 → unknown→`wait` 오분류 위험 🔴

외부 AI는 이 둘을 고친 **정답 reference**를 `fake/`에 만들었습니다. 이제 그걸 `real/`에 옮기면 됩니다.

---

## 2. 반드시 반영할 두 가지 수정 (이게 핵심)

### 2-1. owner 필터 추가 🔴

`fetch_my_holds(employee_number)`의 SQL에 **사번 조건을 반드시 추가**하세요:

```sql
SELECT lot_id, lot_status_seg, eqp_type, step_name,
       lot_hold_comment, last_update_date, lot_hold_user_id
FROM sample
WHERE lot_status_seg = 'Hold'
  AND lot_hold_user_id = :employee_number   -- ← 이 줄이 빠져 있었음. 반드시 추가
ORDER BY lot_id ASC
```

- `lot_hold_user_id`(varchar 40)가 hold 명령 유저 사번 컬럼입니다.
- 이게 없으면 contract 위반입니다 (`ports/lot_source.py:24-29`: "주어진 사번의 hold 전부", "모든 row `is_held_by_me=True`").
- `LIMIT`은 안전 cap으로 남겨도 되지만, owner 필터가 있으면 1인당 hold는 소수라 100/504 문제가 사라집니다.

### 2-2. canonical 매핑 3개 값 전부 명시 🔴

```python
_STATUS_MAP = {
    "Active": "run",
    "Hold": "hold",
    "PreActive": "wait",
}

def _map_status_to_canonical(raw: str) -> str:
    canonical = _STATUS_MAP.get(raw)
    if canonical is None:
        logger.warning("unknown lot_status_seg=%r → defaulting to 'wait'", raw)
        return "wait"
    return canonical
```

- 세 값을 다 명시해야 `Active`가 `wait`로 오분류되지 않습니다.
- unknown은 `wait`로 떨어뜨리되 **반드시 로그**를 남겨 새 enum 등장을 탐지하세요.

---

## 3. ⚠️ 당신이 결정/확인해야 할 것 — timezone

`sample.last_update_date`는 **naive timestamp**(timezone 정보 없음)입니다. `LotRowDTO.updated_at`은 **tz-aware를 강제**합니다 (`ports/dto.py:15-20`). 그래서 adapter가 tz를 붙여야 합니다.

- 외부 AI의 reference는 **naive 값을 KST wall-clock으로 간주하고 UTC로 변환**합니다:
  ```python
  from zoneinfo import ZoneInfo
  _KST = ZoneInfo("Asia/Seoul")
  if last_update.tzinfo is None:
      last_update = last_update.replace(tzinfo=_KST)
  updated_at_utc = last_update.astimezone(timezone.utc)
  ```
- 당신의 현재 구현은 그냥 `.replace(tzinfo=utc)`로 **force-UTC** 한다고 보고했습니다.
- **두 방식은 9시간 차이가 납니다.** 사내 `last_update_date`에 들어가는 값이:
  - **KST 벽시계 시각**이면 → 외부 AI 방식(KST→UTC)이 맞고, 당신의 force-UTC는 +9h 버그입니다.
  - 이미 **UTC**면 → force-UTC가 맞습니다.

**[답변]** 사내 source가 `last_update_date`에 KST를 넣나요, UTC를 넣나요? 모르면 원본 1~2행의 시각과 실제 사건 발생 시각(벽시계)을 비교해서 알려주세요. 그 답에 따라 둘 중 하나로 통일합니다.

---

## 4. 파일별 미러링 가이드

외부 repo `fake/`의 reference → 당신의 `real/`:

| fake/ (reference, 읽기) | real/ (당신이 작성) | 비고 |
|---|---|---|
| `fake/pg_engine.py` | `real/_engine.py` | engine **singleton** (lru_cache). 요청마다 `create_async_engine` 금지 (S2 504 원인). 이미 만들었다면 동일 패턴인지 확인 |
| `fake/pg_lot_source.py` | `real/lot_source.py` 의 `RealLotSource` | `fetch_my_holds`에 2-1 owner 필터 + 2-2 매핑 + 3번 tz 반영 |
| `fake/pg_schema.py` | (사내 sample은 이미 존재) | 컬럼명만 일치하면 됨: lot_id, lot_status_seg, eqp_type, step_name, lot_hold_comment, last_update_date, lot_hold_user_id |

> `fake/pg_lot_source.py` 전문을 그대로 읽고 메서드 구조(특히 `fetch_my_holds`, `_to_dto`, `_map_status_to_canonical`)를 복제하세요. column 매핑은 동일합니다.

`_to_dto` 매핑 (sample 컬럼 → LotRowDTO):

| sample 컬럼 | LotRowDTO 필드 |
|---|---|
| `lot_id` | `lot_id` |
| `lot_status_seg` | `status` (canonical 매핑 거쳐서) |
| `eqp_type` | `equipment` |
| `step_name` | `process_step` |
| `lot_hold_comment` | `hold_comment` |
| `last_update_date` | `updated_at` (tz 변환 거쳐서) |
| `lot_hold_user_id` | `is_held_by_me` 계산용 (`== employee_number`) |

---

## 5. 검증 — Contract test (CI 게이트)

외부 repo는 `PHOLEX_TEST_PG=1`로 fake를 Postgres mock에 물려 통과를 확인했습니다. 당신은 사내 dev DB로 같은 contract를 돌리세요.

1. `tests/contract/conftest.py`의 `ADAPTER_PARAMS`에 `"real"` 추가하고 fixture 작성:
   ```python
   if request.param == "real":
       from app.adapters.real.lot_source import RealLotSource
       return RealLotSource()
   ```
2. **golden dataset을 사내 dev DB의 `sample` 테이블에 seed**하세요 (`fake/golden_dataset.py`의 4행을 raw 형태로 — `lot_status_seg='Hold'`, `lot_hold_user_id`=사번). 외부 AI의 `scripts/seed_sample_mock.py`의 `_golden_rows()`가 변환 예시입니다.
3. `pytest tests/contract/test_lot_source_contract.py` 실행 → **`real` param이 전부 통과**해야 합니다.

핵심 oracle (`test_golden_oracle_exact_counts`):
```
fetch_my_holds("99999") == 정확히 3건
fetch_my_holds("88888") == 정확히 1건
```
→ owner 필터가 없으면 전체 hold가 나와서 이 테스트가 **반드시 깨집니다.** 통과 = 필터 정상.

---

## 6. 보고 양식

```
[2-1] owner 필터 추가했나: (yes/no) + 최종 WHERE 절
[2-2] _STATUS_MAP 3개 값 다 명시했나: (yes/no)
[3]   last_update_date는 KST냐 UTC냐: ___ → 채택한 변환 방식: ___
[4]   real/lot_source.py fetch_my_holds 전문: (붙여넣기)
[5]   contract test 결과: (real param 출력 — 전부 pass 여야 함)
[보호] git diff --stat origin/main -- backend/app/{domain,usecases,api,ports}: (빈 출력이어야 정상)
```

---

## 7. 한 줄 요약

> `fake/pg_lot_source.py`를 `real/lot_source.py`로 복제하세요. 두 가지만 확실히: **(1) `WHERE lot_hold_user_id = :employee_number` 추가**(원래 버그), **(2) `Active/Hold/PreActive` 3개 canonical 매핑 명시**. 그리고 **tz 한 가지 답**(KST냐 UTC냐) 주세요. golden seed 후 contract test의 `fetch_my_holds("99999")==3`이 통과하면 끝입니다.
