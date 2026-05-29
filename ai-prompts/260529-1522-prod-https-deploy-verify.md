# 운영(prod) HTTPS 환경 배포 및 검증 위임

## 이 프롬프트가 작성된 배경 (환경 차이)

이 문서는 GitHub 레포 코드만 접근 가능한 외부 AI(Claude Code)가 작성했습니다.
외부 AI는 운영(prod) HTTPS 스택의 **코드 일습**(nginx conf, compose 오버레이, 배포
스크립트, env 템플릿, 인증서 배치 가이드)을 모두 작성했지만, 다음을 **할 수 없습니다**:

- **인증서 탐색/배치** — 이 웹을 호스팅할 사내 VM에는 **이미 HTTPS로 실운영 중인 다른
  프로젝트들이 있고, 그 프로젝트 폴더에 사내 CA 인증서 파일이 존재**합니다. 새로 발급받는
  대신 그걸 재사용하면 됩니다. 하지만 외부 AI는 **VM 파일시스템을 볼 수 없어** 그 인증서가
  어디 있는지·어떤 도메인을 커버하는지 알 수 없습니다. 그래서 `docker/nginx/certs/`
  디렉터리는 비어 있고(README/.gitkeep만 추적), 키/crt는 `.gitignore`로 커밋이 막혀
  있습니다. ← **기존 인증서를 찾아 연결하는 것이 이 위임의 또 다른 핵심입니다.**
- **TLS 핸드셰이크 end-to-end 검증** — 실제 인증서가 없어 외부 AI는 `docker compose config`
  병합 검증·`bash -n` 문법 검증·gitignore 동작 확인까지만 했고, **브라우저에서 HTTPS가
  실제로 뜨는지**는 확인하지 못했습니다. ← **이 검증이 이 위임의 핵심입니다.**
- **사내망 전용 값** — 미러 레포 URL, DB 비밀번호, 실제 서비스 도메인은 사내 정보라
  외부 AI가 placeholder로만 남겼습니다.

## 상황 (외부 AI가 작성 완료한 것)

`scripts/deploy.sh --prod` 한 번으로 운영 스택이 뜨도록 구성돼 있습니다.

| 파일 | 내용 | 상태 |
|------|------|------|
| `docker/nginx/prod.conf` | 443 TLS 종단, 80→443 리다이렉트, 정적 SPA(`/`) 서빙 + `/api`·`/ws` backend 프록시 | 작성 완료 (server_name = `_` placeholder) |
| `docker-compose.prod.yml` | base + 오버레이. nginx 80/443 개방, 인증서·`frontend_dist` 볼륨 마운트, backend `uvicorn --workers 3`, prod 전용 볼륨(`pg_data_prod`) | 작성 완료, `docker compose config` 병합 통과 |
| `docker/nginx/certs/README.md` | 인증서 배치 위치/이름/fullchain 안내 | 작성 완료 |
| `.env.prod` | `ADAPTER_MODE=real`, `DEV_SSO_BYPASS=false`, `SESSION_COOKIE_SECURE=true` + DB/미러 placeholder | 작성 완료 (gitignore됨 — 레포에 없음, 사내 서버에서 직접 채움) |
| `scripts/deploy.sh` | `--prod` 모드 추가: 인증서 존재 체크 → `npm run build` → 스택 기동 | 작성 완료 (`bash -n` 통과) |
| `.gitignore` | `.env.prod` + `docker/nginx/certs/*` (README/.gitkeep 예외) 커밋 차단 | 작성 완료 |

### 동작 계약 (배포 스크립트가 가정하는 것)

```
scripts/deploy.sh --prod
  ├─ 1) docker/nginx/certs/pholex.crt 와 pholex.key 둘 다 존재 확인
  │       → 하나라도 없으면 안내 메시지 출력 후 exit 1 (스택 안 띄움)
  ├─ 2) npm --prefix frontend ci && npm --prefix frontend run build  (→ frontend/dist 생성)
  └─ 3) docker compose -p pholex -f docker-compose.yml -f docker-compose.prod.yml \
          --env-file .env.prod up -d --build
            ├─ frontend(one-shot): dist 를 frontend_dist 볼륨에 복사 후 종료(exit 0)
            ├─ nginx: frontend 복사 완료(service_completed_successfully) 후 기동, 443 서빙
            └─ backend: uvicorn 멀티워커, postgres
```

기대 결과: `https://<도메인>` 접속 시 인증서 경고 없이 SPA 로드, `http://` 접속은 443으로
301 리다이렉트, `/api/*`·`/ws` 정상 프록시, 로그인 세션 쿠키가 `Secure`로 발급됨.

## 해야 할 일 (사내 AI / 운영자)

### 1. 인증서 확보 — 기존 VM 인증서 재사용 우선

이 VM에는 이미 HTTPS로 실운영 중인 다른 프로젝트들이 있습니다. **새 발급보다 기존 인증서
재사용을 먼저 시도**하세요.

#### 1-1. VM에서 기존 인증서 찾기
실운영 프로젝트의 nginx 설정에 인증서 경로가 박혀 있는 경우가 많습니다. 그게 가장 확실한 단서예요.

```sh
# (a) 다른 프로젝트의 nginx 설정에서 인증서 경로 grep
grep -rEl "ssl_certificate" /path/to/projects/ /etc/nginx/ 2>/dev/null
grep -rE "ssl_certificate(_key)?\s" /path/to/projects/ /etc/nginx/ 2>/dev/null

# (b) 인증서/키 파일 자체를 직접 탐색
find /path/to/projects/ -type f \( -name "*.crt" -o -name "*.pem" -o -name "fullchain*" -o -name "*.key" \) 2>/dev/null

# (c) 실행 중인 nginx 컨테이너가 있으면 마운트된 인증서 경로 확인
docker ps --format '{{.Names}}' | while read n; do
  echo "== $n =="; docker inspect "$n" --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{println}}{{end}}' | grep -iE "cert|ssl|pem|key";
done
```

#### 1-2. 그 인증서가 pholex 도메인을 커버하는지 확인 ← **중요**
다른 프로젝트 인증서를 그대로 써도 되는 건 **그 인증서가 pholex 가 쓸 도메인을 포함할 때뿐**입니다.
와일드카드(`*.사내도메인`)거나 SAN 목록에 pholex 도메인이 들어 있어야 해요.

```sh
# 후보 인증서의 도메인(CN + SAN) 확인
openssl x509 -in <후보>.crt -noout -subject -ext subjectAltName -dates -issuer
```

- **커버함** (예: `*.corp.example` 와일드카드인데 pholex 도메인이 `pholex.corp.example`) → 1-3 진행
- **커버 안 함** (SAN에 pholex 도메인 없음, 다른 단일 도메인 전용) → 그대로 쓰면 브라우저가
  도메인 불일치로 거부합니다. 기존 와일드카드/멀티SAN 인증서가 따로 있는지 더 찾거나,
  없으면 **사내 CA에 새로 발급** 요청하세요(`docker/nginx/certs/README.md` 의 배치 규약은 동일).
- 그 인증서가 **이미 만료 임박**이면(`-dates` 확인) 갱신 주체(다른 프로젝트 운영자)와 협의.

#### 1-3. pholex 에 연결하기
`docker/nginx/prod.conf` 는 `/etc/nginx/certs/pholex.crt` · `pholex.key` 를 읽고, compose 는
호스트의 `docker/nginx/certs/` 를 거기에 마운트합니다. 연결 방법 2가지:

- **방법 A (복사 — 간단, 권장 출발점)**: 찾은 파일을 pholex 레포의 certs 디렉터리로 복사
  ```sh
  cp <찾은 fullchain> docker/nginx/certs/pholex.crt   # 서버+중간 CA fullchain 이어야 함
  cp <찾은 key>       docker/nginx/certs/pholex.key
  chmod 600 docker/nginx/certs/pholex.key
  ```
  ⚠️ 단점: 원본 프로젝트가 인증서를 **갱신(renew)** 하면 이 복사본은 안 따라가서 만료 시 끊깁니다.
  사내 CA 인증서가 장기 유효(수년)면 허용 가능하지만, 갱신 주기를 확인하세요.

- **방법 B (원본 경로 공유 — 갱신 자동 반영)**: 복사 대신 원본 인증서 디렉터리를 컨테이너에
  직접 마운트. `docker-compose.prod.yml` 의 nginx `volumes` 에서
  `./docker/nginx/certs:/etc/nginx/certs:ro` 줄을 원본 절대경로로 교체하거나 추가:
  ```yaml
  - /실제/원본/인증서디렉터리:/etc/nginx/certs:ro
  ```
  그리고 `prod.conf` 의 `ssl_certificate` 파일명을 원본 파일명에 맞추면 됩니다.
  장점: 원본이 갱신되면 nginx reload 만으로 따라감. 단점: 프로젝트 간 결합 발생.

> 어느 방법이든 `ssl_certificate` 에 들어가는 crt 는 **fullchain**(서버 인증서 + 중간 CA)
> 이어야 합니다. 원본이 서버 인증서와 chain 을 분리해 두는 구성(`ssl_certificate` +
> `ssl_trusted_certificate`)이면, fullchain 으로 합치거나 원본 nginx 의 결합 방식을 그대로 따르세요.

### 2. 사내망 값 채우기 (`.env.prod`)
레포에 없으므로 사내 서버에서 직접 생성/편집합니다. (없으면 `deploy.sh`가
`.env.example`에서 복사하는데, 그건 dev 기본값이므로 **반드시 직접 prod 값으로 교정**)

- `POSTGRES_PASSWORD` / `DATABASE_URL` 의 비밀번호 → 운영 비밀번호로 교체 (`change-me-in-production` 금지)
- 사내 폐쇄망이면 미러 URL 채우기: `DOCKER_REGISTRY`(끝에 `/` 포함), `PIP_INDEX_URL`,
  `PIP_TRUSTED_HOST`, `APT_MIRROR`, `NPM_REGISTRY_URL`
- `ADAPTER_MODE=real`, `DEV_SSO_BYPASS=false`, `SESSION_COOKIE_SECURE=true` 유지 확인

### 3. 실제 도메인 반영 (`docker/nginx/prod.conf`)
- HTTPS server 블록의 `server_name _;` → 실제 도메인으로 교체 (예: `server_name pholex.internal;`)
- ⚠️ 이 도메인은 **1번에서 확인한 인증서가 커버하는 도메인과 반드시 일치**해야 합니다.
  와일드카드 `*.corp.example` 인증서를 재사용한다면 pholex 도메인도 `*.corp.example` 하위
  (예: `pholex.corp.example`)여야 합니다. 사내 DNS/호스트에 이 도메인이 이 VM 을 가리키도록
  등록돼 있어야 함도 확인하세요.
- 80 리다이렉트 블록은 `$host` 기반이라 그대로 둬도 됨

### 4. 배포 + HTTPS end-to-end 검증 ← **핵심 위임 사항**
외부 AI가 못 한 부분입니다. 사내 서버에서 실제로 확인해 주세요.

```sh
# 배포
scripts/deploy.sh --prod

# (a) 80 → 443 리다이렉트 확인
curl -I http://<도메인>            # 301, Location: https://<도메인>/ 기대

# (b) TLS 핸드셰이크 + 인증서 체인 확인
curl -Iv https://<도메인>          # 200, 인증서 검증 통과 (에러 없이)
openssl s_client -connect <도메인>:443 -servername <도메인> </dev/null 2>/dev/null \
  | openssl x509 -noout -issuer -subject -dates   # 발급자=사내 CA, 도메인/유효기간 확인

# (c) API/WS 프록시 + 세션 쿠키 Secure 플래그
curl -Iv https://<도메인>/api/...  # 200, Set-Cookie 에 Secure 포함 확인
# 브라우저: 로그인 → 대시보드 로드 → WebSocket(/ws) 연결 → 실시간 갱신 동작

# (d) 컨테이너 상태
docker compose -p pholex logs -f nginx     # SSL 인증서 로드 에러 없는지
docker compose -p pholex ps                # nginx/backend/postgres Up, frontend Exited(0)
```

### 5. 사내 루트 CA 신뢰 확인
- 사내 **루트 CA**가 사용자 단말(브라우저/OS)에 신뢰 등록돼 있어야 경고가 안 뜹니다
  (보통 그룹정책으로 배포 — 인프라/보안팀 영역).
- 미등록 단말에서는 사내 CA라도 경고가 뜹니다. 검증 시 신뢰 등록된 단말에서 확인하세요.

## 결과 회신

검증 결과를 회신해 주세요. 특히:
- (b) 인증서 체인 검증 통과 여부 + 발급자/유효기간
- (c) `Secure` 쿠키 + WebSocket 동작 여부
- 막힌 지점이 있으면 `docker compose -p pholex logs nginx` 출력과 함께
