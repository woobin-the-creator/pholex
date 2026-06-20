# ai-prompts/ — 외부 AI ↔ 사내 AI 위임 문서

외부 AI(Claude Code)가 사내 AI에게 작업 위임이나 확인 요청 시 작성하는 한 페이지 spec 문서가 모이는 곳.

## 명명 규약

`YYMMDD-HHMM-주제-설명.md`

## 사내 AI가 봐야 할 문서

### ✅ Active (현재 작업 대상)

| 파일 | 주제 | 우선순위 |
|------|------|---------|
| [`260620-1056-dump-job-and-real-lot-repository-kickoff.md`](./260620-1056-dump-job-and-real-lot-repository-kickoff.md) | **30분 dump 잡 + `RealLotRepository` 구현 킥오프** — `docs/dump-job-spec.md`(정본) + 포트 8메서드(신규 `get_dump_last_run_at` 포함). 소비측 배관은 PR #45 머지 완료, 공급측 미구현 | **1순위 — 현재 작업 진입점** |
| [`260527-1318-handoff-to-internal-ai.md`](./260527-1318-handoff-to-internal-ai.md) | Pholex MVP Real adapter 구현 위임 (4종 + alembic + contract test) | 사내 AI 일반 진입점 |
| [`260606-1609-watchlist-real-adapter.md`](./260606-1609-watchlist-real-adapter.md) | "내 관심 랏" watchlist real adapter(`RealLotWatchlistRepository` + `get_lots_by_ids`) + 30분 dump 잡(`lot_status`/`lot_dump_meta`) + 계약 4건 ⚠️ **dump-잡 부분은 6/20 킥오프 문서로 대체됨** (PR #45 이전이라 `get_dump_last_run_at`·`dumpMeta` 누락) | watchlist 부분만 유효 |
| [`260615-1325-pr28-29-real-adapters-handoff.md`](./260615-1325-pr28-29-real-adapters-handoff.md) | PR #28+#29 통합 — 키워드 Hold(`RealKeywordPresetRepository` + `RealLotRepository.search` + keyword_presets alembic) + 알람 박스(`RealLotSource.subscribe_changes` + eventId/occurredAt) | **신규 기능 — main 머지됨, fake 120 + front 15 green** |
| [`260529-1522-prod-https-deploy-verify.md`](./260529-1522-prod-https-deploy-verify.md) | 운영(prod) HTTPS 배포 — VM 기존 인증서 탐색·재사용(도메인 커버 확인) + end-to-end TLS 검증 위임 | 인프라 — 운영 전환 시 |

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
