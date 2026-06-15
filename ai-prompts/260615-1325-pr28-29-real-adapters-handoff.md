# PR #28 + #29 — Real adapter 통합 위임 (키워드 Hold + 알람 박스)

## 이 프롬프트가 작성된 배경 (환경 차이)

이 문서는 GitHub 레포 코드만 접근 가능한 외부 AI(Claude Code)가 작성했습니다. 두 기능이 main에 머지됐고, **둘 다 운영(real)에서 동작하려면 사내 Real adapter 구현이 남아 있습니다.**

| PR | 머지 | 프론트/계약 | 운영에 필요한 사내 작업 |
|----|------|------------|------------------------|
| #29 알람 박스 | `90d0376` | WS `change`/`alert` 수신·적립 | `RealLotSource.subscribe_changes`(알람 스트림) + eventId/occurredAt |
| #28 키워드 Hold | `57aae2c` | 키워드 칩·DNF·검색·프리셋 UI | `RealKeywordPresetRepository` + `RealLotRepository.search` + alembic |

**왜 외부 AI가 못 하나 — 프로젝트 룰 (맥락 보강, 규율 5):**
- **`backend/app/adapters/real/`는 사내 AI 전용**이다. `real/README.md`: "Claude는 이 디렉터리를 비워 둡니다." **alembic 마이그레이션도 사내 몫**(같은 README "추가 책임"). 정본 사양은 [`docs/adapter-spec.md`](../docs/adapter-spec.md) — 사내는 거기 §0 시작 가이드부터.
- **DI 동적 로드 규약**(`app/di/container.py` `ADAPTER_NAMING`): `ADAPTER_MODE=real`이면 `app/adapters/real/{module}.py`의 `class Real{Suffix}`를 import. 규약 어기면 즉시 실패.
- **severity는 도메인(usecase)이 분류**(`stream_hold_changes.py`) → 어댑터는 severity를 채우지 않는다. (현재 info/critical만, warning 미생성.)
- `lot_status`는 pholex 자체 Postgres지만 **그 실제 스키마·접속·배포는 외부에 비노출** → real/ 작업은 사내에서만 가능.
- 각 Port의 **fake 어댑터**(`app/adapters/fake/*.py`)가 가장 단순한 참고 구현이다.

## 단일 기준 (source of truth) — 규율 1·2

유일한 기준은 **레포의 Port/DTO 계약**이다. 여기 맞춰라 — 사내 라이브러리의 편한 필드/컬럼에서 **역산하지 마라.**

| 항목 | 유일한 기준(레포) | 역산 금지 |
|------|------------------|-----------|
| 인터페이스 | `app/ports/{lot_source,lot_repository,keyword_preset_repository}.py` | 시그니처/반환 타입 변경 |
| 이벤트/행/프리셋 형태 | `app/ports/dto.py` (`LotChangeEventDTO`·`LotRowDTO`·`KeywordPresetDTO`) | DB 컬럼을 그대로 흘리기 |
| 파일/클래스명 | `ADAPTER_NAMING` (아래) | "편한" 다른 이름·위치 |
| 모드 env | `app/config.py` `ADAPTER_MODE`·`ADAPTER_REAL_MODULE_PREFIX` | 새 env 이름 발명 |
| DNF config | `domain.keyword` `query_to_config`/`query_from_config` 형식 | 임의 JSON 모양 |

ADAPTER_NAMING (이 작업 대상):
| Port | 파일 | 클래스 |
|------|------|--------|
| LotSource | `app/adapters/real/lot_source.py` | `RealLotSource` |
| LotRepository | `app/adapters/real/lot_repository.py` | `RealLotRepository` |
| KeywordPresetRepository | `app/adapters/real/keyword_preset_repository.py` | `RealKeywordPresetRepository` |

---

# 파트 A — #29 알람 스트림 (`RealLotSource.subscribe_changes`)

## 상황 (계약)
```python
# app/ports/lot_source.py
def subscribe_changes(self, employee_number: str) -> AsyncIterator[LotChangeEventDTO]:
    # 다중 구독자 fan-out / event_id unique+시간정렬 / previous_status·new_status 어댑터가 채움
# app/ports/dto.py — LotChangeEventDTO (frozen, extra=forbid)
#   lot_id, change_type("status"|"hold"|"comment"|"created"|"removed"),
#   previous_status, new_status, new_hold_comment, occurred_at(tz-aware 필수), event_id(unique+정렬)
```
이번 PR이 만든 프론트 의존성: `change`·`alert` **둘 다** `eventId`·`occurredAt`를 싣는다(`wire.py`). 프론트 알람 박스가 **eventId로 dedup**(재연결 중복 방지), **occurredAt로 정렬**. fake는 `event_id = str(ULID())`.

| 필드 | 어겼을 때 |
|------|-----------|
| `event_id` 매번 변함 | 재연결 시 중복 적립 |
| 서로 다른 변경에 같은 id | 알람 누락(dedup으로 삼켜짐) |
| `occurred_at` naive | DTO validator 실패 / 정렬 깨짐 |

## 해야 할 일 (결정 규칙)
실시간 변경 피드 **있으면 A**, 30분 dump뿐이면 **B**. 재구독 replay는 **C에서 택1·문서화**.
- **A 실시간 피드**: 피드→`LotChangeEventDTO` 매핑, fan-out. `event_id`는 안정·고유·정렬가능(같은 논리 변경=같은 id), `occurred_at` tz-aware.
- **B 30분 dump diff(유력)**: dump를 직전 스냅샷과 행 단위 diff → `created`/`removed`/`status`/`comment` 이벤트 합성. `event_id`는 **결정적 키**(예 `f"{dump_ts}:{lot_id}:{change_type}"`), `occurred_at`은 dump 시각/행 updated_at(tz-aware). 같은 사번 다중 구독자 fan-out(`InMemoryLotSource.emit` 패턴 참고).
- **C 재구독 replay**: (C-1) 최근 변경 재전송 → event_id 결정적이어야 프론트 dedup / (C-2) 구독 이후만 전송(replay 없음, disconnect 중 critical 누락 가능) — 택1 명시.
- **역산 금지**: dump 임의 컬럼을 event_id로 쓰지 말 것. **새 env 금지**.
- **stop-and-ask**: dump에 변경을 고유 식별할 컬럼/타임스탬프가 없으면 임의 키 만들지 말고 **가용 컬럼 목록과 함께 멈춰 보고**.

---

# 파트 B — #28 키워드 Hold (`RealKeywordPresetRepository` + `RealLotRepository.search` + alembic)

## 상황 (계약)

### B-1. 키워드 검색 — `LotRepository.search`
```python
# app/ports/lot_repository.py
async def search(self, query: KeywordQuery, *, limit: int, offset: int) -> tuple[list[LotRowDTO], int]:
    # 반환 (페이지 행, 총 매칭 건수). 정렬 updated_at DESC, 동률 lot_id ASC. lot_id dedup.
    # 빈 쿼리(그룹 0개) → ([], 0).
    # WHERE (그룹1 AND…) OR (그룹2 AND…) … ORDER BY updated_at DESC, lot_id ASC LIMIT/OFFSET + 별도 COUNT(*)
```
- 매칭 필드(`domain/keyword.py`): **substring·대소문자무시** = `equipment`/`process_step`/`hold_comment`/`lot_id` (TEXT_FIELDS). **exact** = `status` (EXACT_FIELDS — status는 열린 집합이라 substring이면 `Active`가 `PreActive` 오매칭).
- DNF: 그룹 안 AND, 그룹끼리 OR. **그룹 predicate를 개별 접근**으로 빌드(v2 행별 매칭 배지 보험).
- 소스: `lot_status`(30분 dump가 적재되는 pholex Postgres). `LotRowDTO`(lot_id/status/equipment/process_step/hold_comment/updated_at, raw status).

### B-2. 프리셋 저장 — `KeywordPresetRepository`
```python
# app/ports/keyword_preset_repository.py — Pholex Postgres keyword_presets
list_by_employee(emp) -> list[KeywordPresetDTO]      # created_at ASC, 없으면 []
get(emp, preset_id) -> KeywordPresetDTO | None        # 없거나 타 사번 소유면 None
create(emp, name, config, *, is_default) -> DTO       # is_default=True면 같은 사번 기존 default 해제
update(emp, preset_id, *, name, config, is_default) -> DTO  # 없거나 타 사번 소유면 KeyError. default 해제 규칙 동일
delete(emp, preset_id) -> None                        # 없거나 타 사번 소유면 조용히 무시(idempotent)
# KeywordPresetDTO: id:int, name:str, config:dict, is_default:bool, created_at:datetime|None
# config = DNF JSONB: {"groups":[{"conditions":[{"field","value"}]}]}  (query_to_config 형식, 저장소는 불투명 blob 취급)
```

### B-3. alembic 마이그레이션 (사내 책임)
`keyword_presets` 테이블: `employee_number`, `name`, `config JSONB`, `is_default`, `created_at`; **UNIQUE(employee_number, name)**. `is_default`는 사번당 1개 보장(create/update가 기존 해제).

## 해야 할 일 (결정 규칙)
1. fake(`app/adapters/fake/keyword_preset_repository.py`·`lot_repository.py`)를 참고 구현으로 두고 같은 계약을 Postgres로 구현.
2. `RealLotRepository.search`: DNF→SQL. **substring 필드는 `ILIKE '%'||:v||'%'`, status는 `=`(exact)**. dedup·정렬·LIMIT/OFFSET·COUNT는 계약대로.
3. `RealKeywordPresetRepository`: config는 **불투명 JSONB**로 저장/반환(검증·해석은 usecase/domain). is_default 단일성 트랜잭션 보장.
4. alembic upgrade/downgrade 작성 + 사내 dev Postgres 적용.
- **역산 금지**: `lot_status`/`keyword_presets`의 **실제 컬럼명을 추측하지 말 것** — 아래 stop-and-ask.
- **stop-and-ask**: 실제 `lot_status` 컬럼명이 DTO 필드와 다르면(예 `process_step` vs 사내 컬럼) 임의 매핑하지 말고 **실제 스키마를 확인·보고 후** 매핑. status distinct 값 집합이 불명확하면 보고.

---

## 검증 + 증거 (규율 4)
명령 결과를 **증거로 붙여** 보고하라.
- 계약 테스트(fake=real 동치): `backend/tests/contract/conftest.py`의 `ADAPTER_PARAMS`를 `["fake","real"]`로 확장 → `cd backend && pytest tests/contract -k 'fake or real' -q` 전부 통과.
- 전체: `cd backend && pytest -q` (현재 fake 120 통과 — real 추가 후에도 green).
- 경계 gate(CI): `git diff origin/main -- backend/app/domain backend/app/usecases backend/app/api backend/app/ports/dto.py` **빈 diff**(사내는 real/·alembic·contract 시드만 건드린다).
- 통합 스모크: `ADAPTER_MODE=real` 기동 → ① 키워드 검색(DNF·exact·페이지네이션) ② 프리셋 저장/불러오기 ③ 알람 `change`/`alert` 수신 + **재연결 중복 적립 없음**.
- 글자까지: 클래스명 `RealLotSource`/`RealLotRepository`/`RealKeywordPresetRepository`·파일 경로가 `ADAPTER_NAMING`과 일치.

## 테스트 실행
```bash
cd backend && pytest tests/api/test_ws_wire_format.py -q   # 알람 wire 계약(eventId/occurredAt)
cd backend && pytest tests/contract -k 'fake or real' -q   # fake=real 계약 동치
cd backend && pytest -q                                     # 전체
ADAPTER_MODE=real <기동>                                     # 통합 스모크(사내 접속 주입)
```
