# Pholex — 인증 설계

> 사내 ADFS(OIDC Hybrid Flow) SSO · 무상태 JWT 세션 · 개발 환경 우회(DEV_SSO_BYPASS)

> **이 문서는 실제 구현(2026-06 기준)을 반영한다.** 과거 초안의 `python-jose` / Redis 세션
> 스토어(`pholex_sid`) / `/api/auth/sso/callback` / `SSO_*`·`DEV_SSO_*` 환경변수 / `.env.beta`
> 표기는 모두 폐기되었다 — 실제 코드와 다르니 그 표기를 따르지 말 것.

---

## 개요

사내 IdP는 **ADFS**(Microsoft AD FS)이고, **OIDC Hybrid Flow**(`response_mode=form_post`,
`response_type=code id_token`)로 연동한다. 사용자가 페이지에 접속하면 자동으로 SSO 인증이
이루어지고, 첫 접속 시 `users` 테이블에 자동 등록(프로비저닝)된다.

핵심 설계 두 가지:
- **세션은 무상태 JWT다.** 로그인 성공 후 발급하는 세션 토큰은 **HS256 서명 JWT**이며 쿠키에
  담는다. 서버는 Redis에 세션을 저장하지 않는다 — 쿠키의 JWT 서명만 검증하면 된다.
- **Redis는 nonce 전용이다.** OIDC nonce(재생 공격 방지)만 잠깐(TTL 5분) 저장·소비한다.

이 설계는 헥사고날 구조의 `SsoVerifier` 포트로 추상화되어 있어, 사외에서는 fake 어댑터로
개발하고 사내에서는 real 어댑터(실제 ADFS 검증)로 동작한다.

---

## 1. 권한 레벨

| auth 값 | 대상 | UI 차이 |
|---------|------|---------|
| `ENGINEER` | 일반 엔지니어 | 기본 대시보드 |
| `ADMIN` | 개발자/관리자 | 관리 기능 추가 (추후 구체화) |

DB 스키마: `auth VARCHAR(50) DEFAULT 'ENGINEER'`.

**권한은 IdP가 주지 않는다.** ADFS는 권한 claim을 내보내지 않으므로 기본 `ENGINEER`로 두고,
이메일이 `ADMIN_EMAILS`(콤마 구분)에 포함되면 로그인 시 `ADMIN`으로 승격한다.

---

## 2. SsoVerifier 포트 (아키텍처)

인증·세션 로직 전체를 `backend/app/ports/sso_verifier.py`의 `SsoVerifier` 포트가 담당한다.
**세션 토큰 발급/검증까지 이 포트가 맡는다**(real=서명 JWT, dev=plain). fake/real 분리 덕에
사외에서 IdP 없이 로그인 플로우를 개발할 수 있다.

```python
class SsoVerifier(Protocol):
    async def init_login(self, return_url: str) -> str: ...                 # authorize URL 생성
    async def verify_callback(self, code, id_token, state) -> SsoIdentityDTO: ...  # RS256+nonce+claim
    async def create_session_token(self, identity) -> str: ...              # real=HS256 JWT, dev=plain
    async def verify_session_token(self, token) -> SsoIdentityDTO: ...       # JWT 검증 → identity
```

- **fake 어댑터(`adapters/fake/sso_verifier.py`)**: `create_session_token`은 plain 사번을,
  `verify_session_token`은 비어있지 않은 토큰이면 고정 dev identity를 돌려준다(서명 없음).
- **real 어댑터(사내, `adapters/real/`)**: ADFS id_token을 RS256으로 검증하고, 세션 토큰은
  `JWT_SECRET`으로 HS256 서명/검증한다.

> ⚠️ **plain 사번 쿠키를 운영에 쓰면 안 된다**(위조 → 사칭 가능). 운영 세션 토큰은 반드시
> 서명 JWT여야 하고, `create_session_token`과 `verify_session_token`이 **같은 `JWT_SECRET`**을
> 써야 한다(대칭).

---

## 3. 환경변수

값은 사내에서만 `.env.prod`(운영) / `.env.dev`(개발)로 주입한다(커밋 금지). compose는
`env_file:`로 이 파일들의 키 전부를 컨테이너에 자동 주입한다 — 자세한 배경은 `docs/infra.md`.

```bash
# ── 어댑터 모드 ──
ADAPTER_MODE=real                # fake | real (운영=real)
DEV_SSO_BYPASS=false             # true 면 IdP/콜백 없이 즉시 세션 발급(개발용)

# ── IdP (ADFS / real 어댑터) ──
IDP_LOGIN_URL=                   # authorize 엔드포인트 (예: https://<IDP>/adfs/oauth2/authorize/)
IDP_LOGOUT_URL=                  # 로그아웃 (예: https://<IDP>/adfs/ls/?wa=wsignoutcleanup1.0)
IDP_CLIENT_ID=                   # ADFS에 등록된 Client ID (UUID, secret 불필요)
IDP_JWKS_URI=                    # JWKS URL (정적 cert를 쓰면 미사용)
SSO_CERT_PATH=/app/certs/sso.cert # IdP id_token RS256 검증용 공개 인증서 경로
APP_BASE_URL=                    # redirect_uri 구성 기준 (예: https://<사내IP>:10004)
                                 #   → redirect_uri = {APP_BASE_URL}/api/auth/callback
SSO_RETURN_URL=/                 # 로그인 성공 후 복귀 경로

# ── 세션 JWT ──
JWT_SECRET=                      # 세션 토큰 HS256 서명 키 (대칭, 반드시 강한 랜덤값)
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=180

# ── 권한 승격 (IdP 미제공) ──
ADMIN_EMAILS=a@corp,b@corp       # 이 이메일만 ADMIN 으로 승격

# ── 인프라 ──
REDIS_URL=redis://redis:6379/0   # nonce 저장/소비 전용
SESSION_COOKIE_NAME=pholex_session   # 운영. dev는 .env.dev에서 pholex_dev_session 으로 분리
SESSION_COOKIE_SECURE=true       # 운영=HTTPS → Secure. dev(HTTP)=false

# ── dev bypass 사용자 (DEV_SSO_BYPASS=true 일 때만) ──
DEV_USER_EMPLOYEE_NUMBER=99999   # bypass 로그인 사번(실데이터 검증 시 실제 hold 사번 주입)
DEV_USER_NAME=테스트 엔지니어
DEV_USER_EMAIL=test@pholex.local
DEV_USER_AUTH_LEVEL=ENGINEER     # ENGINEER | ADMIN
```

> **이 IdP의 비표준 claim key (가장 흔한 500 원인)**: 사번=`sabun`, 이름=`username`,
> 이메일=`mail`. 표준 `sub`/`name`/`email`이 **아니다**. 또 IdP가 `sub`/`oid` 같은 고유 ID를
> 주지 않으므로 **`sabun`이 유일 식별자**다(아래 §4 참고).

---

## 4. DB 스키마 — users 테이블

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,                          -- 내부 surrogate PK
    employee_number VARCHAR(50) UNIQUE NOT NULL,   -- 사번(sabun) = 유일 식별자
    username VARCHAR(100) NOT NULL,                -- 이름
    email VARCHAR(200),
    auth VARCHAR(50) DEFAULT 'ENGINEER',           -- ENGINEER | ADMIN
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);
CREATE INDEX idx_users_employee_number ON users(employee_number);

-- 주: IdP가 sub/oid 같은 별도 고유 ID를 주지 않아(sabun만 제공) employee_id 컬럼은 두지 않는다.
--    사번(employee_number)을 UNIQUE 키 겸 upsert 대상으로 사용한다.
```

**프로비저닝**: `UserRepository.upsert(...)` — `employee_number`(sabun) UNIQUE 키로
`INSERT … ON CONFLICT (employee_number) DO UPDATE SET last_login = NOW()`. 이 upsert는
lot 조회의 UnitOfWork에 묶지 말고 자기 세션을 직접 열고 commit 한다.

---

## 5. 세션 — 무상태 JWT

로그인 성공 후 발급하는 세션 토큰은 **HS256 서명 JWT**다. 서버는 세션을 저장하지 않고,
요청마다 쿠키의 JWT 서명을 검증해 신원을 복원한다.

```
세션 JWT claims: employee_number, username, email, auth_level, iat, exp(180분)
쿠키:           {SESSION_COOKIE_NAME}=<JWT>; HttpOnly; SameSite=Lax; Path=/
  - 운영(HTTPS):  Secure 플래그 추가 (SESSION_COOKIE_SECURE=true)
  - dev(HTTP):    Secure 없음
```

> **쿠키 이름을 환경별로 분리하는 이유**: dev/prod가 같은 사내 IP(포트만 다름)라 브라우저
> 쿠키 저장소를 공유한다. 운영이 심은 Secure 쿠키를 dev(HTTP)의 non-Secure 동명 쿠키가
> 덮어쓸 수 없어(브라우저 정책) 저장 거부 → 무한 리다이렉트가 났다. 그래서 dev는
> `SESSION_COOKIE_NAME=pholex_dev_session`으로 분리한다.

Redis는 **nonce 전용**이다(세션 저장 아님):

```
key:   nonce:{nonce}    value: 1    TTL: 5분
- init_login 단계에서 저장 → callback 단계에서 id_token의 nonce와 대조 후 소비(삭제)
- 반드시 redis.asyncio (sync 클라이언트는 await set()이 안 먹어 nonce 미저장)
```

---

## 6. 엔드포인트

라우터 prefix는 `/api/auth` (`backend/app/api/auth.py`).

### `GET /api/auth/sso/init`

```
[DEV_SSO_BYPASS=true]
  → DEV_USER_* 로 dev identity 세션 토큰 즉시 생성 → 쿠키 발급 → 303 → SSO_RETURN_URL
    (IdP/콜백을 타지 않는다)

[운영 (real)]
  1. nonce 생성 + Redis 저장(TTL 5분)
  2. authorize URL 구성 (urlencode):
       {IDP_LOGIN_URL}
         ?client_id={IDP_CLIENT_ID}
         &redirect_uri={APP_BASE_URL}/api/auth/callback
         &response_type=code id_token
         &response_mode=form_post
         &scope=openid profile email
         &state=<S>&nonce=<N>
  3. 307 Redirect → IdP 로그인 페이지
```

### `POST /api/auth/callback`  ← form_post (GET 아님)

```
1. IdP가 code + id_token + state 를 폼 본문(form_post)으로 POST
2. id_token RS256 서명 검증 (SSO_CERT_PATH 공개 인증서)
3. exp 만료 검증 + nonce 검증 → Redis에서 소비(삭제)
4. claim 추출: employee_number(=sabun), username(=username), email(=mail)
   auth_level: 기본 ENGINEER, email ∈ ADMIN_EMAILS 면 ADMIN 으로 승격
5. users upsert (employee_number ON CONFLICT)
6. 세션 JWT 생성 → 쿠키 발급 → 303 → SSO_RETURN_URL
```

> ⚠️ **이 콜백 경로(`/api/auth/callback`)는 init_login의 redirect_uri 및 ADFS에 등록한
> redirect_uri와 정확히 일치해야 한다.** 불일치 시 422 또는 무한 리다이렉트. 새 도메인/포트마다
> redirect_uri를 ADFS에 추가 등록해야 한다.

### `GET /api/auth/session`

```
1. {SESSION_COOKIE_NAME} 쿠키에서 세션 JWT 읽기 (없으면 authenticated:false)
2. verify_session_token → 서명/만료 검증
3. 응답:
   200 → { "authenticated": true,  "user": { employee_number, username, email, auth } }
   200 → { "authenticated": false, "user": null }   (쿠키 없음/검증 실패)
```

### `POST /api/auth/logout`

```
백엔드: {SESSION_COOKIE_NAME} 쿠키 만료 → { "ok": true }
프론트: 이어서 window.location = IDP_LOGOUT_URL 로 IdP RP-initiated 로그아웃
        (ADFS: .../adfs/ls/?wa=wsignoutcleanup1.0)
```

---

## 7. 세션 만료 / 재인증

세션은 무상태 JWT라 만료(180분)되면 `/session`이 `authenticated:false`를 돌려준다.

```
프론트 GET /api/auth/session → authenticated:false
  └─ window.location = /api/auth/sso/init
       ├─ IdP 세션 살아있음(보통 8h) → 사용자 개입 없이 즉시 재인증(callback 복귀)
       └─ IdP 세션도 만료            → IdP 로그인 화면
```

별도 "세션 만료" 페이지는 불필요하다.

---

## 8. 프론트엔드 인증 흐름

```
앱 로드 (App.tsx)
  ↓
GET /api/auth/session
  ├─ authenticated:true  → authAtom 저장 → 대시보드 렌더
  └─ authenticated:false → window.location = /api/auth/sso/init
              ↓
           [dev]  즉시 세션 발급 → 303 → /
           [운영] IdP 로그인 → POST /api/auth/callback → 303 → /
              ↓
           GET /api/auth/session → authenticated:true → 대시보드
```

```typescript
// atoms/authAtom.ts
interface AuthUser {
  employee_number: string
  username: string
  email: string
  auth: 'ENGINEER' | 'ADMIN'
}
const authAtom = atom<AuthUser | null>(null)
```

---

## 9. WebSocket 인증

별도 토큰 불필요. WS 핸드셰이크 시 세션 쿠키가 same-origin으로 자동 전송된다. 서버는
`/session`과 **동일한 JWT 검증 경로**로 처리한다(Redis 세션 조회 아님).

```python
# api/ws.py
@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket, sso: SsoVerifier = Depends(sso_verifier_dep), ...):
    token = ws.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION); return
    try:
        user = await VerifySessionToken(sso).execute(token)   # JWT 서명/만료 검증
    except PermissionError:
        await ws.close(code=status.WS_1008_POLICY_VIOLATION); return
    await ws.accept()
    # 이후 user.employee_number 로 스트리밍
```

---

## 10. 필요 패키지

| 어댑터 | 패키지 |
|--------|--------|
| 공통(폼 파싱) | `python-multipart` (form_post 콜백 파싱. 없으면 콜백 422/RuntimeError) |
| real(사내) | `PyJWT` (세션 HS256 + id_token RS256), `cryptography` (RS256/PEM), `redis` (asyncio, nonce) |
| fake/dev | 추가 의존성 없음 |

> ⚠️ **`python-jose`가 아니라 `PyJWT`다**(코드는 `import jwt`). real 어댑터 의존성은
> 사내 `pyproject`/Dockerfile에 추가한다. 사외 베이스 `pyproject`에는 fake 경로만 있어
> 이 패키지들이 없다(정상).

---

## 11. 사내 배포 전 체크리스트 (인증)

- [ ] ADFS에 redirect_uri 등록: `{APP_BASE_URL}/api/auth/callback`
      (Response Type=`code id_token`, Response Mode=`form_post`). 새 도메인/포트마다 추가 등록.
- [ ] `IDP_LOGIN_URL` / `IDP_LOGOUT_URL` / `IDP_CLIENT_ID` / `APP_BASE_URL` 값 확인 후 `.env.prod`
- [ ] IdP 공개 인증서를 `SSO_CERT_PATH`(컨테이너 `/app/certs/sso.cert`)에 마운트
- [ ] `JWT_SECRET` 강한 랜덤값으로 설정(기본 `dev-insecure-change-me` 금지)
- [ ] `ADMIN_EMAILS` 설정(관리자 승격 대상)
- [ ] 운영 Nginx HTTPS 종단 → `SESSION_COOKIE_SECURE=true`
- [ ] Redis 기동(nonce 저장용) + `REDIS_URL` 설정
- [ ] `.env.prod` 모든 키가 `env_file:`로 컨테이너에 주입되는지 확인(누락 시 빈값 폴백 → 로그인 실패)
