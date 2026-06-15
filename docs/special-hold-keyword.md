# Special hold (슬롯[5]) — 키워드 기반 hold 모니터

> 확정: 2026-06-13 (grill-me 12문 설계 합의)
> 상태: 설계 확정 · 백엔드 fake-first TDD 착수
> 선행 결정: `history/decisions.html` 2026-06-13 항목. 보류된 watchlist는 `docs/watchlist-final-design.html`.

## 0. 한 줄 요약

placeholder 슬롯[5] `Special hold`(SPC/FDC 등 특정 hold code)를 **사용자 정의 키워드로 일반화**한다.
유저가 (필드, 값) 키워드를 해시태그처럼 등록·저장하고, `lot_status`에서 그 키워드에 매칭되는 lot을 보여준다.
"내 lot hold"(사번 매칭)의 자매 슬롯 — **매칭 기준만 키워드**. 단 status 무관 전체 lot 우주가 대상.

## 1. 스코프

- **위치**: slotIndex 4 (대시보드 표시번호 05). 이름 **`Special hold` 유지**, 부제만 "키워드로 정의하는 hold 모니터"로 갱신.
  - 기존 placeholder("SPC/FDC 등 특정 hold code lot")는 하드코딩 hold code 컨셉 → 그 특수 케이스를 범용 키워드가 흡수한다.
- **데이터 우주**: status 무관, `lot_status` 전체 행. ("Hold만" 같은 제약은 `status` 키워드로 사용자가 직접 건다 — 하드코딩 안 함.)
- **데이터 소스**: `lot_status`(30분 dump 마스터 캐시)를 **직접 쿼리**.
  - "내 lot hold"의 실시간 `LotSource`는 **사번 전용**(`fetch_my_holds(employee_number)`)이라 키워드 조회 메서드가 없다 → 키워드 검색은 `lot_status`만 사용 → **신선도 = 30분 dump 주기**(실시간 아님).
- **자기완결적**: `lot_status`는 **pholex 자체 Postgres**(사내 production DB 아님 — `ports/lot_repository.py` 명시)라, real adapter도 외부에서 전부 구현 가능. **사내 AI 위임 불필요**(dump 잡은 이미 완료). watchlist와 동일하게 30분 캐시를 읽기만.

## 2. 키워드 모델

- 키워드 = **(필드, 값)**. 등록 시 **대상 필드 1개를 반드시 지정**(자유 입력 "전체 텍스트" 기본값 없음).
- 필드별 매칭:

| 필드 | 매칭 방식 |
|------|----------|
| `equipment` · `process_step` · `hold_comment` · `lot_id` | 대소문자 무시 substring (`ILIKE %값%`), 값 앞뒤 trim |
| `status` | 정확히 일치 (`status = 값`) |

- **`status` 선택지**: `SELECT DISTINCT status FROM lot_status`(캐시)로 동적 생성. 하드코딩 enum 금지 — status는 열린 집합(2026-06-09 결정)이라 미래 값을 UI에서 자동 포함해야 한다.
  - status를 substring으로 매칭하면 `"Active"`가 `"PreActive"`를 잘못 잡으므로 반드시 exact.

## 3. 불리언 — OR / AND (DNF)

- **DNF (Disjunctive Normal Form)**: 그룹 안은 **AND**, 그룹끼리는 **OR**.
  - 예: `(equipment ILIKE %ETCH% AND status = Hold) OR (process_step ILIKE %PHOTO%)`
  - 안 묶인 키워드 = 원소 1개짜리 그룹.
- **UI(방식 A — 평면 칩 + 묶기)**: 키워드를 칩으로 나열(기본 전부 OR). 여러 칩 선택 → `[AND로 묶기]` → 한 덩어리(테두리)로 표시. `[풀기]`로 해제. 임의 중첩(`(A OR B) AND C`)은 지원 안 함(DNF로 충분).
- **쿼리빌더 규율**: 그룹별 predicate를 **개별 접근 가능한 형태**로 유지(그룹 리스트 → 각 그룹을 WHERE OR; 하나의 불투명 문자열로 미리 뭉개지 않기). v2 "행별 매칭 배지"를 거의 공짜로 만들기 위한 구조적 보험.

## 4. 결과 · 페이지네이션

- `lot_id` 기준 **dedup**(OR라 한 lot이 여러 그룹에 걸려도 1행).
- 정렬: **`updated_at DESC`**, 동률 시 `lot_id ASC`(페이징 안정성).
- 페이지 크기 **100**, **offset/limit** 방식(3만행 규모면 keyset 오버스펙).
- 응답에 **총 매칭 건수** 포함 → 프론트 "총 N건 중 1–100" 배지 + `prev/next` 페이지네이션 UI.
- 표시 컬럼: `lot_id · status · equipment · process_step · hold_comment · updated_at` — 기존 `LotRow`/테이블 컴포넌트 재사용. **행별 매칭 키워드 배지는 v2.**

## 5. 저장 — 명명 프리셋

- 유저당 **명명 프리셋 여러 개**, 전환 가능.
- 편집은 **드래프트 + 명시 저장**: `[저장]`(현재 프리셋 덮어쓰기) / `[새 프리셋으로 저장]`. (자동저장 아님 — 프리셋 보호.)
- 패널 열면 `is_default` 프리셋 자동 로드·조회. 없으면 빈 상태 + "프리셋 만들기" CTA. 헤더 드롭다운으로 전환.
- 캡(soft): 프리셋 ~20/유저, 키워드 ~30/프리셋. 이름 필수, 사번 스코프 내 유니크.

### DDL

```sql
CREATE TABLE keyword_presets (
    id              BIGSERIAL PRIMARY KEY,
    employee_number VARCHAR(50) NOT NULL,   -- 사번 (users.employee_number 와 동일 타입)
    name            VARCHAR(200) NOT NULL,
    config          JSONB NOT NULL,         -- DNF 직렬화 (아래 shape)
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (employee_number, name)
);
CREATE INDEX idx_keyword_presets_employee ON keyword_presets(employee_number);
```

### config JSONB shape

```jsonc
{
  "groups": [
    // 각 그룹 = AND 로 묶인 조건들. 그룹끼리는 OR.
    { "conditions": [
        { "field": "equipment",   "value": "ETCH" },   // ILIKE %ETCH%
        { "field": "status",      "value": "Hold"  }    // status = 'Hold'
    ]},
    { "conditions": [
        { "field": "process_step", "value": "PHOTO" }
    ]}
  ]
}
```

- 조회 시 config를 역직렬화 → `lot_status` WHERE절로 빌드(lot 검색을 JSONB로 하는 게 아님).
- 정규화(조건 1행) 대신 JSONB 문서: 키워드 구성은 개별 조건으로 SQL 질의할 일이 없고 항상 프리셋 단위로 통째 읽고/쓴다.

## 6. 갱신 · 신선도

- **수동 중심**: `[새로고침]` + 프리셋 전환/저장 시 + 탭 포커스 복귀 시 재조회.
- 헤더에 "데이터 기준 HH:MM"(`lot_dump_meta.last_run_at`) + 2배 주기(≈60분) 초과 시 ⚠️ 라벨.
- **WebSocket 미사용**(30분 캐시라 실시간 push 의미 없음). 자동 폴링은 다른 슬롯과 공통 메커니즘으로 v2.

## 7. 백엔드 구조 (기존 hexagonal 패턴 준수)

- **포트**
  - `KeywordPresetRepository` (신규) — 프리셋 CRUD: `list_by_employee` / `get` / `save`(upsert) / `delete` / `set_default`.
  - lot 검색 — `LotRepository`에 `search(dnf, *, limit, offset) -> (rows: list[LotRowDTO], total: int)` 추가(또는 별도 검색 포트). DNF는 도메인 값 객체로 표현.
- **DTO / 도메인**: `KeywordCondition(field, value)`, `KeywordGroup(conditions)`, `KeywordQuery(groups)`(=DNF), `KeywordPreset(id, name, config, is_default, ...)`, 검색 결과는 기존 `LotRowDTO` 재사용 + `SearchPage(rows, total, page, page_size)`.
- **usecases**: `ListKeywordPresets` / `SaveKeywordPreset` / `DeleteKeywordPreset` / `SearchSpecialHold`(프리셋 또는 즉석 DNF → `LotRepository.search`).
- **API**: `/api/keyword-presets` (GET 목록 / POST 저장 / PUT·DELETE / default 지정) + 검색 라우트 1개(최종명 빌드 시 — 예 `/api/special-hold/search`). 모두 `require_session`.
- **어댑터**: fake(InMemory) 먼저 → contract/usecase test green → real(pholex Postgres) 어댑터. fake/real 동일 포트.
- **TDD**: fake-first red→green. DNF→WHERE 빌더와 status exact / 텍스트 ILIKE 분기, dedup, 정렬·페이지네이션, total count를 contract test로 고정.

## 8. v2로 의식적으로 연기

- 행별 **매칭 키워드/그룹 배지** (현재 페이지 행을 DNF에 재평가 → 옵셔널 DTO 필드, additive).
- 일반 `field:value` 자유 문법(임의 컬럼 field-qualified).
- `lot_dump_meta` 변경 자동 폴링(슬롯 공통화).
- 매칭 그룹 기준 정렬/필터/집계(SQL 레벨 태깅 필요 — 더 큰 작업).

## 9. 미결 · 가정

- 섹션 이름은 `Special hold` 유지 확정(키워드 Hold로 개명 안 함).
- `lot_id` 키워드는 substring — my-hold SideNav의 `lotIdQuery` 필터와 의도는 겹치나 슬롯·맥락이 달라 별개로 둠.
- 검색 라우트 최종명, 프리셋 CRUD 엔드포인트 세부(메서드/경로)는 빌드 시 확정.
