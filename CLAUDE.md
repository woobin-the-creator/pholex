# Pholex — 개발 가이드라인

## 설계 문서 참조

기능을 구현하기 전에 해당 영역의 설계 문서를 읽어야 한다.
전체 문서(`docs/pholex-design.md`)를 통째로 읽을 필요는 없다 — 작업 영역에 맞는 파일만 읽으면 된다.

| 작업 영역 | 읽어야 할 문서 |
|-----------|---------------|
| FastAPI 엔드포인트, DB 모델/쿼리, Redis 캐시, WebSocket 서버, 데이터 수집 | `docs/backend.md` |
| SSO 로그인 플로우, 세션 관리, 권한, 개발 환경 우회(DEV_SSO_BYPASS) | `docs/auth.md` |
| React 컴포넌트, Jotai atom, TanStack Table, CSS/스타일, WebSocket 클라이언트 | `docs/frontend.md` |
| Docker Compose/Swarm 설정, Nginx, 환경 분리, 배포 스크립트, 미러 레포 전략 | `docs/infra.md` |
| 기술 스택 선택 이유, 시스템 구조, 수용 기준 | `docs/overview.md` |
| 사내 서버 구축 절차, 미러 주소 설정, 이미지 확인, 트러블슈팅 | `docs/onprem-setup.md` |
| MVP 범위, 수용 기준, 시드 데이터 | `docs/mvp.md` |

**왜 중요한가**: 이 프로젝트는 여러 번의 검토와 트레이드오프 결정이 반영된 설계를 따른다.
예를 들어 상태 관리는 Zustand 대신 Jotai `atomFamily`를 사용하는 이유가 있고,
폴링 주기보다 수동 리프레시 응답성이 더 중요한 맥락이 있다.
문서를 먼저 읽으면 이런 결정들을 모르고 뒤집는 실수를 방지할 수 있다.

여러 영역에 걸친 작업(예: WebSocket 메시지 추가)이라면 관련 문서를 모두 읽는다.

## 의사결정 기록 (Decision Log)

굵직한 결정을 내릴 때마다 `history/decisions.html`을 업데이트한다.

- **대상**: architecture 선택, framework/library 선택, 큰 트레이드오프 결정(예: SQLite→Postgres, fake/real adapter 분리, 데이터 소스 전략, 테마 정책 등). 자잘한 버그 픽스·리팩터는 제외한다.
- **방법**: 파일 상단 `DECISIONS` 배열 **끝에 객체 하나를 추가**하되 **반드시 trailing comma로 끝맺는다**(`},`). timeline은 JS가 자동으로 그리므로 HTML 본문은 건드리지 않는다.
- **"마지막 업데이트" 표시**: 배열 마지막 항목의 `when`에서 자동 도출된다. 따로 갱신할 상수(`LAST_UPDATED` 등)를 두지 마라.
- **왜 이 규약인가**: `history/decisions.html`은 `.gitattributes`에 `merge=union`이 걸린 공유 파일이다(원래 사외·사내 양쪽 append를 허용하려 설계했으나, **결정 서술 권위는 사외 리드에 있어 실제 갱신은 사외가 한다** — 아래 "작업 영역 분리" 참조). 항목을 배열 끝에 추가해도 충돌 없이 보존되려면 (1) 모든 항목이 trailing comma로 끝나야 하고 (2) 양쪽이 수정하는 단일 라인 상수가 없어야 한다. 이 두 규율을 어기면 union 머지가 깨진다(자세한 배경은 decisions.html의 해당 결정 항목 참고).
- **필드**: `era`, `when`, `status`(`done`|`future`|`revisit`), `title`, `decision`, `rationale`, `alternatives`(name + rejected), `note`(선택).

**왜 중요한가**: 과거에 왜 이런 architecture/framework를 골랐는지 헷갈리지 않으려고 만든 기록이다. 결정이 생길 때마다 누적되지 않으면 가치가 사라진다.

## 작업 영역 분리 (사외 정본 ↔ 사내 실행)

**왜 중요한가**: 사내(폐쇄망)는 `git pull`만 할 수 있다. 사내가 사외 파일을 수정하면 다음 pull에서 **merge conflict**가 난다(Phase 2에서 `backend/tests/contract`·`decisions.html`에서 실제 발생). 소유를 **화이트리스트**로 고정해 이 충돌을 원천 차단한다 — 폴더가 늘어나도 gray zone이 없다.

**규칙 (단순)**: 사내 AI(Sisyphus)가 소유하는 곳은 아래 **3곳뿐**이다. **그 외 전부는 사외 AI(Claude) 소유다.**

사내 소유 (Sisyphus만 수정):
1. `backend/app/adapters/real/`
2. `backend/alembic/versions/`
3. `scripts/`

(+ `.gitignore`된 `.env`·사내 운영값 — git 추적 대상이 아니라 충돌과 무관)

**위반 판정**:
- 사외 AI(Claude)가 위 3곳을 수정하면 → **규율 위반**.
- 사내 AI(Sisyphus)가 3곳 **외 어디든** 수정하면 → **규율 위반**.
- 새로 생기는 폴더·파일은 명시적으로 3곳 안에 있지 않는 한 **자동으로 사외 소유**다.

**충돌 예방 원칙**: real·마이그레이션·dump에 필요한 스캐폴딩(테스트 게이트 `_skip_if_real` 등, `config.py` dev 기본값, `adapters/fake` reference)은 **사외가 정본에 미리 넣는다**. 그래야 사내는 3곳만 채우면 되고 공용 파일을 건드릴 이유가 없다.

**위임/에스컬레이션 규율**: 모든 `[→ 사내 AI]` 위임 블록에 "**3곳(`adapters/real`·`alembic/versions`·`scripts`) 외 수정 금지**"를 명시한다. 사내가 3곳 밖을 고쳐야 할 필요가 보이면 **직접 고치지 말고 사외에 요청**한다(사외가 정본에 반영 → 사내가 pull로 받음). `decisions.html`·`docs/**`·`CLAUDE.md`를 포함한 모든 사외 파일은 사내가 수정하지 않는다.
