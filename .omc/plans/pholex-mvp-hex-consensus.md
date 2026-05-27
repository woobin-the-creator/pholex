# Consensus Plan v3: Pholex MVP — Hexagonal Backend + Dev Stack

> Source spec: `.omc/specs/deep-interview-pholex-mvp-hexagonal-architecture.md` (ambiguity 7.9%, PASSED)
> Revision history: v1 (initial Planner draft) → v2 (Architect + Critic feedback integrated) → v3 (Dev stack + canonical mapping clarification + column customization extension path)

## v3 Changes

1. **Phase 11 신설** — Dev Stack (docker compose): backend/frontend/postgres 컨테이너, Redis 제외, MVP는 dev 모드만, 사내 deployment 체크리스트 포함
2. **Phase 9 보강** — Canonical 매핑 책임 (사내 enum → {run/wait/hold}, {ENGINEER/ADMIN}) 명시 + 미러 레포 빌드 검증 책임 (사내 AI)
3. **ADR Follow-ups 보강** — Column Customization 확장 경로 (visibility/ordering frontend-only, 사내 컬럼 증가 절차, 슬롯별 DTO 분리)

도메인/Port/DTO/use case 구조는 v2 그대로. 신규 변경은 dev 환경 + 문서 + 확장 가이드 중심.

## RALPLAN-DR Summary

### Principles
1. **Domain-owned interfaces** — 도메인이 Port를 소유, 인프라가 그 인터페이스에 의존 (DIP).
2. **No leaking infra concerns** — 사내 컬럼명·enum·SQL·HTTP·dev-bypass 환경 관심사는 어댑터/DI 내부에만. 도메인/UC/API는 DTO만 본다.
3. **Adapter invariance** — Fake → Real 교체 시 `domain/`, `usecases/`, `api/` 코드는 0줄 변경. CI gate(`git diff`)로 강제.
4. **Contract-first collaboration** — Claude가 Port + Contract Test 먼저. Fake와 Real이 동일 Contract Test 모음 통과. Contract Test가 substantive(empty trap, idempotency, ordering 등)까지 검증.
5. **Vertical Slice forbidden** — spec의 Non-Goal 유지.

### Decision Drivers (top 3)
1. 사내/Claude 비대칭 협업 가능성
2. Real adapter 통합 시 회귀 위험 최소화 + 책임 추적
3. MVP 슬롯 [1] e2e 동작까지의 속도

### Viable Options

**Option A — Port-by-External-System** ✅ 선택
- Port 4개: `LotSource`, `LotRepository`, `MailSender`, `SsoVerifier` (+ supporting: `UnitOfWork`, `Clock`)
- Pros: 사내 AI 발주 단위 = Port 1:1. Contract Test가 Port별로 분리. 통합 회귀 추적 명확.
- Cons: Port 수 6개. DI wiring 코드량 증가. DTO 첫 정의 미세 조정 부담.

**Option B — Coarse Repository + Service Bus**
- Pros: Port 수 적음, CQRS 확장 쉬움.
- Cons: 사내 AI 발주 분할 어려움. MVP 단일 슬롯 규모 대비 오버엔지니어링. Repository 시그니처 변경 파장 큼.

**Option C — Layered (전통 routers/services/repositories)**
- Pros: 친숙, 보일러플레이트 적음.
- Cons: 외부 시스템이 services 안에 묻혀 분담 경계 사라짐 → spec Non-Goal 저촉.

**Option D — Layered + Explicit Gateway Interfaces** (Critic이 제기한 중간 옵션)
- services 안에서 외부 호출을 명시적 인터페이스 (Gateway) 로 추출. Port-by-External-System보다 가볍고 C보다 명확.
- Pros: 보일러플레이트 적음, services 안에서 도메인 로직과 외부 호출이 명시적 분리.
- Cons: Gateway가 services 안에 있어 use case 모듈이 *인터페이스 정의 위치*가 됨. 사내 AI에게 "service의 gateway 부분만 구현해주세요"라는 발주가 service 코드 일부 노출을 요구 → spec의 "어댑터만 비공개 작업" 분담 경계 약화.

**Invalidation rationale**:
- B → 규모 미스매치 + 사내 발주 분할 곤란.
- C → services 안에 외부 호출이 묻혀 spec 핵심 invariant 보장 못함.
- D → Gateway 인터페이스가 services와 같은 모듈 트리에 있어, 사내 AI에게 service 모듈 일부를 보여줘야 발주 가능 → 비대칭 협업의 코드 노출 면적 증가. A는 `adapters/real/`라는 *완전 격리된 모듈*에서만 작업하면 됨 → 노출 면적 최소.

→ A 선택. Decision Driver 1(협업)에서 D보다 우위.

---

## Implementation Plan

### Phase 1 — Scaffolding

```
backend/
  pyproject.toml          # FastAPI, SQLAlchemy[asyncio], Pydantic v2, pytest, pytest-asyncio, httpx, uvicorn, freezegun
  app/
    __init__.py
    main.py               # FastAPI app, lifespan(DI 초기화), router 등록, /ws mount
    config.py             # Pydantic Settings
    domain/__init__.py
    usecases/__init__.py
    ports/__init__.py
    adapters/
      fake/__init__.py
      real/
        __init__.py
        README.md         # 사내 AI 진입점 → docs/adapter-spec.md
    api/__init__.py
    di/__init__.py
  tests/
    conftest.py
    contract/__init__.py
    usecases/__init__.py
    domain/__init__.py
    api/__init__.py       # WS wire format 회귀 테스트 포함
```

**config.py** 환경변수:
```
USE_FAKE_ADAPTERS=true|false
DEV_SSO_BYPASS=true|false
DATABASE_URL, REDIS_URL, CORS_ORIGINS
ADAPTER_REAL_MODULE_PREFIX="app.adapters.real"  # naming convention 고정
```

미루는 것: Alembic 마이그레이션 (사내 AI 영역), 실제 Redis 연결 (Fake는 in-memory broadcaster).

### Phase 2 — Domain (Claude)

`domain/lot.py`:
```python
class LotStatus(str, Enum):
    RUN = "run"; WAIT = "wait"; HOLD = "hold"   # closed set, MVP 한정
```

> **결정 (Critic Fix 3 / Brownfield FAIL)**: `LotStatus`는 `run/wait/hold` closed set 확정. Frontend의 `useMyHoldTable.ts` `DEMO_ROWS`가 `review`/`release-pending`을 포함하는 건 별도 follow-up으로 정리 (`DEMO_ROWS`를 `run/wait/hold`로 다듬어 backend Fake adapter seed와 동치 보장). 이 정리가 Phase 10 verification 통과의 전제.

`domain/hold.py`, `domain/session.py`: spec과 동일. `SessionUser.auth_level: AuthLevel` (Literal["ENGINEER", "ADMIN"]) closed set으로 잠금. 사내가 `OPERATOR` 추가하면 도메인 enum 확장이 의식적 결정이 되도록.

### Phase 3 — Ports + DTOs (Claude)

`ports/dto.py`:
```python
class LotRowDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")    # extra 필드 거부, alias 금지
    lot_id: str
    status: Literal["run", "wait", "hold"]
    equipment: str | None = None
    process_step: str | None = None
    hold_comment: str | None = None
    updated_at: datetime
    is_held_by_me: bool

class LotChangeEventDTO(BaseModel):
    model_config = ConfigDict(extra="forbid")
    lot_id: str
    change_type: Literal["status", "hold", "comment", "created", "removed"]
    previous_status: Literal["run", "wait", "hold"] | None = None     # severity 산정용 (Architect §3.1 fix)
    new_status: Literal["run", "wait", "hold"] | None = None
    new_hold_comment: str | None = None
    occurred_at: datetime
    event_id: str                                # 다중 구독·replay 가능성 대비 ordering key

class SsoIdentityDTO(BaseModel): ...
class MailSendResult(BaseModel): ...
```

> **결정 (Critic §6 / Architect §3.1)**: `previous_status` 추가. severity 정책 ("`* → hold` = critical")은 **use case가 결정** — `LotChangeEventDTO`는 *raw fact*, severity는 *도메인 규칙*. 어댑터에서 severity를 결정하면 도메인 규칙이 인프라로 새고 사내 매핑 오류가 silently severity까지 틀리게 만들 수 있음.

`ports/lot_source.py`:
```python
class LotSource(Protocol):
    async def fetch_my_holds(self, employee_no: str) -> list[LotRowDTO]: ...
    def subscribe_changes(self, employee_no: str) -> AsyncIterator[LotChangeEventDTO]: ...
```

> **결정 (Architect §1 steelman 응답)**: `LotSource`는 polling(request-response)과 stream(subscribe) 두 책임을 묶지만, 두 책임 모두 *사내 lot 데이터 출처 1개*라는 외부 시스템 추상화에 속함. 분할(Architect 제안 `LotPoller`/`ChangeBroker`)은 academic으로 깔끔하나 사내 AI 발주 단위가 "lot 데이터 어댑터" 1개로 묶이는 게 자연스럽고, Real 구현 시 polling→DB upsert→Redis pub의 *내부 흐름* 책임이 한 어댑터 안에 있어 더 명확. 통합 회귀 시 책임 추적도 한 곳. → 분할 안 함, 단 docstring에 "polling+stream의 *내부 일관성* 책임은 이 어댑터가 진다" 명시.

`ports/lot_repository.py`: spec 그대로 (`upsert_lot`, `upsert_lots_batch`, `get_my_holds_cached`, `invalidate_cache`).

> **추가**: `upsert_lots_batch(rows: list[LotRowDTO]) -> None` — 트랜잭션 N건 분할 방지 (Architect §4 트랜잭션 경계).

`ports/mail_sender.py`: spec 그대로.

`ports/sso_verifier.py`:
```python
class SsoVerifier(Protocol):
    async def init_login(self, return_url: str) -> str: ...
    async def verify_callback(self, code: str, state: str) -> SsoIdentityDTO: ...
    async def verify_session_token(self, token: str) -> SsoIdentityDTO: ...     # WS 인증용 (Architect §4)
```

> **결정 (Critic Fix 5)**: `dev_bypass()`는 Port에서 **제거**. Fake adapter(`DevSsoVerifier`) 내부 메서드로만 존재. DI가 `USE_FAKE_ADAPTERS=true` 또는 `DEV_SSO_BYPASS=true`일 때 `DevSsoVerifier`를 주입.

`ports/unit_of_work.py` (신규, Architect §4):
```python
class UnitOfWork(Protocol):
    async def __aenter__(self) -> "UnitOfWork": ...
    async def __aexit__(self, *exc) -> None: ...
    async def commit(self) -> None: ...
    async def rollback(self) -> None: ...
```

`ports/clock.py` (신규):
```python
class Clock(Protocol):
    def now(self) -> datetime: ...
```

### Phase 4 — Fake Adapters (Claude)

- `adapters/fake/in_memory_lot_source.py`: seed = `scripts/seed_dev.sql` 동치 (99999 사번 hold 3건 + 다른 employee 1건 fixture로 `is_held_by_me=False` 검증 가능). `subscribe_changes`는 employee_no별 `asyncio.Queue` 디스패처 + `event_id` ULID 부여.
- `adapters/fake/in_memory_lot_repository.py`: dict 캐시. `upsert_lots_batch`는 atomic 보장 (테스트용이라 단순 dict update).
- `adapters/fake/log_mail_sender.py`: stdout 로그.
- `adapters/fake/dev_sso_verifier.py`: `verify_session_token`은 항상 동일 테스트 사용자, `verify_callback`/`init_login`은 mock URL.
- `adapters/fake/in_memory_unit_of_work.py`: no-op context manager.
- `adapters/fake/system_clock.py` + `adapters/fake/fixed_clock.py`: 테스트용 freezegun 친화.

### Phase 5 — Use Cases (Claude)

```python
# usecases/fetch_my_holds.py
class FetchMyHolds:
    def __init__(self, source, repo, uow): ...
    async def execute(self, employee_no: str, force_refresh: bool = False) -> list[LotRowDTO]:
        if not force_refresh:
            if (cached := await self._repo.get_my_holds_cached(employee_no)) is not None:
                return cached
        async with self._uow:
            fresh = await self._source.fetch_my_holds(employee_no)
            await self._repo.upsert_lots_batch(fresh)
            await self._uow.commit()
        return fresh

# usecases/stream_hold_changes.py
class StreamHoldChanges:
    async def execute(self, employee_no: str) -> AsyncIterator[ChangeWithSeverity]:
        async for event in self._source.subscribe_changes(employee_no):
            await self._repo.invalidate_cache(employee_no)
            severity = self._classify_severity(event)
            yield ChangeWithSeverity(event=event, severity=severity)

    @staticmethod
    def _classify_severity(event: LotChangeEventDTO) -> Literal["info", "warning", "critical"]:
        if event.change_type == "status" and event.new_status == "hold" and event.previous_status != "hold":
            return "critical"      # docs/backend.md "* → hold = critical"
        return "info"
```

> **결정 (Architect §1 steelman / Critic §6)**: `is_held_by_me` 판정 + employee_no 필터링은 어댑터에 위임. Use case는 *합성·캐시·트랜잭션·severity 결정* 만 담당. **이 책임 경계를 ADR에 명시**하여 "use case가 비어 있다"는 외관상 가벼움이 *의식적 설계*임을 분명히 함.

### Phase 6 — API + WebSocket (Claude, 얇은 transport + wire format 매핑)

```python
# api/lots.py
@router.get("/api/lots/my-hold", response_model=SlotPayload)
async def get_my_hold(
    session: Annotated[SessionUser, Depends(require_session)],
    uc: Annotated[FetchMyHolds, Depends(get_fetch_my_holds_uc)],
    clock: Annotated[Clock, Depends(get_clock)],
    refresh: bool = False,
):
    rows = await uc.execute(session.employee_no, force_refresh=refresh)
    return SlotPayload(
        tableId=1,                              # MVP slot[1] hard-coded
        rows=[_to_wire_row(r) for r in rows],
        diff=False,
        lastUpdated=clock.now(),
    )
```

> **결정 (Critic Fix 2)**: REST 응답 envelope `SlotPayload`는 **api/** 레이어가 합성. `tableId=1`은 슬롯[1] hard-coded, `lastUpdated`는 Clock Port에서 가져옴, `diff=False` (전체 리프레시 의미). 새 슬롯 추가 시 api 레이어에 새 route 추가 = 자연 (도메인/UC 변경 아님).

`api/ws.py`:
```python
@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, ...):
    session = await _authenticate_ws(ws)        # SsoVerifier.verify_session_token
    await ws.accept()
    uc = ...
    async for envelope in uc.execute(session.employee_no):
        await ws.send_json(_to_wire_event(envelope))    # LotChangeEventDTO + severity → docs/backend.md 포맷

def _to_wire_event(e: ChangeWithSeverity) -> dict:
    if e.severity in ("warning", "critical"):
        return {"type": "alert", "payload": {
            "lotId": e.event.lot_id, "severity": e.severity,
            "message": f"{e.event.change_type}: {e.event.previous_status} -> {e.event.new_status}",
        }}
    return {"type": "table_update", "payload": {
        "tableId": 1, "diff": True,
        "rows": [_event_to_row_patch(e.event)],
    }}
```

> **결정 (Critic Fix 1 + Architect §3.1)**: `LotChangeEventDTO` → `{type, payload}` wire format 매핑은 **api/ws.py 책임**. 새 change_type이 추가될 때 `_to_wire_event`만 확장 → use case 무변경. 이 invariant를 `tests/api/test_ws_wire_format.py`에서 회귀 검증.

`api/auth.py`: SSO 4개 endpoint, `verify_session_token` 사용은 WS 전용.

### Phase 7 — DI Wiring + Naming Convention

```python
# di/container.py
ADAPTER_NAMING = {
    "LotSource": ("lot_source", "LotSource"),
    "LotRepository": ("lot_repository", "LotRepository"),
    "MailSender": ("mail_sender", "MailSender"),
    "SsoVerifier": ("sso_verifier", "SsoVerifier"),
}   # 사내 AI 합의 명명 규약

def _load_real(port_name: str):
    mod_name, cls_suffix = ADAPTER_NAMING[port_name]
    mod = importlib.import_module(f"{settings.ADAPTER_REAL_MODULE_PREFIX}.{mod_name}")
    return getattr(mod, f"Real{cls_suffix}")()

@lru_cache
def get_lot_source() -> LotSource:
    if settings.USE_FAKE_ADAPTERS:
        return InMemoryLotSource(seed=DEFAULT_SEED)
    return _load_real("LotSource")
```

> **결정 (Architect §3.3)**: 사내 AI는 `app/adapters/real/{port_module}.py` 모듈에 `Real{PortClass}` 클래스명 사용. Adapter Spec 문서에 명문화. DI는 이 규약에 따라 dynamic import — 사내 AI가 모듈/클래스명을 바꿔도 DI 코드는 무변경.

### Phase 8 — Contract Tests (Claude, substantive)

`tests/contract/conftest.py`:
```python
GOLDEN_DATASET = {              # 사내 AI에게도 동일 fixture를 사내 DB에 seed해달라 요구 (Adapter Spec 명시)
    "employees": {
        "99999": [               # 내 hold 3건 + 다른 사람 hold 1건이 섞인 환경에서 99999만 골라내는지
            {"lot_id": "L001", "status": "hold", "equipment": "EQ-A", "hold_comment": "test"},
            {"lot_id": "L002", "status": "hold", "equipment": "EQ-B", "hold_comment": None},
            {"lot_id": "L003", "status": "hold", "equipment": None, "hold_comment": "edge"},
        ],
        "88888": [{"lot_id": "L099", "status": "hold"}],     # 다른 사람 — 99999 결과에 섞이면 안 됨
    },
}

@pytest.fixture(params=["fake"])     # 사내 AI 합치면 params=["fake", "real"]
def lot_source(request) -> LotSource:
    if request.param == "fake":
        return InMemoryLotSource(seed=GOLDEN_DATASET)
    if request.param == "real":
        return _load_real("LotSource")
    raise NotImplementedError
```

`tests/contract/test_lot_source_contract.py` (Architect §5 fix):
```python
async def test_fetch_returns_dto_list(lot_source): ...
async def test_only_hold_status_for_caller(lot_source): ...
async def test_filters_out_other_employees_holds(lot_source):
    # 88888의 L099가 99999 결과에 섞이지 않는지 (Architect §5 fix #5: is_held_by_me 정직성)
    rows = await lot_source.fetch_my_holds("99999")
    assert all(r.is_held_by_me for r in rows)
    assert "L099" not in {r.lot_id for r in rows}

async def test_empty_employee_distinguishable_from_unknown(lot_source):
    # Architect §5 fix #1: empty trap 방지 — unknown은 NotSeeded raise (또는 명시적 sentinel)
    rows = await lot_source.fetch_my_holds("99999")
    assert len(rows) > 0   # golden dataset 존재 보장
    rows_unknown = await lot_source.fetch_my_holds("00000")
    assert rows_unknown == []

async def test_substantive_fields_populated(lot_source):
    # Architect §5 fix #2: 모든 필드 None trick 방지
    rows = await lot_source.fetch_my_holds("99999")
    assert any(r.equipment for r in rows)
    assert any(r.hold_comment for r in rows)

async def test_ordering_deterministic(lot_source):
    # Architect §5 fix #3: 순서 불변 (lot_id ASC 또는 updated_at DESC — 둘 중 하나로 spec 잠금)
    r1 = await lot_source.fetch_my_holds("99999")
    r2 = await lot_source.fetch_my_holds("99999")
    assert [x.lot_id for x in r1] == [x.lot_id for x in r2]

async def test_subscribe_multi_subscriber_no_loss(lot_source):
    # Architect §5 fix #4: 동시 다중 구독, replay 또는 fan-out
    # 한 employee_no에 두 iterator를 열고 3건 push, 둘 다 3건 받는지
    ...

# tests/contract/test_lot_repository_contract.py
async def test_upsert_lot_idempotent(lot_repo):
    # Architect §5 fix #6
    await lot_repo.upsert_lot(SAMPLE)
    await lot_repo.upsert_lot(SAMPLE)
    cached = await lot_repo.get_my_holds_cached("99999")
    assert len(cached) == 1
```

### Phase 9 — Adapter Spec 문서 (사내 AI 전달용)

`docs/adapter-spec.md` 신규:
1. **협업 모델 요약** (Port=Claude, Adapter=사내 AI, Contract Test=Claude 정의)
2. **명명 규약** (`app/adapters/real/{port_module}.py` + `Real{PortClass}`)
3. **각 Port 사양** (코드 + DTO + 행동 명세 + Contract Test 위치)
4. **Canonical 매핑 책임** (v3 추가):
   - `LotStatus`: 어댑터가 사내 status enum을 `{run, wait, hold}` 중 하나로 환원. `"hold"`는 severity=critical/메일/`is_held_by_me` 비교의 기준 상태 의미. 알 수 없는 값의 처리(bucket/필터/로그 정책)는 어댑터가 결정.
   - `AuthLevel`: 어댑터가 사내 권한 등급을 `{ENGINEER, ADMIN}` 두 가지로 환원. `"ADMIN"`은 타인 hold 해제 권한 보유 의미. 사내가 3종 이상 등급이면 어댑터가 매핑 규칙을 결정 (예: 사내 OPERATOR → ENGINEER로 환원).
   - 환원 정책은 어댑터 내부 의사결정. Use case는 canonical 값만 본다.
5. **사내 매핑 결정 위임**:
   - `is_held_by_me` 판정 시 사용할 사내 컬럼 비교 키 (사번 vs 이름 등) — 어댑터 자율
   - lot 데이터 소스 우선순위 (사내 REST API → 429 시 Python lib fallback)
   - 메일 SMTP 라이브러리 시그니처 (ai-prompts/260413-1430)
   - SSO OIDC 엔드포인트/JWKS/client_id/audience
6. **환경변수**: 사내 실 변수명 회신 요청 — `REPORT_BASE_URL` 등 (단, **report 기능은 MVP 범위 밖** — 사용자 요청 시 별도 Port 추가). VITE_DEMO_MODE 정식 채택 통보.
7. **GOLDEN_DATASET 시드 요청**: 사내 DB에 contract test용 fixture(99999/88888 사번 + 4 lot)를 어떤 ETL로 주입할지 결정 회신.
8. **미러 레포 빌드 검증 책임** (v3 추가): Claude는 `backend/Dockerfile` / `frontend/Dockerfile`에 `DOCKER_REGISTRY`, `PIP_INDEX_URL`, `PIP_TRUSTED_HOST`, `APT_MIRROR`, `NPM_REGISTRY_URL` ARG 통로만 만든다. 사내 미러 URL을 채운 상태에서 빌드 통과 검증은 사내 AI 책임 (외부에서 사내 미러 도달 불가).
9. **검수 절차**: `pytest tests/contract -k 'fake or real'` 통과 + `git diff origin/main -- app/domain app/usecases app/api` 빈 diff (CI gate).
10. **DTO 협상 절차**: 사내 컬럼/매핑 불일치 발견 시 Adapter Spec에 코멘트 → Claude가 DTO 수정 권한 보유 → Contract Test도 함께 업데이트.
11. **사내 AI 작업 명세** (v3 추가, T2 단계):
    - Real `LotSource` 어댑터 (사내 REST/DB → DTO 변환, polling+stream)
    - Real `LotRepository` 어댑터 (Pholex Postgres 저장/조회) + alembic DDL
    - Real `SsoVerifier` 어댑터 (사내 OIDC)
    - Real `MailSender` 어댑터 (사내 SMTP/라이브러리)
    - Contract test (fake + real 둘 다 동일 모음 통과)
    - 위 4개가 완성되어야 `ADAPTER_MODE=real`로 페이지에서 사내 데이터 표시 가능

### Phase 10 — Verification (실행 가능 명령 + CI gate)

**로컬 verification 명령**:
```bash
cd backend
pytest tests/contract                            # 모든 Port의 Fake 어댑터가 contract test 통과
pytest tests/usecases tests/domain               # use case + 도메인 단위 테스트
pytest tests/api                                 # WS wire format 회귀 검증
USE_FAKE_ADAPTERS=true DEV_SSO_BYPASS=true uvicorn app.main:app --reload
curl http://localhost:8000/api/lots/my-hold      # 99999 사번 hold 3건 SlotPayload 반환
# WS 핸드셰이크 → table_update 메시지 푸시 (docs/backend.md 포맷)
```

**AC 7 동치 체크리스트 (Critic §4)** — `VITE_DEMO_MODE=false` + backend Fake adapter:
- [ ] `/api/lots/my-hold` 응답이 `{tableId:1, rows: [3 items], diff:false, lastUpdated:<iso>}` 형식
- [ ] `LotHoldPanel`이 3행 표시 (Excel형 dense table)
- [ ] `status-pill--hold` CSS 클래스 적용 (Critical Red 좌측 3px indicator)
- [ ] `connectTableSocket({tableId:1})` 연결 성공, mock change event 1건이 wire에 `{type:"table_update"...}`로 도달
- [ ] 리프레시 버튼 클릭 시 `refresh=true`로 재호출, 캐시 invalidate

**CI gate (사내 AI Real adapter PR 머지 조건)**:
1. `pytest tests/contract -k 'fake or real'` 전부 통과
2. `git diff origin/main -- app/domain app/usecases app/api app/ports/dto.py` 빈 diff (Adapter invariance 강제)
3. `pytest tests/api/test_ws_wire_format.py` 통과 (wire format 회귀 방지)

---

### Phase 11 — Dev Stack (docker compose) (v3 신규)

> MVP는 dev 모드만 구현. Redis 제외(Fake adapter는 인메모리 broadcaster). Postgres 포함(사내 AI가 Real LotRepository 만들 때 baseline). beta/Swarm/SSL은 docs/infra.md에 설계만 남기고 미구현.

**산출물 (Claude):**
```
pholex/
├── docker-compose.yml              # base: backend + frontend + postgres
├── docker-compose.dev.yml          # dev 오버레이: 소스 마운트, --reload, HMR
├── backend/Dockerfile              # python:3.12-slim + ARG 통로
├── frontend/Dockerfile             # node:20-alpine + ARG 통로
├── docker/nginx/dev.conf           # /ws/ Upgrade + /api/ + / 프록시
├── .env.example                    # 모든 변수 템플릿 (default 빈 값 = 외부 인터넷)
└── scripts/deploy.sh               # up / --down 두 모드만
```

**Dockerfile ARG 통로** (Claude는 통로만, 사내 미러 URL 검증은 사내 AI):
- backend: `DOCKER_REGISTRY`, `PIP_INDEX_URL`, `PIP_TRUSTED_HOST`, `APT_MIRROR`
- frontend: `DOCKER_REGISTRY`, `NPM_REGISTRY_URL`
- 모든 ARG는 빈 값 default → 외부 인터넷 환경에서 그대로 빌드 통과 (Claude가 검증)

**Postgres 처리:**
- base compose에 포함, 항상 같이 뜸
- `pg_data_dev` named volume에 데이터 보존 (`--down`이 볼륨 삭제 안 함)
- **Claude는 schema/migration 안 만듦** — 빈 DB로 시작
- 사내 AI가 Real `LotRepository` 어댑터 만들면서 alembic으로 DDL 생성
- `ADAPTER_MODE=fake` (default)면 backend가 Postgres에 안 붙음 → 떠있어도 idle. 사내 AI가 `ADAPTER_MODE=real`로 바꾸면 그때 사용 시작.

**scripts/deploy.sh** (MVP는 두 모드만):
```bash
scripts/deploy.sh          # docker compose -p pholex-dev -f docker-compose.yml -f docker-compose.dev.yml --env-file .env.dev up -d --build
scripts/deploy.sh --down   # 위 -p/-f 동일 + down (볼륨 유지)
```

**docker/nginx/dev.conf** 핵심:
```nginx
location /ws/ {
    proxy_pass http://backend:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;
}
location /api/ { proxy_pass http://backend:8000; }
location /     { proxy_pass http://frontend:5173; }
```

**AC 11 — 수용 기준 (외부 환경, Claude 검증 가능):**
- [ ] `scripts/deploy.sh` → `pholex-dev` 스택 up. backend/frontend/postgres 3개 컨테이너 healthy.
- [ ] `localhost:8080` 접속 → frontend 렌더링, WebSocket으로 골든 데이터셋 3건 표시 (Fake adapter, `ADAPTER_MODE=fake`)
- [ ] `scripts/deploy.sh --down` → 컨테이너 종료, `pg_data_dev` 볼륨은 유지
- [ ] 모든 ARG 빈 값으로 빌드 성공 (외부 Docker Hub/PyPI/npm 사용)

**AC 11.사내 — 사내 환경 (사내 AI 검증 책임, Claude 외부에서 검증 불가):**
- [ ] `.env.dev`에 사내 미러 URL 채운 상태로 빌드 성공
- [ ] Real adapter 4개 + alembic + Contract test 통과 후 `ADAPTER_MODE=real`로 사내 데이터 페이지 표시

---

### 사내 deployment 체크리스트 (사용자 직접 작업 분담)

```
[T1] Claude 작업 완료 시점
  - 사용자가 레포를 사내로 가지고 감
  - .env.dev 에 사내 ARG (DOCKER_REGISTRY, PIP_INDEX_URL, NPM_REGISTRY_URL, APT_MIRROR 등) 채움
  - scripts/deploy.sh
  - localhost:8080 → 페이지 동작, 골든 데이터셋 3건 표시 (Fake 모드)
  - ❌ 사내 lot 데이터는 아직 안 보임 (Real adapter 없음)

[T2] 사내 AI 작업 (Claude 영역 밖)
  - app/adapters/real/{lot_source,lot_repository,sso_verifier,mail_sender}.py 작성
  - alembic 마이그레이션 (Real LotRepository용 DDL)
  - GOLDEN_DATASET 동치 fixture를 사내 DB에 시드 (contract test용)
  - pytest tests/contract -k 'fake or real' 전부 통과 확인
  - git diff CI gate 통과 확인 (app/domain/usecases/api/ports/dto.py 무변경)

[T3] T2 머지 후
  - 사용자가 .env.dev 에 ADAPTER_MODE=real (또는 USE_FAKE_ADAPTERS=false) 설정
  - 사내 OIDC/SMTP 환경변수 채움
  - scripts/deploy.sh --down && scripts/deploy.sh
  - ✅ 사내 lot 데이터 페이지 표시
```

**사용자 책임 = T1·T3의 환경변수 설정.** 사내 DB에 SQL 직접 부을 일은 없음 — Real `LotSource` 어댑터가 사내 REST/DB → Pholex Postgres로 ETL 수행.

---

## ADR

**Decision**: Backend MVP를 Hexagonal **Port-by-External-System** (Option A) 구조로 구현. Claude는 Port + DTO + Fake Adapter + Contract Test + DI wiring + API/WS 매핑을 모두 작성. 사내 AI는 `app/adapters/real/{port_module}.py`에 `Real{PortClass}`만 구현. Use case는 의도적으로 가볍게 유지(합성·캐시·트랜잭션·severity 결정만 담당) — 비즈니스 필터(예: `fetch_my_holds`의 employee_no 필터)는 Port 시그니처와 Contract Test로 잠금.

**Drivers**: 사내/Claude 비대칭 협업 가능성; 통합 회귀 위험 최소화 + 책임 추적; MVP e2e 속도.

**Alternatives Considered**:
- Vertical Slice → 분담 경계 사라짐 (Non-Goal)
- Coarse Repository + Service Bus → 사내 발주 분할 어려움, 규모 미스매치
- Layered (전통) → services 안 외부 호출 묻힘, 분담 경계 사라짐
- Layered + Explicit Gateway → Gateway가 services와 같은 모듈 트리 → 사내 AI 코드 노출 면적 증가

**Why Chosen**: Port-per-external-system이 사내 AI 발주 단위 + Contract Test 분리 + 회귀 추적의 세 측면 모두에서 최적. 사내 AI 작업 면적이 `app/adapters/real/`로 완전 격리되어 코드 노출 최소.

**Consequences**:
- (+) Fake만으로 backend e2e 완성 (frontend VITE_DEMO_MODE와 짝)
- (+) 사내 발주 분할 쉬움 (Port별)
- (+) Real 통합 시 도메인/UC/API 코드 무변경 (CI gate로 강제)
- (−) Port 수 6개 (DI wiring 코드량 증가). 명명 규약으로 dynamic import 처리해 *DI 코드*는 사내 명명 변경에 영향 없음.
- (−) Use case가 의도적으로 얇아 보임 — 실제로는 합성·트랜잭션·severity 결정 책임 보유. ADR에 *의식적 설계*임을 명시.
- (−) DTO 첫 정의가 사내 컬럼/enum 불일치 시 조정 필요 → DTO 협상 절차(Phase 9 #8)로 비용 측정·제한.

**Follow-ups**:
1. `docs/adapter-spec.md` 작성 후 사내 AI에 전달 → 컬럼명·enum 회신 → DTO 미세 조정.
2. Frontend `useMyHoldTable.ts`의 `DEMO_ROWS` 정리 (`run/wait/hold`만, `review`/`release-pending` 제거) — AC 7 동치 전제.
3. `REPORT_BASE_URL` 기능은 MVP 외 — 추후 `ReportPublisher` Port로 추가.
4. Redis pub/sub 실제 사용은 Real adapter 시점 (Fake는 in-memory).
5. Alembic 마이그레이션은 사내 AI 영역 (Real LotRepository 작성 시 함께).
6. 슬롯 [0], [2]~[5]는 MVP 후 — 새 유스케이스/Port가 필요하면 동일 패턴.

### Follow-up: Column Customization 확장 경로 (v3 추가)

**MVP (현재 plan):** `LotRowDTO` 7필드 정적. visibility/ordering은 frontend localStorage + TanStack Table API.

**확장 1 — 컬럼 visibility/ordering 서버 동기화** (다른 기기에서도 동일 설정):
- 새 Port: `UserPreferencesRepository`
- 새 DTO: `ColumnPrefDTO { table_id, visible_columns: list[str], column_order: list[str] }`
- 새 REST: `GET/PUT /api/user/preferences`
- Port-by-External-System 패턴 그대로 적용

**확장 2 — 사내 컬럼 점진적 추가** (예: 사내 테이블에 `priority` 컬럼 신설):
- 절차: Claude PR (DTO에 필드 추가) → 사내 AI PR (Adapter 매핑 갱신) → Frontend PR (컬럼 정의 추가)
- 각 PR 독립 작업 가능 (병렬화)
- 컬럼 5~10개 추가까진 정적 DTO 유지
- 컬럼 30개 초과 시 *별도 ADR로 결정* — "필드 그룹" 패턴 검토 (`core_fields` always sent + `extended: dict[str, Any]` opt-in)
- MVP에서 결정 안 함

**확장 3 — 슬롯별 다른 컬럼 세트** (`tableId=1, 2, 3...`):
- 슬롯마다 별개 DTO (`LotRowDTOSlot1`, `LotRowDTOSlot2`...)
- 슬롯마다 별개 `SlotPayload` + 별개 use case
- 슬롯 추가가 다른 슬롯에 영향 없는 것이 hexagonal의 자연 이점

**왜 동적 dict DTO를 MVP에서 피하나:**
- `extra="forbid"` + 닫힌 Literal 잠금이 contract test 강도와 wire format 회귀 방지의 핵심
- 동적 dict로 전환은 타입 안전성·도메인 의미·매핑 오류 가시성을 모두 잃음
- 압박이 *심해진* 시점(컬럼 30개 초과)에서 별도 ADR로 의식적 결정
