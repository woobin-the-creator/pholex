# Adapter Spec — 사내 AI 작업 명세

> 본 문서는 Pholex MVP의 **Real adapter 4종**을 사내 AI가 구현할 때 따라야 할 사양이다.
> 도메인/Port/DTO는 외부(Claude)가 정의했고, 사내 AI는 이 사양을 만족하는 adapter를
> `backend/app/adapters/real/` 아래에 작성한다.
>
> **별개 작업 — 30분 dump 잡**: 사내 스케줄러가 `lot_status`·`lot_dump_meta`를 30분마다
> 적재하는 **레포 바깥 배치 잡**은 본 문서가 아니라 [`docs/dump-job-spec.md`](dump-job-spec.md)를 따른다.
> (본 문서 = 앱 내부 실시간 adapter, dump-job-spec = 앱 밖 배치 ETL. 접점: dump가 채운 `lot_status`를
> `RealLotRepository` 캐시 fallback이 읽음.)

---

## 0. 시작 가이드 (사내 AI용)

처음 본 사람이라도 다음 순서로 따라가면 작업 시작 지점을 알 수 있다.

> **배포·검증·운영 장애 대응 전에는 [`docs/troubleshooting.md`](troubleshooting.md)를 먼저 읽는다.** 500·SSO 리디렉션 루프·prod가 fake로 뜸·dev DB 초기화·node_modules·postgres 연결 등은 이미 해결된 증상이 많다. 추측 대신 런북의 수정안을 적용한다.

1. **현재 상태 확인**
   - `ADAPTER_MODE=fake`로 `scripts/deploy.sh` 실행 → 골든 데이터셋 3행이 페이지에 표시되는지 확인
   - `cd backend && pytest` → 53/53 통과 확인
2. **Port 시그니처 읽기** (이게 계약 그 자체)
   - `backend/app/ports/lot_source.py`
   - `backend/app/ports/lot_repository.py`
   - `backend/app/ports/sso_verifier.py`
   - `backend/app/ports/mail_sender.py`
   - `backend/app/ports/dto.py` (필드명/타입 = wire format 결정)
3. **Fake 어댑터를 참고 구현으로 사용**
   - `backend/app/adapters/fake/*.py` — 같은 Port를 만족하는 가장 단순한 구현
   - golden_dataset.py가 contract test의 기대 입력
4. **본인 작업**
   - `backend/app/adapters/real/{lot_source,lot_repository,sso_verifier,mail_sender}.py` 4개 작성
   - alembic 마이그레이션 (RealLotRepository용 DDL)
   - 사내 dev Postgres에 golden_dataset 동치 fixture 시드
   - `backend/tests/contract/conftest.py`의 `ADAPTER_PARAMS`를 `["fake", "real"]`로 확장
5. **검수**
   - `pytest backend/tests/contract -k 'fake or real'` 통과
   - §9의 CI gate 통과 (`git diff origin/main -- backend/app/{domain,usecases,api,ports}` 빈 diff)
   - `.env.dev`에 `ADAPTER_MODE=real` 설정 → 페이지에서 사내 데이터 표시 시작

핵심 원칙: **Port를 만족하는 한, 내부 구현 방식은 사내 AI 자율.** 컬럼명, SQL, ETL 방식, 사내 라이브러리 호출 — 모두 어댑터 내부 결정 사항.

---

## 1. 협업 모델 요약

| 구분 | 작성자 | 위치 |
|------|--------|------|
| 도메인 (`LotStatus`, `SessionUser` 등) | Claude | `backend/app/domain/` |
| Port + DTO | Claude | `backend/app/ports/` |
| Fake adapter | Claude | `backend/app/adapters/fake/` |
| **Real adapter** | **사내 AI** | **`backend/app/adapters/real/`** |
| Contract test | Claude (정의) → 사내 AI (extend) | `backend/tests/contract/` |
| Use case / API / WS | Claude | `backend/app/usecases/`, `backend/app/api/` |
| DI container | Claude | `backend/app/di/` |
| alembic 마이그레이션 | 사내 AI | (사내 AI 결정) |

**핵심 invariant**: 사내 AI는 `app/domain/`, `app/usecases/`, `app/api/`, `app/ports/` 전체를 변경하지 않는다.
CI gate가 이 invariant를 강제한다 (§9 참조). Port 시그니처 변경이 필요한 경우 Claude의 별도 PR로 분리한다.

---

## 2. 명명 규약

DI 컨테이너는 다음 규약대로 `importlib`로 동적 로드한다 (`backend/app/di/container.py`의 `ADAPTER_NAMING`).

| Port           | 파일 (`backend/app/adapters/real/...`) | 클래스명             |
|----------------|----------------------------------------|---------------------|
| `LotSource`    | `lot_source.py`                        | `RealLotSource`     |
| `LotRepository`| `lot_repository.py`                    | `RealLotRepository` |
| `MailSender`   | `mail_sender.py`                       | `RealMailSender`    |
| `SsoVerifier`  | `sso_verifier.py`                      | `RealSsoVerifier`   |

규약을 어기면 `ADAPTER_MODE=real`로 부팅 시 `ImportError` 또는 `AttributeError`로 실패한다.

---

## 3. 각 Port 사양

### 3.1 `LotSource` (`backend/app/ports/lot_source.py`)

```python
class LotSource(Protocol):
    async def fetch_my_holds(self, employee_number: str) -> list[LotRowDTO]: ...
    def subscribe_changes(self, employee_number: str) -> AsyncIterator[LotChangeEventDTO]: ...
```

**행동 명세** (Contract test로 검증, `backend/tests/contract/test_lot_source_contract.py`):

- `fetch_my_holds`
  - 반환된 모든 row의 `status == "hold"`
  - 반환된 모든 row의 `is_held_by_me == True`
  - 사번이 다른 사용자의 hold가 결과에 섞이면 **안 됨**
  - 미등록 사번은 `[]` 반환 (raise 금지)
  - 정렬: `lot_id` ASC (deterministic)
  - 동일 사번 반복 호출 = 동일 결과 (idempotent)

- `subscribe_changes`
  - 다중 구독자 fan-out (같은 사번 두 iterator → 동일 이벤트 전달)
  - `event_id`는 source 내 unique + 시간 순서 정렬 가능
  - `previous_status` / `new_status` 채움 (severity 분류용)
  - **real 구현 확정 (2026-06-22)**: 30분 dump가 별도 프로세스라 in-memory fan-out 불가 → Postgres `lot_change_event` outbox를 dump가 적재하고 `subscribe_changes`가 backfill+tail로 읽는다. 사양: [`ai-prompts/260622-1253-alarm-outbox-lot-change-event.md`](../ai-prompts/260622-1253-alarm-outbox-lot-change-event.md). (severity는 어댑터가 채우지 않고 usecase `stream_hold_changes.py`가 분류 — 변동 없음.)

### 3.2 `LotRepository` (`backend/app/ports/lot_repository.py`)

```python
class LotRepository(Protocol):
    async def upsert_lot(self, row: LotRowDTO) -> None: ...
    async def upsert_lots_batch(self, rows: list[LotRowDTO]) -> None: ...  # 전부 또는 전무
    async def get_my_holds_cached(self, employee_number: str) -> list[LotRowDTO] | None: ...
    async def cache_my_holds(self, employee_number: str, rows: list[LotRowDTO]) -> None: ...
    async def invalidate_cache(self, employee_number: str) -> None: ...
    async def get_dump_last_run_at(self) -> datetime | None: ...   # 슬롯1 신선도 (2026-06-17)
```

- `get_my_holds_cached` 반환 `None` ↔ **cache miss** (key 부재)
- `get_my_holds_cached` 반환 `[]` ↔ **정상 빈 결과** (둘은 구분되어야 함)
- `upsert_lots_batch`는 **단일 트랜잭션**으로 적용 (부분 실패 금지)
- `get_dump_last_run_at`: `lot_dump_meta.last_run_at`(dump 마지막 실행 시각, **tz-aware UTC**). 미실행 시 `None`, employee 무관 **전역값**. Real: `SELECT last_run_at FROM lot_dump_meta WHERE id = 1`. 슬롯1 신선도 신호등(🟢≤30·🟡30~60·🔴>60분)의 소스 — 프론트가 이 타임스탬프로 색·경과시간 계산

### 3.3 `MailSender` (`backend/app/ports/mail_sender.py`)

```python
class MailSender(Protocol):
    async def send(self, *, to: str, subject: str, body: str) -> MailSendResult: ...
```

- `send`는 **raise하지 않음**. 실패는 `MailSendResult(success=False, error=...)`로 반환.
  (사내 메일 라이브러리가 raise하면 어댑터 내부에서 catch + 결과 객체로 변환.)
- 호출자(use case)는 결과 boolean으로 분기 (`ai-prompts/archived/260413-1430-send-mail-return-value-check.md` 참조)

### 3.4 `SsoVerifier` (`backend/app/ports/sso_verifier.py`)

```python
class SsoVerifier(Protocol):
    async def init_login(self, return_url: str) -> str: ...
    async def verify_callback(self, code: str, state: str) -> SsoIdentityDTO: ...
    async def verify_session_token(self, token: str) -> SsoIdentityDTO: ...
```

- `verify_session_token`은 빈/위조 토큰에 대해 `PermissionError` raise
- `dev_bypass`는 Port에 노출되지 않는다 — Fake adapter 내부 정책 (개발 환경에서만 DI가 Fake 주입)

> **보안 가드 (Real 구현 필수)**: MVP의 Fake는 세션 쿠키 값으로 `employee_number` 평문을 사용한다 (`backend/app/api/auth.py:_session_token_for`). Real `SsoVerifier`로 전환할 때 **반드시** 다음 중 하나로 교체해야 한다 — 그렇지 않으면 사내 누구나 동료 사번을 알면 그 동료로 위장 가능:
> - 서명된 JWT (`SECRET_KEY` 사용, 만료시각 + employee_number claim)
> - 또는 random UUID 토큰 + Postgres/Redis lookup
>
> 교체 위치: `_session_token_for()` (생성) + `RealSsoVerifier.verify_session_token()` (검증). 이 가드 통과 전에는 `SESSION_COOKIE_SECURE=true` + `DEV_SSO_BYPASS=false`로 beta 배포 금지.

---

## 4. Canonical 매핑 책임 (어댑터 자율)

도메인은 canonical 값만 안다. 사내 시스템의 실제 enum/컬럼명을 canonical로 환원하는 책임은 어댑터에 있다.

### 4.1 LotStatus 환원

도메인 canonical: `{"run", "wait", "hold"}` (closed set)

- `"hold"`의 **의미적 정의**: severity=critical 트리거, 메일 발송 조건, `is_held_by_me` 비교의 기준 상태.
- 사내 status enum이 `{"run", "wait", "hold"}` 외 값을 포함하는 경우, 어댑터가 환원 규칙을 결정:
  - 예: 사내 `"PAUSE"` → `"wait"`로 묶기
  - 예: 사내 `"REVIEW"` → `"wait"`로 묶기, 별도 표시 필요 시 추후 도메인 enum 확장
- 알 수 없는 값의 처리 정책(bucket / filter / log warning)은 어댑터가 결정.
- 환원 후 DTO에 채울 때는 반드시 `"run"`, `"wait"`, `"hold"` 셋 중 하나여야 한다 (DTO `extra="forbid"` + Literal로 잠금).

### 4.2 AuthLevel 환원

도메인 canonical: `{"ENGINEER", "ADMIN"}`

- `"ADMIN"`의 의미: **타인 hold 해제 권한 보유**
- 사내 권한 등급이 3종 이상이면 어댑터가 두 가지로 환원:
  - 예: 사내 `"OPERATOR"` → `"ENGINEER"`, 사내 `"MANAGER"` → `"ADMIN"`
- 환원 정책은 어댑터 내부. Use case는 canonical 값만 본다.

### 4.3 `is_held_by_me` 판정

- 어댑터가 사내 hold 테이블에서 hold operator의 식별자(사번/이름/email 등)를 가져와 호출자 사번과 비교
- 비교 키는 어댑터 자율 (사번 BIGINT? 이름 VARCHAR? 어댑터가 결정)
- DTO에는 boolean으로만 노출

---

## 5. 사내 매핑 결정 위임

다음은 어댑터가 자체적으로 결정한다. Claude는 결정에 관여하지 않는다:

- 사내 lot 테이블 컬럼명/타입
- Lot 데이터 소스 우선순위 (사내 REST API → 429 시 Python lib fallback)
- 메일 SMTP 라이브러리 시그니처 (`ai-prompts/archived/260413-1430-send-mail-return-value-check.md`)
- SSO OIDC 엔드포인트/JWKS/`client_id`/audience 설정값 출처

---

## 6. 환경변수

`.env.example`에 모든 변수가 템플릿으로 들어 있다. 사내 AI는 사내 운영 변수명에 맞춰 매핑하거나 `.env.dev`에 실제 값을 채운다.

| 변수 | 용도 | Claude 결정 | 사내 AI 결정 |
|------|------|------------|--------------|
| `ADAPTER_MODE` | `fake` / `real` 토글 | 변수명 고정 | `.env.dev`에 값 설정 |
| `DEV_SSO_BYPASS` | dev SSO 우회 | 변수명 고정 | dev/beta 따라 설정 |
| `DATABASE_URL` | Pholex Postgres | 변수명 고정 | 사내 DB 접속 정보 |
| `DOCKER_REGISTRY` 등 | 미러 레포 | 변수명 고정 | 사내 미러 URL |
| `SSO_*` (추가) | 사내 OIDC | 사내 AI가 자율 추가 | 변수명 + 값 결정 |
| 메일 SMTP | 사내 SMTP | 사내 AI가 자율 추가 | 변수명 + 값 결정 |

**MVP 범위 밖**: `REPORT_BASE_URL` 기능은 별도 `ReportPublisher` Port로 추후 추가 (MVP에 포함하지 않음).

---

## 7. GOLDEN_DATASET 시드 요청

Contract test는 다음 fixture가 사내 DB에 시드되어 있다고 가정한다:

```
employee 99999 → 3 holds: LOT-A2948, LOT-B1175, LOT-C3320
employee 88888 → 1 hold: LOT-X9999
```

자세한 row 데이터는 `backend/app/adapters/fake/golden_dataset.py` 참조.

**사내 AI 작업**:
1. 사내 dev DB에 위 fixture를 시드하는 ETL/스크립트 작성
2. Contract test 실행 시 `ADAPTER_PARAMS = ["fake", "real"]`로 확장 (`backend/tests/contract/conftest.py`)
3. `real` 분기에 `RealLotSource()` 등 생성하는 fixture 추가

---

## 8. 미러 레포 빌드 검증 책임

Claude는 `backend/Dockerfile`, `frontend/Dockerfile`에 다음 ARG 통로만 만들었다:

- `DOCKER_REGISTRY` (이미지 prefix)
- `PIP_INDEX_URL`, `PIP_TRUSTED_HOST` (pip 미러)
- `APT_MIRROR` (apt 미러)
- `NPM_REGISTRY_URL` (npm 미러)

모든 ARG는 빈 값 default. Claude는 **외부 인터넷 환경에서 빈 ARG로 빌드 통과**까지만 검증한다 (Docker Hub / PyPI / npm 공식 레포).

**사내 AI 작업**:
1. `.env.dev`에 사내 미러 URL을 채운 상태로 `scripts/deploy.sh` 실행
2. backend / frontend 컨테이너 빌드가 사내 미러를 통해 패키지를 다운로드 받는지 확인
3. 실패 시 Dockerfile의 ARG 처리 로직 또는 미러 URL 수정 (Dockerfile 자체는 Claude PR 없이 사내 AI가 수정 가능 — `app/domain`/`app/usecases`/`app/api`/`app/ports/dto.py`만 CI gate 대상)

---

## 9. CI gate (Real adapter PR 머지 조건)

사내 AI의 PR이 머지되려면 다음을 통과해야 한다:

### 9.1 Contract test (Fake + Real 동일 모음 통과)

```bash
cd backend
pytest tests/contract  # ADAPTER_PARAMS = ["fake", "real"] 확장 후
```

### 9.2 Adapter invariance (도메인/UC/API/Port 무변경)

```bash
git diff origin/main -- \
  backend/app/domain \
  backend/app/usecases \
  backend/app/api \
  backend/app/ports
# 빈 diff여야 함
```

`app/ports/` 전체를 포함한다 — DTO뿐 아니라 **Port 시그니처(Protocol 메서드, 인자, 반환 타입)도 사내 AI PR에서 무변경**이어야 한다. Port 시그니처 변경은 Claude의 별도 PR로 분리한다.

이 invariant가 깨지면 Real adapter PR이 도메인 또는 wire format 또는 Port boundary를 침범한 것 — 별도 Claude PR로 해당 변경을 분리해야 한다.

### 9.3 Wire format 회귀 방지

```bash
pytest backend/tests/api/test_ws_wire_format.py
```

REST `/api/lots/my-hold` 응답과 WS `table_update` 페이로드의 키가 frontend 기대(camelCase: `lotId`, `processStep`, `holdComment`, `updatedAt`, `tableId`, `lastUpdated`)와 동치임을 보장.

---

## 10. DTO 협상 절차

사내 컬럼/매핑 불일치를 발견한 경우:

1. 사내 AI가 본 문서 또는 PR 코멘트에 발견 사항 기록
2. Claude가 `app/ports/dto.py` 수정 (필드 추가/타입 변경)
3. 함께 변경되어야 하는 것:
   - Contract test (`backend/tests/contract/`)
   - Wire format 매핑 (`backend/app/api/wire.py`)
   - Wire format 회귀 테스트 (`backend/tests/api/test_ws_wire_format.py`)
   - Frontend 타입 (`frontend/src/types/lot.ts`)
4. 변경 후 사내 AI가 adapter 매핑 갱신

**열려 있는 것**: DTO 확장 (필드 추가). 사내 컬럼이 점진적으로 늘어나면 동일 절차로 처리.
**열려 있지 않은 것**: DTO 동적 dict 전환은 별도 ADR로 결정 (MVP 결정 아님).

---

## 11. 사내 AI 작업 명세 (T2 단계)

`사내 deployment 체크리스트 T2 단계` (plan v3 Phase 11 §사내 deployment 체크리스트).

다음 4개 어댑터를 모두 작성해야 사내 데이터가 페이지에 표시된다:

- [ ] `app/adapters/real/lot_source.py` → `RealLotSource` (사내 REST/DB → DTO 변환, polling + stream). **(2026-06-17)** 실시간 API 미구현 → MVP는 `fetch_my_holds`가 `lot_status`에서 hold를 읽음 (`WHERE lot_hold_user_id=:사번 AND lot_status_seg='Hold'`, reference `pg_lot_source.py`). 실시간 API 생기면 이 어댑터만 교체.
- [ ] `app/adapters/real/lot_repository.py` → `RealLotRepository` (Pholex Postgres SQLAlchemy async). **신선도** `get_dump_last_run_at` → `SELECT last_run_at FROM lot_dump_meta WHERE id=1` 구현 추가.
- [ ] `app/adapters/real/sso_verifier.py` → `RealSsoVerifier` (사내 OIDC)
- [ ] `app/adapters/real/mail_sender.py` → `RealMailSender` (사내 SMTP/메일 라이브러리)
- [ ] alembic migration 디렉터리 + 초기 마이그레이션 (`RealLotRepository` 테이블 DDL)
- [ ] Contract test `ADAPTER_PARAMS = ["fake", "real"]`로 확장
- [ ] 사내 dev Postgres에 GOLDEN_DATASET 동치 fixture 시드

위 항목 전부 완료 + CI gate 통과 + `.env.dev`에 `ADAPTER_MODE=real` 설정 → 페이지에서 사내 데이터 표시 시작.
