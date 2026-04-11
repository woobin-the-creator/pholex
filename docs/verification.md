# Pholex — MVP 검증 & 관측성 가이드

> `docs/mvp.md`의 엄격한 MVP 범위를 실제 실행 증거로 입증하기 위한 테스트/스모크/관측성 기준.

---

## 1. 검증 범위

### In Scope
- OIDC 기반 SSO bootstrap / 세션 재사용 / 로그아웃
- `users`, `lot_status` 마이그레이션과 `scripts/seed_dev.sql` 재실행 가능성
- 슬롯 `[1]` **"내 lot hold"** REST 초기 로드
- 쿠키 기반 WebSocket 인증, `subscribe` / `refresh` / `table_update`
- 2x3 그리드 + 슬롯 `[1]` 실구현 + 나머지 5개 placeholder
- 리프레시 / 마지막 갱신 시간 / hold 행 강조
- auth/update 경로의 경량 관측성 로그

### Out of Scope
- 슬롯 `[0]`, `[2]`~`[5]`의 실제 데이터 로직
- 글로벌 필터 / 프리셋 / 토스트 알림 / 사용자 레이아웃 저장
- 실데이터 collector 연동
- beta/on-prem 배포 실행 자체
- 성능/부하/24시간 soak을 MVP 완료 조건으로 강제하는 것

---

## 2. 테스트 계층

| 계층 | 목적 | 대표 대상 |
|------|------|-----------|
| Backend Unit | auth/session/employee-number 정규화와 slot `[1]` 질의 규칙 고정 | claim extractor, session core, lot service |
| Backend Integration | 마이그레이션, seed, auth route, REST/WS 계약 증명 | `/api/auth/*`, `/api/lots/my-hold`, `/ws` |
| Frontend Component | 2x3 grid, placeholder 5개, slot `[1]` 렌더와 refresh 상호작용 검증 | `App`, `DashboardGrid`, `TableHeader`, slot `[1]` table |
| E2E Smoke | dev stack 전체에서 bootstrap → grid → refresh → logout까지 연결 검증 | Playwright smoke |
| Observability Smoke | auth/bootstrap/refresh/update 실패를 추적할 최소 로그 보장 | 구조화 로그/캡처 로그 |

---

## 3. 권장 실행 순서

1. backend unit
2. backend integration
3. frontend component/unit
4. compose smoke
5. e2e smoke
6. observability log capture 확인

> 구현이 없는 단계에서는 아래 명령은 **목표 계약**이다. 구현이 생기면 그대로 CI/로컬 runbook에 연결한다.

```bash
# backend unit / integration
pytest backend/tests/unit -q
pytest backend/tests/integration -q

# frontend unit / component
pnpm --dir frontend test --run

# dev stack smoke
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# e2e smoke
pnpm exec playwright test e2e/pholex-mvp-slot1.spec.ts
```

---

## 4. MVP 수용 기준 ↔ 증명 매핑

| MVP 기준 | 최소 증명 |
|---------|-----------|
| SSO 로그인 후 메인 페이지 진입 | auth route integration + E2E bootstrap |
| 첫 로그인 시 dev 사용자 upsert | auth integration + DB assertion |
| 2x3 그리드 + placeholder 5개 | frontend component test + E2E DOM count |
| 슬롯 `[1]`에 로그인 사용자 hold 랏만 표시 | lot service unit + REST integration + seed-based E2E |
| hold 행 Critical Red 강조 | component styling assertion + E2E class/style 확인 |
| 리프레시 버튼으로 즉시 갱신 | WS integration + E2E last-updated 변화 확인 |
| `table_update`로 슬롯 `[1]`만 갱신 | frontend state test + WS integration |
| 로그아웃 후 다음 bootstrap 재진입 | auth integration + E2E logout |
| seed 스크립트 재실행 가능 | migration/seed integration |

---

## 5. E2E / 스모크 시나리오

### 기본 smoke flow
1. dev stack 기동
2. 마이그레이션 적용
3. `scripts/seed_dev.sql` 실행
4. `http://localhost:8080` 접속
5. 자동 auth bootstrap 후 대시보드 진입 확인
6. placeholder 5개 + 슬롯 `[1]` 1개 확인
7. 슬롯 `[1]`에 seed 기준 3개 row 표시 확인
8. refresh 클릭 후 마지막 갱신 시간 변경 확인
9. 백엔드에서 qualifying row 변경 후 WS 기반 UI 업데이트 확인
10. logout 후 다음 진입 시 `/api/auth/sso/init` 경유 확인

### Seed 기준 기대 데이터
- 표시 대상: `status='hold'` AND `hold_operator_id=99999`
- 기대 건수: **3**
- 비표시 대상:
  - 다른 사용자의 hold row
  - 내 run/wait row

---

## 6. 관측성 이벤트 계약

MVP에서는 별도 metrics stack 대신 **구조화 로그**로 auth/slot `[1]` 경로를 추적한다.

| 이벤트 | 필수 필드 | 용도 |
|--------|-----------|------|
| `auth.bootstrap` | `outcome`, `mode` (`dev_bypass`/`oidc`) | 첫 진입이 어디서 성공/실패했는지 추적 |
| `auth.callback_failed` | `reason`, `nonce_present` | OIDC 검증 실패 원인 분리 |
| `session.created` | `session_id`, `employee_id` | 세션 발급 확인 |
| `session.deleted` | `session_id` | logout/세션 정리 확인 |
| `ws.auth_rejected` | `code`, `has_cookie` | 쿠키 없는 WS 거절 확인 |
| `slot1.refresh_requested` | `tableId`, `employee_number` | 슬롯 `[1]` 강제 갱신 요청 추적 |
| `slot1.table_update_emitted` | `tableId`, `row_count` | 실제 푸시 발생 여부 확인 |

### 권장 로그 예시

```text
event=auth.bootstrap outcome=success mode=dev_bypass employee_id=test001
event=session.created session_id=... employee_id=test001
event=slot1.refresh_requested tableId=1 employee_number=99999
event=slot1.table_update_emitted tableId=1 row_count=3
event=ws.auth_rejected code=1008 has_cookie=false
```

---

## 7. 실패 시 우선 확인할 항목

1. `DEV_SSO_BYPASS`, `SSO_*` 값과 redirect URI 등록 상태가 맞는가
2. `users.employee_number`와 `lot_status.hold_operator_id` 타입/값이 같은가
3. seed 실행 후 표시 대상 3건이 실제 DB에 존재하는가
4. WS 연결 시 `pholex_sid` 쿠키가 실제로 전송되는가
5. refresh 이후 `slot1.refresh_requested`와 `slot1.table_update_emitted` 로그가 둘 다 남는가

---

## 8. 문서 우선순위

검증 관련 source of truth 우선순위:

1. `docs/mvp.md`
2. `docs/auth.md`
3. `docs/backend.md`
4. `docs/frontend.md`
5. `docs/infra.md`
6. 이 문서 (`docs/verification.md`)

이 문서는 MVP를 **어떻게 증명할지**를 정의한다. 기능 범위 자체는 `docs/mvp.md`를 넘지 않는다.
