# 알람 박스 — Real LotSource 변경 스트림 + eventId/occurredAt 계약

## 이 프롬프트가 작성된 배경 (환경 차이)

이 문서는 GitHub 레포 코드만 접근 가능한 외부 AI(Claude Code)가 작성했습니다.
PR #29(`feat/alarm-dock`, main 머지 완료, squash `90d0376`)로 **프론트엔드 알람 박스 + critical 순간 팝**이 들어갔습니다. 프론트는 WebSocket으로 오는 `change`(info) / `alert`(warning|critical) 메시지를 받아 적립·표시합니다.

그런데 이 메시지를 실제로 만들어 내보내는 출처는 백엔드의 `LotSource.subscribe_changes()`이고, **운영(real) 어댑터가 레포에 없습니다.** `app/adapters/real/`에는 `__init__.py`만 있습니다. `ADAPTER_MODE=real`이면 `app/di/container.py`의 `get_lot_source()`가 다음을 실행합니다:

```python
# app/di/container.py
def _load_real(port_name: str):
    mod_name, cls_suffix = ADAPTER_NAMING[port_name]           # ("lot_source", "LotSource")
    mod = importlib.import_module(f"{settings.ADAPTER_REAL_MODULE_PREFIX}.{mod_name}")  # app.adapters.real.lot_source
    cls = getattr(mod, f"Real{cls_suffix}")                    # RealLotSource
    return cls()
```

즉 운영에서는 `app/adapters/real/lot_source.py`의 `class RealLotSource`가 있어야 알람 스트림이 동작합니다. 외부 AI는 사내 lot_status(30분 dump) 스키마·접속정보·내부 라이브러리에 접근할 수 없어 이 어댑터를 구현할 수 없습니다. 사내 구현이 필요합니다.

> 참고: 기존 `ai-prompts/260529-1500-mirror-pg-sample-source-to-real.md`가 `PgSampleLotSource`(fake/postgres) → real 미러링을 다뤘습니다. 이 문서는 그 작업의 **`subscribe_changes`(알람 스트림) 부분 + 이번 PR이 새로 요구하는 eventId/occurredAt 계약**에 초점을 맞춥니다.

## 상황 (계약)

### 1) 포트 계약 — `app/ports/lot_source.py`

```python
def subscribe_changes(self, employee_number: str) -> AsyncIterator[LotChangeEventDTO]:
    # - 다중 구독자(같은 사번 여러 iterator)에게 fan-out으로 동일 이벤트 전달
    # - event_id 는 동일 source 내에서 unique + 시간 순서 정렬 가능
    # - previous_status / new_status 는 도메인 severity 분류에 사용됨 (어댑터가 채움)
```

### 2) 이벤트 DTO — `app/ports/dto.py`

```python
class LotChangeEventDTO(BaseModel):
    lot_id: str
    change_type: ChangeTypeLiteral        # "status" | "hold" | "comment" | "created" | "removed"
    previous_status: str | None = None
    new_status: str | None = None
    new_hold_comment: str | None = None
    occurred_at: datetime                  # ★ tz-aware 필수 (validator가 강제)
    event_id: str                          # ★ unique + 시간순 정렬 가능
```

### 3) severity 분류는 도메인이 담당 (어댑터 책임 아님) — `app/usecases/stream_hold_changes.py`

```python
# status 이고 (non-hold → hold) 이면 critical, 그 외는 info
# → 현재 warning 은 백엔드에서 생성되지 않음(info/critical만). 어댑터는 severity를 채우지 않는다.
```

### 4) 이번 PR이 새로 만든 의존성 (★ 핵심)

`change_to_wire`(`app/api/wire.py`)가 이제 `change`·`alert` **둘 다** `eventId`·`occurredAt`를 싣습니다(`docs/backend.md` 갱신됨). 프론트엔드 알람 박스가:

| 필드 | 프론트 용도 | 어겼을 때 증상 |
|------|------------|---------------|
| `eventId` | **dedup 키** — 재연결 시 같은 이벤트 재전송 무시, React list key | id가 매 전송마다 바뀌면 **재연결 때 중복 적립**. 서로 다른 변경에 같은 id면 **알람 누락**(두 번째가 dedup됨) |
| `occurredAt` | 알람 박스 **시간순 정렬** + 시각 표시 | 누락/부정확하면 정렬·표시 깨짐 (tz-aware 아니면 DTO validator에서 422/검증 실패) |

fake 어댑터는 `event_id = str(ULID())`(단조 증가·정렬 가능·unique)를 씁니다 — real도 동등한 성질을 보장해야 합니다.

## 해야 할 일

`app/adapters/real/lot_source.py`에 `class RealLotSource(LotSource)`를 구현하세요. `fetch_my_holds`는 기존 mirror 작업(위 260529 문서)과 동일 계약입니다. 아래는 **`subscribe_changes`(알람 스트림)** 에 집중합니다. 사내 환경 상황에 따라 케이스를 고르세요.

### 케이스 A — 사내에 이미 실시간 변경 피드(push/CDC/트리거)가 있다
- 그 피드를 `LotChangeEventDTO`로 매핑해 `subscribe_changes`에서 fan-out yield.
- `event_id`: 피드의 안정적 고유 id를 그대로 쓰되 **시간 정렬 가능**해야 함(아니면 ULID/`f"{seq}"` 등 단조 키로 재발급, 단 **같은 논리적 변경엔 항상 같은 id**).
- `occurred_at`: 변경 실제 시각(tz-aware, KST offset 포함).
- `change_type`/`previous_status`/`new_status`/`new_hold_comment`를 사내 enum→raw 문자열로 매핑(어댑터 책임).

### 케이스 B — 데이터 출처가 30분 dump뿐이다 (실시간 피드 없음, 가장 유력)
`lot_status`가 30분 주기 dump이므로 진짜 push 스트림이 없습니다. 폴링-diff로 이벤트를 합성하세요.
1. 백그라운드로 dump를 주기적으로(예: 30분, 또는 dump 갱신 감지) 읽어 직전 스냅샷과 **행 단위 diff**.
2. diff → 이벤트 합성:
   - 신규 행 → `change_type="created"`
   - 사라진 행 → `change_type="removed"`
   - status 변경 → `change_type="status"` (+ previous/new)
   - hold_comment 변경 → `change_type="comment"` (+ new_hold_comment)
3. `event_id`: **변경 단위로 안정적·고유·정렬 가능**하게. 권장: `ULID()` 또는 `f"{dump_ts_iso}:{lot_id}:{change_type}:{new_value_hash}"` 처럼 **재계산해도 동일**한 결정적 키. (재연결/재구독 시 같은 변경이 다시 흘러도 프론트가 dedup하도록.)
4. `occurred_at`: dump 시각 또는 행 `updated_at`(tz-aware).
5. fan-out: 같은 사번 다중 구독자에게 동일 이벤트 전달(`InMemoryLotSource.emit` 패턴 참고).

### 케이스 C — 재구독(재연결) 시 과거 이벤트 재전송 정책 결정 (★ 반드시 명시)
프론트는 disconnect 동안 놓친 이벤트를 WS로는 복구하지 않습니다(REST 새로고침이 테이블은 복구). 둘 중 택1:
- **(C-1) 재구독 시 최근 N분/마지막 dump의 변경을 재전송** → 이때 `event_id`가 **결정적·안정적**이어야 프론트가 이미 적립한 것을 중복 없이 무시. (권장: 케이스 B의 결정적 키)
- **(C-2) 구독 시점 이후 변경만 전송**(replay 없음) → 단순하지만 disconnect 중 발생한 critical을 놓칠 수 있음. 수용 가능한지 사내 판단 후 문서화.

### DI/설정 확인
- 운영 배포의 `ADAPTER_MODE`(`app/config.py`, 기본 `"fake"`)를 `"real"`로, `ADAPTER_REAL_MODULE_PREFIX`(기본 `app.adapters.real`) 확인.
- 클래스명은 반드시 **`RealLotSource`**, 파일은 **`app/adapters/real/lot_source.py`** (네이밍 규약 `ADAPTER_NAMING`).

## 테스트 실행

```bash
# 1) 와이어 포맷 회귀 (이미 통과 — 계약 기준): eventId/occurredAt 가 change·alert 둘 다 실림
cd backend && pytest tests/api/test_ws_wire_format.py -q

# 2) real 어댑터 단위 테스트(신규 작성 권장): subscribe_changes 가
#    - status non-hold→hold 에서 critical 분류로 이어지는지(StreamHoldChanges 경유)
#    - event_id unique + 정렬 가능 + (C-1 택시) 재구독 시 동일 변경 동일 id
#    - occurred_at tz-aware
cd backend && pytest -q

# 3) 통합 스모크: ADAPTER_MODE=real 로 기동 후 WS 연결 → dump 변경 발생 → change/alert 수신 확인
ADAPTER_MODE=real <기동> # 사내 접속정보/엔진 주입
```

검증 포인트: 같은 변경이 재연결로 두 번 흘러도 프론트 알람 박스에 **중복 적립되지 않아야** 한다(eventId dedup). critical(non-hold→hold)은 `alert`로만 오며 `eventId`/`occurredAt`가 반드시 포함돼야 한다.
