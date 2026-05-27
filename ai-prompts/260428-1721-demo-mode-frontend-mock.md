# 데모 모드 인증 우회 + lot mock 데이터 — 사내 확인 필요 항목

## 이 프롬프트가 작성된 배경 (환경 차이)

이 문서는 GitHub 레포 코드만 접근 가능한 외부 AI(Claude Code)가 작성했습니다.
`codex/v2` 브랜치에는 frontend(React/Vite)만 commit되어 있고, `backend/app/` 하위에는
git-tracked `.py` 소스가 없습니다 (`git ls-tree -r codex/v2 -- backend/app` 결과 없음).
즉 외부 AI는 사내 백엔드의 실제 인증/lot 응답 형태, WebSocket 메시지 스키마, SSO 동작을
검증할 수 없습니다.

본 변경은 예비 사용자에게 dashboard shell을 보여주기 위해 **백엔드 없이도 화면이 뜨도록**
임시 데모 모드와 mock lot 데이터를 프론트엔드에 추가한 것입니다. 실제 백엔드가 붙는
시점에 사내에서 확인/조정해야 할 갭이 있어 이 spec을 남깁니다.

## 상황

### 변경 요지

| 파일 | 핵심 변경 |
|------|-----------|
| `frontend/src/app/App.tsx` | `import.meta.env.VITE_DEMO_MODE === 'true'`이면 `/api/auth/session` 호출을 건너뛰고 `DEMO_USER` 더미 주입 |
| `frontend/src/hooks/useMyHoldTable.ts` | DEMO 모드에서 fetch + WebSocket 연결을 모두 skip하고 `DEMO_ROWS` 5건을 atom에 한 번 주입 |
| `frontend/src/components/panels/LotHoldPanel.tsx` | `<colgroup>` + `title` tooltip 추가 (UI only) |
| `frontend/src/styles.css` | dense Excel-style table로 재디자인 (UI only) |

### 데모 인증 계약

```ts
const DEMO_USER: SessionUser = {
  id: 0,
  employee_id: 'DEMO-0001',
  employee_number: 'DEMO-0001',
  username: '데모 사용자',
  email: 'demo@pholex.local',
  auth: 'ENGINEER',
}
```

- `VITE_DEMO_MODE !== 'true'`일 때는 기존 동작 유지 (`getSession()` → 401이면 SSO redirect, 실패 시 splash 에러).
- `VITE_DEMO_MODE === 'true'`일 때는 네트워크 호출 0건, 즉시 `DEMO_USER`로 셸 렌더.

### 데모 lot 데이터 계약

```ts
const DEMO_ROWS: LotRow[] = [
  { lotId: 'LOT-A2948', status: 'hold',            equipment: 'CMP-03',   processStep: 'CMP / 슬러리 모니터', holdComment: 'Pad life 초과 의심 — 측정값 확인 필요', updatedAt: '2026-04-28T07:42:11+09:00' },
  { lotId: 'LOT-B1175', status: 'hold',            equipment: 'ETCH-11',  processStep: 'Dry Etch / Poly',      holdComment: 'OES 신호 이상, eng review 대기',          updatedAt: '2026-04-28T07:31:54+09:00' },
  { lotId: 'LOT-C3320', status: 'hold',            equipment: 'IMP-02',   processStep: 'Implant / NWell',      holdComment: 'Dose 검증 재측정 요청',                   updatedAt: '2026-04-28T06:58:02+09:00' },
  { lotId: 'LOT-D8841', status: 'review',          equipment: 'METRO-07', processStep: 'Overlay 측정',          holdComment: 'overlay 스펙 in/out 경계, 2nd opinion',   updatedAt: '2026-04-28T06:12:40+09:00' },
  { lotId: 'LOT-E5026', status: 'release-pending', equipment: 'LITHO-04', processStep: 'Photo / Mask 4',        holdComment: 'Hold 해제 승인 대기 (PE 결재)',           updatedAt: '2026-04-28T05:47:18+09:00' },
]
```

> ⚠ AI 메모리에 따르면 사내 `lot_status` 테이블의 CHECK 제약은 `run / wait / hold`
> 세 가지뿐입니다. 위 mock의 `'review'`와 `'release-pending'`은 **스키마와 불일치**합니다.
> 화면 다양성을 위해 임의로 만들었으나 실제 enum과 맞춰야 합니다.

## 해야 할 일

### 케이스 A — `VITE_DEMO_MODE` 환경변수의 위치/이름이 사내 컨벤션과 호환되는지

- **A1. 호환됨 (대시보드 데모용 flag로 그대로 채택):** 추가 작업 없음.
  단, 운영 빌드에서 절대 켜지지 않도록 빌드 파이프라인에서 명시적으로 `unset VITE_DEMO_MODE` 보장.
- **A2. 사내가 이미 다른 환경변수 prefix(예: `PHX_*`, `INTERNAL_*`)를 강제함:**
  변수명을 `VITE_PHX_DEMO_MODE` 등으로 일괄 rename. 적용 위치 2곳:
  `frontend/src/app/App.tsx:5`, `frontend/src/hooks/useMyHoldTable.ts:14`.
- **A3. 데모 flag 자체를 코드에서 제거하고 사내 mock 백엔드를 띄우는 방식으로 통일:**
  `App.tsx`/`useMyHoldTable.ts`의 `DEMO_MODE` 분기 전체를 revert하고, 대신 사내가
  `/api/auth/session`·`/api/lots/my-hold`·`/ws`에 mock으로 응답하는 정적 서버를 제공.

### 케이스 B — `DEMO_USER`의 `auth` 값과 `SessionUser` 형태가 실제 백엔드 응답과 맞는지

`frontend/src/types/auth.ts`는 `auth?: 'ENGINEER' | 'ADMIN'`만 정의되어 있습니다.

- **B1. 실제 백엔드도 위 두 값만 반환:** 그대로 OK.
- **B2. 사내가 추가 role(예: `OPERATOR`, `VIEWER`)을 사용:** `types/auth.ts`의 union 타입을
  먼저 확장한 뒤, `DEMO_USER.auth` 값을 데모 화면에서 가장 많이 보일 role로 조정.

### 케이스 C — `DEMO_ROWS.status` 값이 사내 `lot_status` enum과 불일치 (확인 1순위)

메모리상 enum은 `run / wait / hold`. mock의 `'review'`, `'release-pending'`은 임의값.

- **C1. 메모리가 최신 사내 스키마와 일치:** mock의 `'review'` → `'wait'`, `'release-pending'` → `'wait'` 등으로
  바꾸고, hold가 아닌 다양한 상태 표시는 `equipment`/`processStep`/`holdComment` 텍스트 차이로만 표현.
  (`LotHoldPanel`의 `status-pill--hold` 분기 외 나머지는 default pill로 처리됨)
- **C2. 사내가 `lot_status`에 더 많은 값을 추가했음:** 실제 enum 목록을 알려주면
  `DEMO_ROWS`와 `LotHoldPanel.tsx`의 `status-pill` 분기(`status === 'hold'` 외 처리)를
  enum에 맞춰 조정.

### 케이스 D — `LotRow.equipment` / `processStep` / `holdComment` 형식 가이드

mock에서 `processStep`은 `"CMP / 슬러리 모니터"` 같이 자유 한국어로 만들었습니다.

- **D1. 실제 백엔드가 짧은 코드(`"CMP_SLURRY_MON"`)만 반환:** 사내에서 i18n 매핑이 별도로 있는지 안내.
- **D2. 자유 텍스트 OK:** 추가 조치 없음.

### 케이스 E — 본 이슈 #3의 근본 처리 방향 결정

본 변경은 issue #3 (codex/v2에서 dev 서버 메인 페이지 로드 실패)의 임시 회피책입니다.
사내에서 다음 중 하나로 최종 정리 필요:

- **E1.** vite `server.proxy`로 `/api`를 사내 백엔드에 연결 + 사내 백엔드 띄우는 가이드 추가 → 데모 모드 제거.
- **E2.** dev-only mock middleware(`vite.config.ts`)로 `/api/*` 응답 stub → 데모 모드 제거.
- **E3.** 데모 모드를 정식 채택하고 `VITE_DEMO_MODE=true` 빌드를 별도 산출물로 운영(예: 데모 사이트).

## 테스트 실행

```bash
# 데모 모드 (백엔드 불필요) — 셸 + mock lot 5건 표시
cd frontend
VITE_DEMO_MODE=true npm run dev
# → http://localhost:5173/ 접속하여 확인

# 운영 빌드에서 데모 flag가 안 켜졌는지 확인 (가드 검증)
cd frontend
npm run build
# 산출물 안에 'DEMO-0001' 문자열이 포함되어 있으면 안 됨:
grep -r "DEMO-0001" dist/ && echo "❌ leak" || echo "✅ no leak"
```

## 변경된 파일 라인 참조 (사내 검토용)

- `frontend/src/app/App.tsx:14-23` — `DEMO_MODE`, `DEMO_USER` 상수
- `frontend/src/app/App.tsx:55-60` — `loadSession()` 내부 데모 분기
- `frontend/src/hooks/useMyHoldTable.ts:14-58` — `DEMO_MODE`, `DEMO_ROWS`, useEffect 데모 분기
