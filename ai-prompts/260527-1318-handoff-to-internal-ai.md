# 사내 AI 작업 위임 — Pholex MVP Real adapter 구현

## 이 문서가 작성된 배경

외부 AI(Claude Code)가 Pholex MVP의 hexagonal 백엔드를 구현 완료했습니다. 도메인/Port/DTO/Use case/API/WS/DI/Fake adapter/Contract test/Dev stack까지 모두 작성되어 있고, `ADAPTER_MODE=fake` 상태에서 페이지가 동작합니다 (골든 데이터셋 3행 표시).

이제 **사내 데이터를 실제로 보여주기 위해서는 사내 AI가 Real adapter 4종을 구현해야 합니다.** 사내 시스템(DB 스키마, 메일 라이브러리, SSO OIDC 엔드포인트, 사내 미러 URL)은 외부 AI에 노출되지 않으므로, 이 작업은 사내 환경에서만 진행할 수 있습니다.

## 사내 AI에게 전달할 내용 (그대로 복사해서 사용)

---

> Pholex MVP의 사내 어댑터 구현을 부탁합니다. 필요한 사양은 모두 `docs/adapter-spec.md`에 있습니다. **그 문서의 §0(시작 가이드)부터 읽으면 작업 시작 지점이 명확해집니다.**
>
> ### 요약
>
> - **위치**: `backend/app/adapters/real/` (현재 비어 있음, `__init__.py`와 README만 존재)
> - **만들 파일 4개**:
>   - `lot_source.py` — class `RealLotSource`
>   - `lot_repository.py` — class `RealLotRepository`
>   - `sso_verifier.py` — class `RealSsoVerifier`
>   - `mail_sender.py` — class `RealMailSender`
> - **추가로 필요한 것**:
>   - alembic 마이그레이션 (RealLotRepository용 Postgres DDL)
>   - 사내 dev Postgres에 golden_dataset 동치 fixture 시드 (사번 99999/88888)
>   - `backend/tests/contract/conftest.py`의 `ADAPTER_PARAMS`를 `["fake", "real"]`로 확장 + `real` 분기 fixture 추가
>
> ### 절대 변경 금지 (CI gate가 막음)
>
> ```
> backend/app/domain/        # 도메인 enum/엔티티
> backend/app/usecases/      # use case 합성·severity·캐시 결정
> backend/app/api/           # REST/WS endpoint + wire format
> backend/app/ports/         # Port 시그니처 + DTO
> ```
>
> Port 시그니처를 수정하고 싶다면 별도로 알려주세요 — 외부 AI가 처리합니다 (도메인 invariant + frontend 타입 + contract test와 함께 묶어서 변경).
>
> ### Canonical 매핑은 어댑터 책임
>
> 사내 status enum이 `{run, wait, hold}` 외 값을 포함하거나, 사내 권한 등급이 `{ENGINEER, ADMIN}` 외에 더 있어도, **어댑터가 환원해서 DTO에 넣어주세요**. Use case는 canonical 값만 봅니다. 자세한 환원 정책은 §4 참조.
>
> ### 보안 가드 (`RealSsoVerifier` 필수)
>
> MVP의 Fake는 세션 쿠키 값으로 `employee_number` 평문을 씁니다. Real로 전환할 때 **반드시 signed JWT 또는 random UUID + DB lookup으로 교체**하세요. 그렇지 않으면 동료 사번을 아는 사람이 위장 가능합니다. 자세한 위치는 §3.4 보안 가드 참조.
>
> ### 미러 레포 빌드
>
> `backend/Dockerfile` / `frontend/Dockerfile`에 ARG 통로(`DOCKER_REGISTRY`, `PIP_INDEX_URL`, `PIP_TRUSTED_HOST`, `APT_MIRROR`, `NPM_REGISTRY_URL`)가 이미 있습니다. `.env.dev`에 사내 미러 URL을 채우고 `scripts/deploy.sh`로 빌드 통과를 확인해주세요. 외부 AI는 사내 미러에 도달할 수 없어 이 부분을 검증하지 못합니다.
>
> ### 검수 절차
>
> 1. `cd backend && pytest tests/contract -k 'fake or real'` 모두 통과
> 2. `git diff origin/main -- backend/app/{domain,usecases,api,ports}` 빈 diff
> 3. `.env.dev`에 `ADAPTER_MODE=real` → `scripts/deploy.sh --down && scripts/deploy.sh` → `http://localhost:8080`에서 사내 lot 데이터 표시 확인
>
> 작업 중 막히는 부분, Port 시그니처 변경이 필요한 부분, 사내 시스템 제약으로 인한 의사결정 필요 사항이 있으면 알려주세요. 도메인 변경이 동반되는 결정은 외부 AI가 처리하겠습니다.

---

## 외부 AI(Claude)의 작업 현황

- ✅ Phase 1~11 모두 구현 완료
- ✅ 백엔드 pytest 53/53 통과
- ✅ Frontend vitest 3/3 통과
- ✅ docker compose로 dev 스택 기동 + 페이지 동작 검증 (`http://localhost:8080`에서 골든 데이터셋 3행 표시)
- ✅ 3-reviewer 검증 통과 (architect / code-reviewer / security)
- ✅ 리뷰에서 발견된 버그 6건 수정 완료

## 사용자가 직접 해야 할 일

1. 위의 인용 블록을 사내 AI에게 그대로 전달
2. 사내 AI가 작업 중 환경변수 이름 또는 사내 시스템 사양 질문하면 답변
3. 사내 AI가 작업 완료 후 `.env.dev`에 `ADAPTER_MODE=real`로 전환
4. (선택) Real `SsoVerifier`가 signed JWT 토큰을 도입할 경우, `SESSION_COOKIE_SECURE=true`로 변경 가능 시점 도래
