# Pholex — 인증 설계

> OIDC 기반 사내 SSO · FastAPI 세션 관리 · 개발 환경 우회

---

## 개요

사내 IdP(Identity Provider)와 OIDC(OpenID Connect) 프로토콜로 연동한다.
사용자가 페이지에 접속하면 자동으로 SSO 인증이 이루어지고, 첫 접속 시 DB에 자동 등록(프로비저닝)된다.

> **기존 설계 수정**: `backend.md`에 명시된 "LDAP/AD via python-ldap"은 OIDC 기반으로 변경됨.
> python-ldap 패키지 불필요. `python-jose[cryptography]` 사용.

---

## 1. 권한 레벨

| auth 값 | 대상 | UI 차이 |
|---------|------|---------|
| `ENGINEER` | 일반 엔지니어 | 기본 대시보드 |
| `ADMIN` | 개발자/관리자 | 관리 기능 추가 (추후 구체화) |

DB 스키마: `auth VARCHAR(50) DEFAULT 'ENGINEER'`

---

## 2. 환경변수

```bash
# .env.example — SSO 연동 (사내에서만 실제 값 입력)
SSO_IDP_ENTITY_ID=        # IdP 인증 URL (예: https://sso.internal/oauth2/authorize)
SSO_CLIENT_ID=            # IdP에 등록된 Client ID
SSO_BASE_URL=             # Pholex 접근 주소 (예: https://pholex.internal)
SSO_CERT=                 # X.509 인증서 PEM 전체 문자열 (개행은 \n으로 escape)

# .env.dev — 개발 환경 SSO 우회 (사외 개발용)
DEV_SSO_BYPASS=true
DEV_SSO_USER_ID=test001
DEV_SSO_USERNAME=테스트엔지니어
DEV_SSO_EMPLOYEE_NUMBER=99999
DEV_SSO_AUTH=ENGINEER     # ENGINEER | ADMIN
```

---

## 3. DB 스키마 — users 테이블 (신규)

```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(100) UNIQUE NOT NULL,  -- IdP 고유 ID
    employee_number VARCHAR(50),               -- 사번
    username VARCHAR(100) NOT NULL,            -- 이름
    email VARCHAR(200),
    auth VARCHAR(50) DEFAULT 'ENGINEER',       -- ENGINEER | ADMIN
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ
);
CREATE INDEX idx_users_employee_id ON users(employee_id);
```

---

## 4. Redis 세션

```
key:   session:{uuid4}
value: { "user_id": 1, "employee_id": "...", "username": "...", "auth": "ENGINEER" }
TTL:   2주 (교대 주기 8h와 별개 — 로그인 유지 기간)
```

쿠키: `pholex_sid={uuid4}; HttpOnly; SameSite=Lax; Path=/`
- beta (HTTPS): `Secure` 플래그 추가
- dev (HTTP): `Secure` 플래그 없음

---

## 5. 엔드포인트

### `GET /api/auth/sso/init`

```
[DEV_SSO_BYPASS=true 일 때]
  → DEV_SSO_* 환경변수로 테스트 사용자 세션 즉시 생성
  → 302 Redirect → /

[사내 환경]
  1. nonce 생성 (uuid4)
  2. Redis 저장: nonce:{nonce} = 1, TTL 5분
  3. IdP URL 구성:
       {SSO_IDP_ENTITY_ID}
         ?client_id={SSO_CLIENT_ID}
         &redirect_uri={SSO_BASE_URL}/api/auth/sso/callback
         &response_mode=form_post
         &response_type=code+id_token
         &scope=openid+profile
         &nonce={nonce}
  4. 302 Redirect → IdP 로그인 페이지
```

### `POST /api/auth/sso/callback`

```
1. form_post로 id_token 수신
2. SSO_CERT에서 공개키 추출 (python-jose)
3. JWT 검증:
   - RS256 서명 검증
   - 만료시간(exp) 검증
   - nonce 검증 → Redis에서 소비(삭제)
4. 클레임 추출: employee_id, employee_number, username, email, auth
5. DB upsert:
   INSERT INTO users (...) VALUES (...)
   ON CONFLICT (employee_id) DO UPDATE SET last_login = NOW()
6. Redis 세션 저장 (TTL 2주)
7. HttpOnly 쿠키 발급 (pholex_sid)
8. 302 Redirect → /
```

### `GET /api/auth/session`

```
1. 쿠키에서 pholex_sid 읽기
2. Redis session:{sid} 조회
3. DB에서 최신 사용자 정보 조회
4. 응답:
   200 → { "authenticated": true, "user": { ... } }
   401 → { "authenticated": false }
```

### `POST /api/auth/logout`

```
1. Redis session:{sid} 삭제
2. 쿠키 만료 (Max-Age=0)
3. 200 OK
```

---

## 6. 세션 만료 처리

```
프론트엔드 GET /api/auth/session
  └─ 401 수신
       └─ window.location = /api/auth/sso/init
            └─ 사내: IdP가 기존 SSO 세션으로 자동 재인증
                      (사용자 개입 없이 투명하게 처리)
```

별도 "세션 만료" 페이지 불필요. 사용자는 잠깐의 리다이렉트 후 원래 대시보드로 복귀.

---

## 7. 프론트엔드 인증 흐름

```
앱 로드 (App.tsx)
  ↓
GET /api/auth/session
  ├─ 200 → authAtom 저장 → 대시보드 렌더
  └─ 401 → window.location = /api/auth/sso/init
              ↓
           [dev] 즉시 세션 생성 → 302 /
           [사내] IdP 로그인 → POST /api/auth/sso/callback → 302 /
              ↓
           GET /api/auth/session → 200 → 대시보드
```

```typescript
// atoms/authAtom.ts
interface AuthUser {
  id: number
  employee_id: string
  employee_number: string
  username: string
  email: string
  auth: 'ENGINEER' | 'ADMIN'
}

const authAtom = atom<AuthUser | null>(null)
```

---

## 8. WebSocket 인증

별도 토큰 불필요. WS 핸드셰이크 시 `pholex_sid` 쿠키가 자동 전송됨 (same-origin).

```python
# api/routes/ws.py
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    sid = websocket.cookies.get("pholex_sid")
    session = await redis.get(f"session:{sid}")
    if not session:
        await websocket.close(code=1008)
        return
    # 이후 정상 처리
```

---

## 9. 필요 패키지

```
# requirements.txt
python-jose[cryptography]   # JWT 검증 (RS256)
```

---

## 10. 사내 배포 전 체크리스트 (인증 관련)

- [ ] IdP에 redirect_uri 등록: `{SSO_BASE_URL}/api/auth/sso/callback`
- [ ] `SSO_IDP_ENTITY_ID`, `SSO_CLIENT_ID` 값 확인 후 `.env.beta`에 입력
- [ ] X.509 인증서 PEM을 `SSO_CERT`에 입력 (개행 → `\n` escape)
- [ ] beta Nginx에 HTTPS 설정 → 쿠키 `Secure` 플래그 활성화
