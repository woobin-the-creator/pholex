# Deep Interview Spec: Pholex MVP — Hexagonal (Ports & Adapters) 아키텍처

## Metadata
- Interview ID: pholex-mvp-hex-2026-05-26
- Rounds: 5
- Final Ambiguity Score: 7.9%
- Type: brownfield
- Generated: 2026-05-26
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.333 |
| Constraint Clarity | 0.92 | 0.25 | 0.230 |
| Success Criteria | 0.92 | 0.25 | 0.230 |
| Context Clarity | 0.85 | 0.15 | 0.128 |
| **Total Clarity** | | | **0.921** |
| **Ambiguity** | | | **7.9%** |

## Goal

Pholex MVP를 **Hexagonal (Ports & Adapters)** 아키텍처로 설계하여, Claude(도메인 / 유스케이스 / UI 담당)와 사내 AI(외부 시스템 어댑터 전체 담당)의 비대칭 협업이 가능하도록 한다.

- Claude는 Port 인터페이스, DTO, Mock Adapter, Contract Test를 정의·작성한다.
- 사내 AI는 비공개 사내 데이터/스키마/실제 코드를 보면서 그 Port 시그니처에 맞춰 실제 어댑터를 구현하고, Contract Test 통과 여부로 자체 검증한다.
- 통합 시점에는 DI에서 Mock → 실제 어댑터로 교체만 하면 끝나며, 도메인/유스케이스/UI 코드는 변경되지 않는다.

## Constraints

- 사내 데이터/스키마/실제 코드는 Claude에 비공개 (외부 AI 정책).
- 사내 데이터를 직접 다루는 코드는 사내 AI로만 개발한다.
- 사내 AI가 작성한 어댑터 구현체는 Claude에 공유되지 않는다 (디렉토리 구조 수준만 공유).
- **인터페이스/DTO/Contract Test의 정의권은 Claude가 보유**한다. 사내 AI는 그 계약에 따라 구현만 한다.
- MVP 범위는 `docs/mvp.md` 기준: 슬롯 [1] "내 lot hold" 단일 슬롯. 그 외 슬롯은 placeholder UI만.
- 기존 docs 확정 기술 스택은 유지: React + Vite + Jotai / FastAPI + SQLAlchemy(async) + Alembic / PostgreSQL + Redis / Docker Compose(MVP) → Swarm(확장 후) / OIDC SSO (DEV_SSO_BYPASS 우회 가능).
- Frontend는 이미 ~40% 구현되어 있으며, 현 a4a3977 커밋의 `VITE_DEMO_MODE`는 정식 채택하여 Backend Mock Adapter의 frontend 측 대응물로 사용한다.

## Non-Goals

- **Vertical Slice Architecture**: 한 슬라이스 안에 Claude 코드와 사내 AI 코드가 혼재되어 분담 경계가 사라지므로 채택하지 않는다.
- **Frontend의 Hexagonal 패턴화**: 본 spec은 Backend 한정. Frontend는 기존 Jotai atom 구조 유지.
- 슬롯 [0], [2]~[5] 구현 (MVP 외 범위, placeholder만).
- 사내 데이터를 Claude가 직접 다루는 코드.
- 인터페이스 변경 권한을 사내 AI에게 위임하는 것 (도메인 요구가 인터페이스를 끌고 가야 함).
- ORM 모델을 도메인 모델로 그대로 노출하는 것 (사내 컬럼명/enum은 어댑터 내부에서만 매핑).

## Acceptance Criteria

- [ ] Backend 디렉토리 구조가 다음 계층으로 명확히 분리되어 있다: `domain/`, `usecases/`, `ports/`, `adapters/fake/`, `adapters/real/`(빈 placeholder), `api/`, `di/`, `tests/contract/`.
- [ ] 외부 시스템별 Port 인터페이스 정의가 완료되어 있다: `LotSource`, `LotRepository`, `MailSender`, `SsoVerifier` (필요 시 추가).
- [ ] 각 Port에 대응하는 DTO/Pydantic schema가 정의되어 있다. 사내 컬럼명·enum 값은 어댑터 내부에서만 매핑되고, 도메인/유스케이스/UI는 DTO만 본다.
- [ ] 각 Port에 대해 Claude가 작성한 **Fake/InMemory Adapter** 구현이 존재하며, dev 환경 + 테스트에서 동작한다.
- [ ] 각 Port에 대해 Claude가 작성한 **Contract Test**가 존재한다. Fake Adapter는 이 테스트를 통과한다. 사내 AI가 작성한 Real Adapter도 동일한 Contract Test를 통과해야 한다.
- [ ] DI Container(FastAPI Depends)에서 Fake ↔ Real 어댑터를 단일 환경변수/설정으로 교체 가능하다.
- [ ] Fake Adapter만으로 슬롯 [1] "내 lot hold" 유스케이스 + REST endpoint(`GET /api/lots/my-hold`) + WebSocket(`/ws`) + 인증 플로우(DEV_SSO_BYPASS) 전체가 동작한다. 즉, 현재의 `VITE_DEMO_MODE` 프론트 동작과 동치인 Backend 전체가 사내 코드 없이 완성된다.
- [ ] 사내 AI에게 전달할 **Adapter Spec 문서**가 작성되어 있다. 포함 내용: Port 인터페이스, DTO, Contract Test 위치/실행법, 환경변수 목록, 미해결 항목(`hold_operator_id` 컬럼명, 사내 메일 변수명, `lot_status.status` enum 등).
- [ ] 사내 AI가 Real Adapter를 구현해서 합쳤을 때, Contract Test 재실행과 DI 설정 변경만으로 통합이 완료되어야 한다 (도메인/유스케이스/UI/API/WebSocket 코드 무변경).

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| 아키텍처 = 기술 스택 선택 | docs/에 이미 결정됨 | "코드 조직 패턴(Clean/VS/Hexagonal/Layered) 중 선택" 문제로 재정의 |
| MVP니까 단순 layered면 충분 | 사내 / Claude 이중 개발 환경 제약 존재 | 협업 인터페이스 안정성이 단순성보다 큰 가치 → Hexagonal 채택 |
| Vertical Slice도 후보 | 슬라이스에 사내/Claude 코드 혼재 시 분담 경계 사라짐 | Non-Goal로 명시 |
| 사내 데이터 = 완전 blackbox (Contrarian) | 인터페이스마저 비공개면 협업 불가능 | 인터페이스/DTO/Contract Test = Claude, 어댑터 구현체만 = 사내 AI |
| 사내 AI 자체 테스트로 신뢰 가능 | 시그니처가 맞아도 동작이 어긋날 수 있음 | Claude가 작성한 Contract Test로 검증 (시그니처 + 행동 모두) |
| 사내 ORM 모델을 도메인 모델로 재사용 | 사내 컬럼/enum 변경이 도메인을 흔든다 | 도메인은 DTO/Port만 본다. 사내 매핑은 어댑터 내부 비밀 |

## Technical Context

- 기존 docs 6개(overview / backend / frontend / infra / auth / mvp / onprem-setup)는 유지. 본 spec은 **코드 조직 측면에서만** docs의 layered 구조 암시(routers / services / repositories)를 Hexagonal로 재해석한다.
- `docs/backend.md`의 엔드포인트 목록·메시지 스키마는 그대로 보존. 다만 endpoint는 얇은 transport 계층(`api/`)으로 강등되고, 비즈니스 로직은 `usecases/`로 이동한다.
- ai-prompts/ 의 미해결 4건은 본 spec 채택 시 **Adapter Spec 문서**로 통합되어 사내 AI에게 일괄 전달한다.
- 제안 디렉토리 구조:

```
backend/
  app/
    domain/                   # 엔티티, 값 객체, 도메인 규칙 (사내 비종속)
      lot.py
      hold.py
    usecases/                 # application service = "내 hold 조회", "변경 푸시" 등
      fetch_my_holds.py
      stream_hold_changes.py
    ports/                    # 추상 인터페이스 (Protocol/ABC) + DTO
      lot_source.py
      lot_repository.py
      mail_sender.py
      sso_verifier.py
      dto.py
    adapters/
      fake/                   # Claude 작성: InMemory, mock data, dev/test 용
        in_memory_lot_source.py
        in_memory_lot_repository.py
        fake_mail_sender.py
        fake_sso_verifier.py
      real/                   # 사내 AI 작성 영역 (빈 placeholder)
        README.md
    api/                      # FastAPI router, WebSocket (얇은 transport)
      lots.py
      auth.py
      ws.py
    di/                       # DI wiring (Fake/Real 토글)
      container.py
    config.py                 # 환경변수 (USE_FAKE_ADAPTERS, DEV_SSO_BYPASS 등)
    main.py
  tests/
    domain/                   # 도메인 unit test
    usecases/                 # usecase test (Fake adapter 사용)
    contract/                 # Port 계약 test (모든 adapter가 통과해야 함)
      test_lot_source_contract.py
      test_lot_repository_contract.py
      test_mail_sender_contract.py
      test_sso_verifier_contract.py
  alembic/                    # 마이그레이션은 사내 AI 영역
```

- DI 토글 예시: `USE_FAKE_ADAPTERS=true`(기본 dev) → Fake 등록, `false`(beta/prod) → Real 등록.
- Contract Test는 pytest fixture로 "주어진 어댑터 인스턴스"를 받아 동일한 시나리오를 돌리는 방식. Fake / Real 양쪽이 같은 테스트 모음을 통과해야 한다.

## Ontology (Key Entities)

| Entity | Type | Fields / Examples | Relationships |
|--------|------|---------------------|---------------|
| Hexagonal Pattern | core | Ports & Adapters | 코드 조직의 최상위 결정 |
| Port | core | LotSource, LotRepository, MailSender, SsoVerifier | Domain이 소유, Adapter가 구현 |
| DTO | core | LotRowDTO, SessionDTO | Port의 in/out 타입 |
| Adapter | core | Fake (Claude), Real (사내 AI) | Port의 다중 구현 |
| Domain | core | Lot, Hold, Status enum | Port에만 의존 |
| Usecase | core | FetchMyHolds, StreamHoldChanges | Domain + Port 조합 |
| Mock/Fake Adapter | supporting | InMemoryLotSource 등 | Port 구현체, 테스트/dev 용 |
| Contract Test | supporting | test_lot_source_contract.py 등 | 모든 Adapter가 통과해야 함 |
| DI Container | supporting | FastAPI Depends + 환경변수 토글 | Adapter 교체 지점 |
| 사내 AI / Claude | external | 비대칭 분담 경계 | Claude = Port 정의, 사내 AI = Adapter 구현 |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|--------------|-----|---------|--------|-----------------|
| 1 | 3 | 3 | - | - | N/A |
| 2 | 5 | 2 | 0 | 3 | 60% |
| 3 | 7 | 2 | 2 | 3 | 71% |
| 4 | 9 | 2 | 0 | 7 | 78% |
| 5 | 10 | 1 | 0 | 9 | 90% |

수렴 패턴: Round 1 정의 → Round 2 핵심 제약 도입(사내/Claude 협업) → Round 3 패턴 확정(Hexagonal) → Round 4 인터페이스 권한 결정 → Round 5 검증 방식 결정. 매 라운드 stability 단조 증가, 최종 90%로 도메인 모델 수렴.

## Interview Transcript

<details>
<summary>Full Q&A (5 rounds)</summary>

### Round 1
**Q:** 현재 docs/ 6개 문서에 이미 결정된 아키텍처가 있는데, "아키텍처를 고민하자"고 하신 건 어떤 의미인가요?
**A:** 클린 아키텍처, 버티컬 슬라이스 아키텍처처럼 프로젝트 구성요소가 아닌 *구조*에 대한 고민
**Ambiguity:** 65% (Goal: 0.55, Constraints: 0.20, Criteria: 0.10, Context: 0.55)

### Round 2
**Q:** 왜 지금 클린/버티컬 슬라이스 같은 구조 패턴을 고민하세요? (구조 선택의 평가 기준이 여기서 정해집니다)
**A:** 사내 데이터 및 테이블 스키마를 너에게 제공하는데 제약이 있음. 그래서 사내 데이터를 핸들링하는 코드/기능들은 사내 ai를 통해서만 개발하고, 사내 ai가 작성한 코드는 너에게 제공하기 어려울거같음(구조정도만 전달 가능). 이런 상황에서 개발하기 좋은 구조를 채택하고싶음.
**Ambiguity:** 32% (Goal: 0.85, Constraints: 0.65, Criteria: 0.45, Context: 0.70)

### Round 3
**Q:** 사내 AI가 짜는 "사내 데이터 핸들링 코드"의 범위는 정확히 어디까지인가요?
**A:** 외부 시스템 어댑터 전체 (DB + 사내 REST API + Python lib + 메일 + SSO/LDAP)
**Ambiguity:** 20.3% (Goal: 0.92, Constraints: 0.75, Criteria: 0.70, Context: 0.75)

### Round 4 [Contrarian Mode]
**Q:** 사내 AI가 짜는 어댑터의 "인터페이스·DTO/타입 정의"는 Claude와 공유할 수 있나요? (어댑터 내부 구현과 별개)
**A:** Claude가 정의, 사내 AI가 구현
**Ambiguity:** 12.3% (Goal: 0.95, Constraints: 0.85, Criteria: 0.85, Context: 0.80)

### Round 5
**Q:** 사내 AI가 속주는 어댑터 구현체를 "Claude가 정의한 포트 계약"에 맞게 완성했는지 검증하는 방식은?
**A:** Contract test (Claude가 작성)
**Ambiguity:** 7.9% (Goal: 0.95, Constraints: 0.92, Criteria: 0.92, Context: 0.85)

</details>
