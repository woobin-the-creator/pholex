#!/usr/bin/env bash
# 배포 후 스택 자동 점검 — "완료" 선언 전에 반드시 돌린다.
# 반복 회귀(컨테이너 다운 / ADAPTER_MODE / DB 행수 / 쿠키 secure / 엔드포인트 500 /
#           옛 프론트 번들 / python-multipart / redis)를 한 번에 검사한다.
#
# 사용법:  scripts/verify-stack.sh dev | prod
# 종료코드: FAIL이 하나라도 있으면 1 (CI/스크립트에서 게이트로 사용 가능)
#
# 증거는 전부 터미널 출력(스크린샷 불필요). 브라우저 실제 렌더는 사람이 별도 확인.
set -uo pipefail

STACK="${1:-}"
case "$STACK" in
  dev)  PROJECT="pholex-dev"; COMPOSE=(-f docker-compose.yml -f docker-compose.dev.yml)
        BASE="http://localhost:10014"; CURL=(curl -s); SCHEME="http"; EXPECT_SECURE="false" ;;
  prod) PROJECT="pholex";     COMPOSE=(-f docker-compose.yml -f docker-compose.prod.yml)
        BASE="https://localhost:10004"; CURL=(curl -s -k); SCHEME="https"; EXPECT_SECURE="true" ;;
  *) echo "usage: $0 dev|prod" >&2; exit 2 ;;
esac
DC=(docker compose -p "$PROJECT" "${COMPOSE[@]}")
PASS=0; FAIL=0; WARN=0
ok()   { echo "  ✅ PASS  $*"; PASS=$((PASS+1)); }
bad()  { echo "  ❌ FAIL  $*"; FAIL=$((FAIL+1)); }
warn() { echo "  ⚠️  WARN  $*"; WARN=$((WARN+1)); }
echo "=== verify-stack: $STACK ($PROJECT, $BASE) ==="

# 1) 컨테이너 상태 — 전부 running 인가
echo "[1] 컨테이너 상태"
PS="$("${DC[@]}" ps --format '{{.Service}}\t{{.State}}' 2>/dev/null)"
echo "$PS" | sed 's/^/      /'
if echo "$PS" | grep -qiE 'exit|restarting|dead'; then bad "죽었거나 재시작 중인 컨테이너 있음"; else ok "모든 컨테이너 running"; fi
BACKEND_UP=$(echo "$PS" | grep -i backend | grep -ic running)

# 2) 백엔드 env — ADAPTER_MODE / DEV_SSO_BYPASS / SESSION_COOKIE_SECURE
echo "[2] 백엔드 env"
ENVJSON="$("${DC[@]}" exec -T backend printenv 2>/dev/null)"
amode=$(echo "$ENVJSON" | grep -E '^ADAPTER_MODE=' | cut -d= -f2-)
bypass=$(echo "$ENVJSON" | grep -E '^DEV_SSO_BYPASS=' | cut -d= -f2-)
csec=$(echo "$ENVJSON" | grep -E '^SESSION_COOKIE_SECURE=' | cut -d= -f2-)
echo "      ADAPTER_MODE=$amode  DEV_SSO_BYPASS=$bypass  SESSION_COOKIE_SECURE=$csec"
[ "$amode" = "real" ] && ok "ADAPTER_MODE=real" || bad "ADAPTER_MODE=$amode (real 아님 → 더미/mock 위험)"
if [ "$STACK" = prod ]; then
  [ "$bypass" = "false" ] && ok "prod DEV_SSO_BYPASS=false" || bad "prod인데 DEV_SSO_BYPASS=$bypass (mock 로그인 위험)"
fi
# 쿠키 secure: dev(HTTP)=false 여야 무한 새로고침 안 남, prod(HTTPS)=true
[ "$csec" = "$EXPECT_SECURE" ] && ok "SESSION_COOKIE_SECURE=$csec ($SCHEME에 맞음)" \
  || bad "SESSION_COOKIE_SECURE=$csec (이 스택은 $EXPECT_SECURE 여야 함 — 새로고침 루프/쿠키 미저장 위험)"
# SSO 콜백 의존성
echo "$ENVJSON" | grep -q '^IDP_CLIENT_ID=.\+' && ok "IDP_CLIENT_ID 채워짐" || { [ "$STACK" = prod ] && bad "IDP_CLIENT_ID 빈값 (SSO 루프)" || warn "IDP_CLIENT_ID 빈값(dev bypass면 무방)"; }

# 3) DB — 백엔드의 실제 DATABASE_URL로 핵심 테이블 행수
echo "[3] DB 테이블/행수 (백엔드 DATABASE_URL 기준)"
DBOUT="$("${DC[@]}" exec -T backend python - <<'PY' 2>/dev/null
import asyncio,os
try:
    import asyncpg
except Exception as e:
    print("NO_ASYNCPG"); raise SystemExit
url=os.environ.get("DATABASE_URL","").replace("+asyncpg","")
async def main():
    try: c=await asyncpg.connect(url)
    except Exception as e: print("CONNECT_ERR",type(e).__name__); return
    for t in ("lot_status","users","keyword_presets"):
        try: print(t,await c.fetchval(f"SELECT count(*) FROM {t}"))
        except Exception as e: print(t,"MISSING",type(e).__name__)
    await c.close()
asyncio.run(main())
PY
)"
echo "$DBOUT" | sed 's/^/      /'
lot=$(echo "$DBOUT" | awk '/^lot_status/{print $2}')
if echo "$DBOUT" | grep -q CONNECT_ERR; then bad "DB 연결 실패 (DATABASE_URL이 가리키는 DB 확인)"; fi
case "$lot" in
  ''|MISSING) bad "lot_status 없음/조회 실패 (빈 DB에 연결됐을 수 있음 — 런북 #1·#6)";;
  0) bad "lot_status=0 (TRUNCATE됨? 런북 #4 — dev 런타임 DB에 contract test 금지)";;
  *) if [ "$lot" -lt 100 ] 2>/dev/null; then warn "lot_status=$lot (golden/mock 의심, 실데이터는 보통 수천+)"; else ok "lot_status=$lot (실데이터)"; fi;;
esac
echo "$DBOUT" | grep -q '^users MISSING' && bad "users 테이블 없음 (빈 DB 연결 의심 — 손수 CREATE 말 것, 런북)" || true
echo "$DBOUT" | grep -q '^keyword_presets MISSING' && bad "keyword_presets 없음 (alembic upgrade 필요, 런북 #7)" || true

# 4) SSO 콜백 의존성 — python-multipart / redis
echo "[4] SSO 콜백 의존성"
"${DC[@]}" exec -T backend python -c "import multipart" 2>/dev/null && ok "python-multipart 있음" || bad "python-multipart 없음 (콜백 form_post 500)"
echo "$PS" | grep -qi redis && ok "redis 컨테이너 있음" || warn "redis 없음 (SSO nonce 검증 실패 가능)"

# 5) 엔드포인트 — 500 이면 FAIL (200/401/307 은 정상)
echo "[5] 엔드포인트 상태코드 (<base> 통해)"
check_ep() {
  local m="$1" path="$2"; shift 2
  local code; code=$("${CURL[@]}" -o /dev/null -w '%{http_code}' -X "$m" "$BASE$path" "$@")
  printf "      %-4s %-28s %s\n" "$m" "$path" "$code"
  case "$code" in
    000) bad "$path 응답 없음 (서버 다운/포트)";;
    5*)  bad "$path = $code (서버 에러)";;
    *)   ok "$path = $code";;
  esac
}
check_ep GET  /api/auth/session
check_ep GET  /api/lots/my-hold
check_ep GET  /api/keyword-presets
check_ep POST /api/special-hold/search -H 'content-type: application/json' -d '{"groups":[],"limit":100,"offset":0}'

# 6) 프론트 번들 — 이번 PR UI(알람독/키워드 Hold) 문자열이 서빙 번들에 있나 (옛 UI 감지)
echo "[6] 프론트 번들 신선도"
HTML="$("${CURL[@]}" "$BASE/")"
ASSET=$(echo "$HTML" | grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' | head -1)
if [ -n "$ASSET" ]; then
  echo "      번들: $ASSET"
  JS="$("${CURL[@]}" "$BASE$ASSET")"
  if echo "$JS" | grep -q '알람 박스'; then ok "번들에 '알람 박스' 있음 (새 UI)"; else bad "번들에 '알람 박스' 없음 (옛 UI — 프론트 재빌드 필요)"; fi
  echo "$JS" | grep -q '키워드' && ok "번들에 '키워드' 있음" || warn "번들에 '키워드' 마커 없음"
else
  warn "index 번들 경로를 못 찾음 (HTML 확인 필요)"
fi

echo "=== 요약: PASS=$PASS  FAIL=$FAIL  WARN=$WARN ==="
[ "$FAIL" -eq 0 ] && { echo "✅ 게이트 통과 (FAIL 0). 단, 브라우저 실제 로그인+렌더는 사람이 확인."; exit 0; } \
                  || { echo "❌ FAIL $FAIL건 — '완료' 선언 금지. 위 항목부터 처치(런북 docs/troubleshooting.md)."; exit 1; }
