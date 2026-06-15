# 알람 박스 — Real LotSource 변경 스트림 + eventId/occurredAt 계약

## 이 프롬프트가 작성된 배경 (환경 차이)

이 문서는 GitHub 레포 코드만 접근 가능한 외부 AI(Claude Code)가 작성했습니다.
PR #29(`feat/alarm-dock`, main 머지 `90d0376`)로 **프론트엔드 알람 박스 + critical 순간 팝**이 들어갔습니다. 프론트는 WebSocket `change`(info) / `alert`(warning|critical) 메시지를 받아 적립·표시합니다.

이 메시지의 출처는 백엔드 `LotSource.subscribe_changes()`인데, **운영(real) 어댑터가 레포에 없습니다.** `app/adapters/real/`에는 `__init__.py`만 있습니다. 외부 AI는 사내 `lot_status`(30분 dump) 스키마·접속정보·내부 라이브러리에 접근할 수 없어 이 어댑터를 구현할 수 없습니다 — 사내 구현이 필요합니다.

**opencode가 못 보는 맥락 (규율 5 — 맥락 보강):**
- **어댑터 네이밍 규약**(`app/di/container.py` `ADAPTER_NAMING`, "사내 AI 합의"): real 어댑터는 `app/adapters/real/{module}.py`의 `class Real{Suffix}`. LotSource는 → **파일 `app/adapters/real/lot_source.py`, 클래스 `RealLotSource`**. 다른 이름이면 `_load_real`이 import/getattr에서 실패한다.
- **severity는 도메인(usecase)이 분류**한다(`app/usecases/stream_hold_changes.py`): `status` 이고 `non-hold→hold`면 critical, 그 외 info. → **어댑터는 severity를 채우지 않는다.** 현재 warning은 백엔드에서 생성되지 않는다(info/critical만).
- 데이터는 **30분 주기 dump**라 진짜 push 피드가 없을 수 있다(아래 케이스 B 전제).
- 선행 문서 `ai-prompts/260529-1500-mirror-pg-sample-source-to-real.md`가 `PgSampleLotSource`→real 미러링을 다뤘다. 이 문서는 그중 **`subscribe_changes`(알람 스트림) + 이번 PR이 새로 요구하는 eventId/occurredAt 계약**에 집중한다.

## 단일 기준 (source of truth) — 규율 1·2

이 작업의 유일한 기준은 **레포의 포트/DTO 계약**이다. 여기에 맞춰라 — 사내 라이브러리의 편한 필드나 dump의 임의 컬럼에서 **역산하지 마라.**

| 항목 | 유일한 기준 (레포) | 역산 금지 (이렇게 하지 마라) |
|------|-------------------|------------------------------|
| 인터페이스 | `app/ports/lot_source.py` `LotSource` (메서드 시그니처·계약) | 시그니처 임의 변경, 반환 타입 바꾸기 |
| 이벤트 형태 | `app/ports/dto.py` `LotChangeEventDTO` (필드·타입·불변식) | dump 컬럼을 그대로 흘려보내기 |
| 파일/클래스명 | `ADAPTER_NAMING` → `app/adapters/real/lot_source.py` / `RealLotSource` | "편한" 다른 이름·위치 |
| 모드 전환 env | `app/config.py` `ADAPTER_MODE`(`fake`|`real`), `ADAPTER_REAL_MODULE_PREFIX`(`app.adapters.real`) | 새 env 이름 발명 |
| `event_id` 의미 | 프론트 dedup 계약(아래) — unique + 시간정렬 + **같은 논리적 변경엔 같은 id** | 매 전송마다 랜덤, 배열 인덱스, 비결정적 키 |

## 상황 (계약)

### 1) 포트 — `app/ports/lot_source.py`
```python
def subscribe_changes(self, employee_number: str) -> AsyncIterator[LotChangeEventDTO]:
    # - 다중 구독자(같은 사번 여러 iterator)에게 fan-out으로 동일 이벤트 전달
    # - event_id 는 동일 source 내에서 unique + 시간 순서 정렬 가능
    # - previous_status / new_status 는 도메인 severity 분류에 사용됨 (어댑터가 채움)
async def fetch_my_holds(self, employee_number: str) -> list[LotRowDTO]: ...  # 260529 문서 계약과 동일
```

### 2) 이벤트 DTO — `app/ports/dto.py` (frozen, extra=forbid)
```python
class LotChangeEventDTO(BaseModel):
    lot_id: str
    change_type: ChangeTypeLiteral        # "status"|"hold"|"comment"|"created"|"removed"
    previous_status: str | None = None
    new_status: str | None = None
    new_hold_comment: str | None = None
    occurred_at: datetime                  # ★ tz-aware 필수 (validator가 강제 — naive면 검증 실패)
    event_id: str                          # ★ unique + 시간순 정렬 가능
```

### 3) 이번 PR이 만든 프론트 의존성 (★ 핵심) — `app/api/wire.py` / `docs/backend.md`
`change`·`alert` **둘 다** `eventId`·`occurredAt`를 싣는다. 프론트 알람 박스가:

| 필드 | 프론트 용도 | 어겼을 때 증상 |
|------|------------|---------------|
| `eventId` | **dedup 키** — 재연결 재전송 무시, React key | 매번 바뀌면 **재연결 시 중복 적립**. 서로 다른 변경에 같은 id면 **알람 누락** |
| `occurredAt` | 알람 박스 **시간순 정렬** + 시각 표시 | 누락/naive면 정렬 깨짐·검증 실패 |

fake 어댑터는 `event_id = str(ULID())`(단조·정렬가능·unique)를 쓴다 — real도 동등 성질 보장.

## 해야 할 일

`app/adapters/real/lot_source.py`에 `class RealLotSource(LotSource)`를 구현하라. `fetch_my_holds`는 260529 문서 계약과 동일. 아래는 **`subscribe_changes`(알람 스트림)**. 사내 환경에 따라 케이스를 **결정 규칙대로** 고른다(임의 선택 금지 — 규율 1).

**결정 규칙:** 사내에 행 단위 변경을 실시간으로 주는 피드(CDC/트리거/메시지큐)가 **있으면 A**, 데이터 출처가 30분 dump뿐이면 **B**. 그리고 재구독 시 과거 이벤트 재전송 여부는 **반드시 C에서 택1해 문서화**한다.

### 케이스 A — 사내 실시간 변경 피드 있음
- 피드를 `LotChangeEventDTO`로 매핑해 fan-out yield.
- `event_id`: 피드의 안정적 고유 id를 쓰되 시간정렬 가능해야 함. 아니면 ULID 등 단조키로 재발급하되 **같은 논리적 변경엔 항상 같은 id**.
- `occurred_at`: 변경 실제 시각(tz-aware, KST offset).
- `change_type`/`previous_status`/`new_status`/`new_hold_comment`: 사내 enum→raw 문자열 매핑(어댑터 책임). **severity는 채우지 않음.**

### 케이스 B — 30분 dump뿐 (실시간 피드 없음, 유력)
폴링-diff로 이벤트를 합성한다.
1. dump를 주기적으로 읽어 직전 스냅샷과 **행 단위 diff**.
2. diff→이벤트: 신규=`created` / 소멸=`removed` / status 변경=`status`(+prev,new) / hold_comment 변경=`comment`(+new_hold_comment).
3. `event_id`: **결정적 키** 권장 — 예 `f"{dump_ts_iso}:{lot_id}:{change_type}"` 처럼 재계산해도 동일. (재구독 재전송 시 프론트 dedup이 동작하도록.)
4. `occurred_at`: dump 시각 또는 행 `updated_at`(tz-aware).
5. fan-out: 같은 사번 다중 구독자에 동일 이벤트(`InMemoryLotSource.emit` 패턴 참고).

### 케이스 C — 재구독(재연결) replay 정책 (★ 반드시 택1·문서화)
- **C-1 최근 변경 재전송** → `event_id`가 **결정적·안정적**이어야 프론트가 중복 없이 무시(권장: B의 결정적 키).
- **C-2 구독 시점 이후만 전송**(replay 없음) → 단순하지만 disconnect 중 critical 누락 가능. 수용 여부 판단 후 명시.

### 역산 금지 (규율 2)
- dump의 편한 컬럼을 `event_id`로 그대로 쓰지 마라(고유·정렬·결정성 검증 안 된 값). 위 결정적 키 또는 ULID를 쓴다.
- `ADAPTER_MODE`/`ADAPTER_REAL_MODULE_PREFIX` 외에 **새 env 이름을 만들지 마라.**

### 모호하면 멈추고 보고 (규율 3 — stop-and-ask)
- dump 스키마에 **변경을 고유 식별할 안정적 컬럼/타임스탬프가 없으면**, 임의 키를 만들지 말고 **사용 가능한 컬럼 목록과 함께 멈춰 보고**하라.
- `previous_status`를 채울 직전 상태 출처가 불명확하면(스냅샷 보관 위치 등) 추측 말고 보고.

## 검증 + 증거 (규율 4)

아래를 확인하고 **명령 결과를 증거로 붙여** 보고하라.
- 와이어 회귀: `cd backend && pytest tests/api/test_ws_wire_format.py -q` (eventId/occurredAt가 change·alert 둘 다 실림 — 계약 기준).
- real 단위 테스트(신규): `subscribe_changes`가 ① `non-hold→hold`에서 critical로 이어짐(StreamHoldChanges 경유) ② `event_id` unique·정렬가능 ③ (C-1 택시) **같은 변경 두 번 흘려도 같은 event_id** ④ `occurred_at` tz-aware. → `cd backend && pytest -q` 결과 첨부.
- 통합 스모크: `ADAPTER_MODE=real`로 기동→WS 연결→dump 변경 발생→`change`/`alert` 수신, **재연결 후에도 프론트 중복 적립 없음** 확인.

검증 포인트(글자까지): 클래스명 `RealLotSource`·파일 경로·`ADAPTER_NAMING`이 일치하는지, critical(`non-hold→hold`)은 `alert`로만 오며 `eventId`/`occurredAt`가 반드시 포함되는지.
