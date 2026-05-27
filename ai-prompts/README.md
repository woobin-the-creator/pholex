# ai-prompts/ — 외부 AI ↔ 사내 AI 위임 문서

외부 AI(Claude Code)가 사내 AI에게 작업 위임이나 확인 요청 시 작성하는 한 페이지 spec 문서가 모이는 곳.

## 명명 규약

`YYMMDD-HHMM-주제-설명.md`

## 사내 AI가 봐야 할 문서

### ✅ Active (현재 작업 대상)

| 파일 | 주제 | 우선순위 |
|------|------|---------|
| [`260527-1318-handoff-to-internal-ai.md`](./260527-1318-handoff-to-internal-ai.md) | Pholex MVP Real adapter 구현 위임 (4종 + alembic + contract test) | **1순위 — 사내 AI 진입점** |

사내 AI는 위 파일을 먼저 읽고, 거기서 안내하는 `docs/adapter-spec.md` §0 시작 가이드로 이동하면 작업 시작 지점이 명확해집니다.

### 📦 Archived (참고용, 작업 대상 아님)

`archived/` 디렉터리의 문서는 **이전 아키텍처(codex/v1) 또는 부분적으로 처리된 이슈**의 spec. Real adapter 구현 시 contract 디테일 참고용으로만 보세요.

| 파일 | 현재 상태 |
|------|---------|
| `archived/260413-1430-send-mail-return-value-check.md` | 코드 위치는 outdated (`backend/reports/`는 현 hexagonal 구조에 없음), 그러나 사내 메일 라이브러리의 raise vs dict 반환 처리는 `RealMailSender` 어댑터 작성 시 참고 가능. `docs/adapter-spec.md` §3.3에서 이 파일을 link 중. |
| `archived/260428-1721-demo-mode-frontend-mock.md` | 케이스 C(`review`/`release-pending` 제거)는 이미 처리됨. 케이스 E(근본 방향)는 Fake adapter로 자연 해결. 케이스 A/B/D는 `docs/adapter-spec.md` §4.2/§3.4에 흡수됨. 사내 시스템과 비교 시 참고. |

### 🗑️ 삭제된 문서

- `260413-1400-report-base-url-envvar.md` — REPORT 기능은 plan v3에서 MVP-out 분리 (별도 `ReportPublisher` Port로 추후). 현재 코드에 무관.
- `260413-1500-report-base-url-envvar.md` — 위 1400의 개선판, 동일 사유로 폐기.
