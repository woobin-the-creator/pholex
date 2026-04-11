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

**왜 중요한가**: 이 프로젝트는 여러 번의 검토와 트레이드오프 결정이 반영된 설계를 따른다.
예를 들어 상태 관리는 Zustand 대신 Jotai `atomFamily`를 사용하는 이유가 있고,
폴링 주기보다 수동 리프레시 응답성이 더 중요한 맥락이 있다.
문서를 먼저 읽으면 이런 결정들을 모르고 뒤집는 실수를 방지할 수 있다.

여러 영역에 걸친 작업(예: WebSocket 메시지 추가)이라면 관련 문서를 모두 읽는다.
