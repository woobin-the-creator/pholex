# 운영/배포 트러블슈팅 런북

> **이 문서는 반복되는 운영·배포 장애의 "증상 → 원인 → 진단 → 수정 → 재발방지" 플레이북이다.**
> 배포(`scripts/deploy.sh`)·검증·운영 장애 대응을 시작하기 **전에 먼저 읽는다.** 새 장애를 해결하면 여기에 한 항목 추가한다.
> (왜 그렇게 설계했나 = `history/decisions.html`, 사내 어댑터 사양 = `docs/adapter-spec.md`. 이 문서는 *운영 장애 대응* 전용.)

사외(Claude)·사내(opencode) 모두 이 문서를 단일 기준으로 본다. 증거는 **터미널/파일**로만 남긴다(스크린샷 불가 환경).

> **배포 후 "완료" 선언 전에 반드시 `scripts/verify-stack.sh dev` / `scripts/verify-stack.sh prod`를 돌린다.** 컨테이너 상태·ADAPTER_MODE·DB 행수·쿠키 secure·엔드포인트 500·프론트 번들 신선도·python-multipart·redis를 한 번에 검사하고, FAIL이 있으면 종료코드 1. 아래 항목들이 그 FAIL의 처치법이다.

---

## 0. 빠른 분류

| 화면 증상 | 가장 가능성 큰 항목 |
|---|---|
| 로그인이 mock이고 랏이 더미(golden) | [#1 prod가 fake로 뜸](#1) |
| "너무 여러 번 리디렉션되었습니다"(ERR_TOO_MANY_REDIRECTS) | [#2 SSO 로그인 루프](#2) |
| Internal Server Error (500) | [#3 500 — 캐시 datetime 등](#3) |
| 접속은 되나 "내 lot hold"가 mock/소량 | [#4 dev DB가 테스트로 초기화됨](#4) |
| 페이지 안 뜸 / vite "Cannot find module 'sonner'·'browserslist'" | [#5 컨테이너 node_modules 누락](#5) |
| `socket.gaierror: postgres` / DB 연결 실패 | [#6 postgres 호스트명 해석](#6) |
| 키워드 Hold가 런타임 에러 / 테이블 없음 | [#7 alembic 미적용](#7) |
| 알람 박스가 항상 비어 있음 | [#8 알람 스트림 stub(의도된 후속)](#8) |
| 신호등 "60:00+ 전" 🔴 + 데이터 며칠~수십일 정체인데 dump 로그는 "✅ 성공" | [#9 dump 성공 로그인데 DB 미반영(조용한 트랜잭션 롤백)](#9) |

---

## <a id="1"></a>#1 — prod가 fake 모드 + mock 로그인으로 뜸
- **증상**: prod(10004)에서 로그인이 실제 SSO가 아니라 mock, 랏이 golden 더미.
- **원인**: `scripts/deploy.sh`의 `ensure_env_file()`이 **`.env.prod`가 없으면 `.env.example`을 복사**한다. `.env.example`은 `ADAPTER_MODE=fake`, `DEV_SSO_BYPASS=true`. compose 기본값도 `${ADAPTER_MODE:-fake}`/`${DEV_SSO_BYPASS:-true}`. → 실 `.env.prod`가 없으면 fake+bypass로 기동.
- **진단**:
  ```
  docker inspect <prod_backend> --format '{{json .Config.Env}}' | tr ',' '\n' | grep -E 'ADAPTER_MODE|DEV_SSO_BYPASS'
  cat .env.prod | grep -E 'ADAPTER_MODE|DEV_SSO_BYPASS'
  ```
- **수정**: 실 `.env.prod`(ADAPTER_MODE=real, DEV_SSO_BYPASS=false, 실 DATABASE_URL, 실 SSO env) 복원 후 `scripts/deploy.sh --prod`.
- **재발방지**: 실 `.env.prod`/`.env.dev`를 사내 호스트에 **영구 보존**(삭제·리셋 금지). `.env.example`은 기본값이 fake임을 항상 기억.

## <a id="2"></a>#2 — `ERR_TOO_MANY_REDIRECTS` (SSO 로그인 루프)
- **증상**: 메인이 잠깐 보였다가 "너무 여러 번 리디렉션". (해결 이력: 2026-06-11/12)
- **원인**: 세션 쿠키가 안 먹혀 재로그인 무한 반복. 대개 **SSO env 미주입**(`IDP_CLIENT_ID` 등 빈값 → compose `${IDP_CLIENT_ID:-}` 빈 기본값) → `init`만 쌓이고 `callback` 0. 또는 `SESSION_COOKIE_SECURE`/`X-Forwarded-Proto` 불일치.
- **진단**:
  ```
  docker inspect <prod_backend> --format '{{json .Config.Env}}' | tr ',' '\n' \
    | grep -E 'IDP_CLIENT_ID|IDP_JWKS_URI|JWT_SECRET|SESSION_COOKIE_SECURE|APP_BASE_URL'
  docker compose -p pholex logs nginx | grep -Ec '/api/auth/sso/init'   # init 횟수
  docker compose -p pholex logs nginx | grep -Ec '/api/auth/callback'   # 0 이면 env 미주입 확정
  ```
- **수정**: `.env.prod`에 실 SSO 값 전부(`IDP_CLIENT_ID`/`IDP_JWKS_URI`/`IDP_AUTH·TOKEN·LOGOUT_URL`/`JWT_SECRET`/`SSO_CERT_PATH`/`APP_BASE_URL=https://<등록된 IP:10004>`), `SESSION_COOKIE_SECURE=true`, nginx `proxy_set_header X-Forwarded-Proto $scheme`. 재기동.
- **재발방지**: `APP_BASE_URL`/redirect_uri는 **IdP에 등록된 값을 단일 기준**으로(호스트에서 역산 금지). dev/prod 쿠키 이름 분리(같은 IP, 포트만 다름).

## <a id="3"></a>#3 — Internal Server Error (500)
- **증상**: API 500. (해결 이력: 2026-05-29, real adapter 500/504)
- **1순위 원인**: **캐시 datetime 직렬화** — `LotRowDTO.updated_at`(datetime)을 캐시에 JSON 직렬화할 때 `model_dump()`만 쓰면 datetime이 직렬화 안 돼 터짐.
- **수정**: 직렬화에 **`model_dump(mode="json")`**(datetime→ISO), 역직렬화 시 파싱.
- **기타 원인**: 요청마다 async engine 생성(→504, 커넥션 고갈) → **engine 싱글턴/`lru_cache`**; employee 필터 누락(과부하); 스키마 컬럼 불일치.
- **진단(필수)**: 보고의 줄번호를 믿지 말고 **실제 traceback**부터. (과거 사내 보고가 실존하지 않는 `lot_repository.py:199 users_upsert()`를 가리킨 적 있음.)
  ```
  docker compose -p <project> logs backend --tail=120   # 500 재현 후 traceback(파일:함수:라인)
  ```
- **재발방지**: DTO↔캐시 경계는 항상 `mode="json"`. engine은 1회 생성 재사용.

## <a id="4"></a>#4 — dev "내 lot hold"가 mock/소량 (실 dump가 사라짐)
- **증상**: dev(10014)는 뜨는데 랏이 golden 몇 행(실 ~13.8k 아님).
- **원인**: `PHOLEX_TEST_REAL=1` contract test를 **dev 런타임 DB(`localhost:5433`/dev postgres 컨테이너)** 에 돌리면 `_cleanup_real_adapter_tables()`의 **TRUNCATE + golden 시드**가 실 dump를 덮어쓴다.
- **수정(2단계)**:
  1. dev DB 복원(2026-06-12 절차):
     ```
     docker compose -p pholex exec -T postgres pg_dump -U pholex -d pholex --clean --if-exists --no-owner > /tmp/prod_snapshot.sql
     cat /tmp/prod_snapshot.sql | docker compose -p pholex-dev exec -T postgres psql -U pholex -d pholex
     ```
  2. contract test는 **별도 테스트 DB(예 `pholex_test`)/트랜잭션 롤백**에만. 절대 런타임 DB에 TRUNCATE 금지.
- **진단**: `docker compose -p pholex-dev exec -T postgres psql -U pholex -d pholex -c "SELECT count(*) FROM lot_status;"`

## <a id="5"></a>#5 — vite "Cannot find module 'sonner' / 'browserslist'"
- **증상**: dev 프론트가 안 뜸. `[plugin:vite] Failed to resolve import "sonner"` 또는 `Cannot find module 'browserslist'`.
- **원인**: 컨테이너 `node_modules`에 의존성 누락. package.json에 새 dep(예 `sonner`)이 들어왔는데 **명명 볼륨(`frontend_node_modules`)이 stale**하거나, 호스트 node_modules를 **bind-mount**해 불완전/타arch 설치가 들어옴.
- **수정**: bind-mount 쓰지 말고 **named volume 유지 + 컨테이너 안에서 full 설치**:
  ```
  docker compose -p pholex-dev -f docker-compose.yml -f docker-compose.dev.yml run --rm frontend npm ci
  docker compose -p pholex-dev -f docker-compose.yml -f docker-compose.dev.yml up -d
  ```
- **prod**: 빌드가 **docker 멀티스테이지(Dockerfile `prod-dist`)** 안에서 일어난다. 호스트 npm 단계가 없으므로 `git pull` 후 **`deploy.sh --prod` 한 번**으로 끝난다(예전엔 호스트 `npm ci`라 락 불일치로 깨졌다). 의존성 설치는 `deps` 스테이지의 `npm ci || npm install`(락 동기화면 ci, 없거나 어긋나면 install 폴백).
- **빌드가 멈춘 듯 보일 때**: docker 빌더의 `RUN npm ci || npm install` 이 네트워크로 전체 설치 중이라 출력이 안 보일 수 있다. 사내에서는 **`NPM_REGISTRY_URL`(필요시 `DOCKER_REGISTRY`)을 `.env`에 사내 미러로 설정**해야 public registry 차단으로 행 걸리지 않는다. 진단: `docker stats`로 NET I/O 확인, `--progress=plain` 으로 빌드.
- **재발방지**: 의존성은 항상 **완전 설치**(`npm ci` 또는 폴백 `npm install`) — 부분설치 금지. 호스트 node_modules를 컨테이너에 bind-mount하지 않는다. 락은 환경별 npm 미러 차이로 git에 커밋하지 않으므로, 동기화 책임은 빌드 스텝의 폴백이 진다.

## <a id="6"></a>#6 — `socket.gaierror: postgres` / DB 연결 실패
- **증상**: pytest/alembic/앱이 `socket.gaierror: [Errno -3] ... postgres`.
- **원인**: `DATABASE_URL`의 host `postgres`는 **docker-compose 서비스 이름** — compose 네트워크 안에서만 해석된다. 네트워크 밖(호스트)에서 그대로 쓰면 실패.
- **수정**: 실행 위치에 맞는 host:port로.
  - 컨테이너 안: `@postgres:5432`(그대로).
  - 호스트에서 compose dev postgres: `@localhost:5433`(`5433:5432` 노출).
  - 호스트의 사내 실 postgres: `@localhost:5432`(컨테이너에서면 `@host.docker.internal:5432` + extra_hosts).
- **재발방지**: 환경마다 닿는 주소를 쓴다. 추측 말고 `docker ps`로 노출 포트, `pg_isready`로 응답 확인.

## <a id="7"></a>#7 — alembic 마이그레이션 미적용 (테이블 없음)
- **증상**: 새 기능(예 키워드 Hold)이 런타임 에러, `keyword_presets` 등 테이블 없음.
- **원인**: `scripts/deploy.sh`는 코드만 재빌드(`up -d --build`)하고 **alembic을 자동 실행하지 않는다**(backend Dockerfile CMD = uvicorn).
- **수정**: 배포 후 각 스택 DB에 수동으로:
  ```
  DATABASE_URL=<해당 스택 실값> alembic upgrade head
  psql "<해당 스택 실값>" -c "\dt <table>"   # 존재 확인
  ```
- **재발방지**: 새 모델/테이블 PR엔 alembic 버전을 포함하고, 배포 체크리스트에 "두 스택 DB 모두 upgrade"를 넣는다. dev DB와 prod DB는 별도.

## <a id="8"></a>#8 — 알람 박스가 항상 비어 있음 (의도된 후속)
- **증상**: 알람 박스 UI는 뜨는데 알람이 안 옴.
- **원인(현재 정상)**: `RealLotSource.subscribe_changes`가 **stub**(무한 대기, 이벤트 미발행) — 합의된 deferred 상태. 사내 lot_status는 30분 dump만 있어 실시간 스트림이 없다.
- **후속**: 30분 dump diff 기반 이벤트 합성(구현 스펙: `ai-prompts/260615-1325-pr28-29-real-adapters-handoff.md` 파트 A 케이스 B, `event_id` 결정적 키 + try/finally 구독해제). 별도 PR.
- **주의**: stub은 에러가 아니다 — 박스가 비어 있는 게 현재 정상 동작.
- **2026-06-30 업데이트**: 후속이 `lot_change_event` outbox로 구현됨(`ai-prompts/260622-1253-alarm-outbox-lot-change-event.md`). 단 그 테이블의 마이그레이션이 운영에 누락돼 [#9](#9) 장애를 유발했으니, outbox 배포 시 #9 재발방지를 함께 확인.

## <a id="9"></a>#9 — dump가 "✅ 성공" 로그를 찍는데 DB는 갱신 안 됨 (조용한 트랜잭션 롤백)
- **증상**: 메인페이지 신선도 신호등이 🔴 "마지막 갱신 60:00+ 전"이고, lot 데이터가 며칠~수십일 전에서 정체. 그런데 30분 dump 로그는 매 실행 `✅ Dump 잡 완료 status=ok`로 정상 보고. (해결 이력: 2026-06-30, 데이터가 06-09에서 20일 동결)
- **원인**: 30분 dump가 `lot_status`·`lot_dump_meta`·`lot_change_event`를 **한 트랜잭션**(ALARM-1 원자성, `dump-job-spec.md` §3)으로 쓴다. `lot_change_event` 테이블이 운영 DB에 **없어서**(alembic 마이그레이션 누락 — [#7](#7)과 동류) 그 INSERT가 매 실행 `relation does not exist`로 실패 → 트랜잭션 **전체 롤백** → `lot_status`/`lot_dump_meta`까지 아무것도 커밋 안 됨. 그 예외를 **삼켜** "성공" 로그로 위장해 장기 미탐지. 동반 버그 2개: (a) `dump_run_id`가 DB의 기존 `last_run_at`을 재사용(매 실행 `now()` 미사용) → heartbeat 영구 미갱신 + `event_id` dedup 누락, (b) `wrapper.sh`의 `DB_URL`이 dev DB(`127.0.0.1:5433`)를 가리켜 운영과 다른 DB에 접속.
- **진단**:
  ```
  # dump 생존 신호가 멈춰 있나 (last_run_at이 과거에서 고정)
  psql "<운영 DATABASE_URL>" -c "SELECT id, last_run_at, row_count, status FROM lot_dump_meta;"
  # 테이블이 실제로 있나
  psql "<운영 DATABASE_URL>" -c "\dt"        # lot_change_event 부재 확인
  # 데이터 자체가 정체인가 (신호등만이 아니라)
  psql "<운영 DATABASE_URL>" -c "SELECT max(updated_at), count(*) FROM lot_status;"
  # dump 로그의 "성공"을 믿지 말 것 — DB 실제 값과 대조
  tail -n 80 /tmp/pholex/lot_status_dump.log
  # 앱이 읽는 DB == dump가 쓰는 DB 인가 (DB_URL 오설정 확인)
  docker compose -p pholex exec -T backend env | grep -i DATABASE_URL
  ```
- **수정**: ① `lot_change_event` 테이블 생성(`ai-prompts/260622-1253-alarm-outbox-lot-change-event.md` §2 DDL 그대로). ② `dump_run_id`를 매 실행 `datetime.now(timezone.utc)`로 만들고 `last_run_at`도 그 값으로 upsert. ③ 예외 삼킴 제거 — traceback `ERROR` 로그 + 별도 트랜잭션으로 `lot_dump_meta.status='error'`(`last_run_at`은 안 건드려 🔴 유지) + `wrapper.sh` 실패 시 `exit 1` + "성공" 로그는 커밋 확인 후에만. ④ `DB_URL`을 운영 DB로 교정. (커밋 `e20e666`, origin/dev)
- **재발방지**: (1) dump는 INSERT/커밋 실패 시 **절대 "성공" 로그 금지** — 커밋 성공 확인 후에만 출력하고, 실패는 `status='error'`+`exit 1`로 노출. (2) `lot_dump_meta.last_run_at`은 변경 0건이어도 **매 실행 `now()`**(CONTRACT-4) — 기존 값 재사용 금지. (3) 새 테이블/모델은 [#7](#7)처럼 **운영 DB에 alembic upgrade 필수**(코드 배포만으로 테이블 안 생김). (4) dump가 쓰는 DB는 **앱이 읽는 DB와 동일**해야 한다 — `DB_URL`을 환경에서 역산하지 말고 운영 값을 단일 기준으로([#6](#6) 연계).
