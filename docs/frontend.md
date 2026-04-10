# Pholex — 프론트엔드 설계

> React · Vite · TypeScript · TanStack Table · Jotai · 디자인 시스템

---

## 5. 프론트엔드 구조

### 5.1 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│  Header: 로고 | 팀 선택 | 사용자 정보 | 알림 벨        │
├────────────┬─────────────────────────────────────────────┤
│            │                                             │
│  Sidebar   │   ┌─────────────┐  ┌─────────────┐         │
│            │   │  Table [0]  │  │  Table [1]  │         │
│  - 글로벌  │   │             │  │             │         │
│    필터    │   └─────────────┘  └─────────────┘         │
│            │   ┌─────────────┐  ┌─────────────┐         │
│  - 팀 선택 │   │  Table [2]  │  │  Table [3]  │         │
│            │   │             │  │             │         │
│  - 기간   │   └─────────────┘  └─────────────┘         │
│            │   ┌─────────────┐  ┌─────────────┐         │
│  - 프리셋  │   │  Table [4]  │  │  Table [5]  │         │
│    저장    │   │             │  │             │         │
│            │   └─────────────┘  └─────────────┘         │
└────────────┴─────────────────────────────────────────────┘
```

### 5.2 디렉토리 구조

```
frontend/
├── src/
│   ├── app/
│   │   ├── App.tsx              # 루트 컴포넌트
│   │   ├── router.tsx           # 라우팅 (대시보드, 설정 등)
│   │   └── providers.tsx        # 전역 프로바이더
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── DashboardGrid.tsx    # 2x3 그리드 컨테이너
│   │   ├── table/
│   │   │   ├── DataTable.tsx        # TanStack Table 래퍼
│   │   │   ├── TableSlot.tsx        # 빈 슬롯 / 테이블 선택 UI
│   │   │   ├── TableHeader.tsx      # 테이블 제목 + 리프레시 버튼 + 마지막 갱신 시간
│   │   │   ├── VirtualRow.tsx       # 가상 스크롤 행
│   │   │   └── columns/            # 컬럼 정의 모듈
│   │   ├── filters/
│   │   │   ├── GlobalFilter.tsx
│   │   │   ├── TableFilter.tsx
│   │   │   └── FilterPreset.tsx
│   │   └── alerts/
│   │       ├── ToastAlert.tsx
│   │       └── RowHighlight.tsx
│   ├── hooks/
│   │   ├── useWebSocket.ts          # WebSocket 연결 관리
│   │   ├── useTableData.ts          # 테이블 데이터 페칭 + 캐시
│   │   └── useFilters.ts            # 필터 상태 관리
│   ├── atoms/                       # Jotai atom 정의
│   │   ├── authAtom.ts              # 인증 상태 (단일 atom)
│   │   ├── filterAtoms.ts           # 글로벌 필터 atom + tableFilterAtomFamily(tableId)
│   │   ├── tableAtoms.ts            # tableDataAtomFamily(tableId), tableLayoutAtom
│   │   └── alertAtoms.ts            # 알림 큐 atom
│   ├── services/
│   │   ├── api.ts                   # HTTP API 클라이언트
│   │   ├── ws.ts                    # WebSocket 클라이언트
│   │   └── auth.ts                  # SSO 인증 로직
│   └── types/
│       ├── lot.ts
│       ├── filter.ts
│       └── table.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

### 5.3 Jotai atomFamily 패턴 (테이블별 상태 분리)

```typescript
// atoms/tableAtoms.ts
import { atomFamily } from 'jotai/utils'
import { atom } from 'jotai'
import type { LotRow } from '../types/lot'

// 각 tableId마다 독립된 atom — 테이블 0 업데이트가 테이블 1~5 리렌더 유발하지 않음
export const tableDataAtomFamily = atomFamily((tableId: number) =>
  atom<LotRow[]>([])
)

export const tableLastUpdatedAtomFamily = atomFamily((tableId: number) =>
  atom<Date | null>(null)
)

export const tableLoadingAtomFamily = atomFamily((tableId: number) =>
  atom<boolean>(false)
)
```

---

## 8. WebSocket 클라이언트 메시지 (프론트엔드 관련)

```typescript
// 클라이언트 → 서버 (프론트엔드에서 송신하는 메시지)
{ type: "subscribe", payload: { tableId: 0, filters: {...} } }
{ type: "unsubscribe", payload: { tableId: 0 } }
{ type: "filter_change", payload: { scope: "global"|"table", tableId?: 0, filters: {...} } }
{ type: "refresh", payload: { tableId: 0 } }  // 수동 리프레시 버튼 클릭 시 송신
{ type: "heartbeat" }

// 서버 → 클라이언트 (프론트엔드에서 수신하는 메시지)
{ type: "table_update", payload: { tableId: 0, rows: [...], diff: true } }
{ type: "alert", payload: { lotId: "...", message: "...", severity: "warning"|"critical" } }
{ type: "session_info", payload: { activeUsers: 23 } }
{ type: "heartbeat_ack" }
```

> 전체 프로토콜 정의(서버 처리 로직 포함)는 `backend.md` Section 8 참고.

---

## 13. 디자인 시스템

> Notion 디자인 시스템(warm minimalism) 기반. 따뜻한 중성 톤, 속삭이듯 얇은 테두리, 다층 그림자로 제조 현장의 밀도 높은 데이터를 가독성 있게 표현한다.

### 13.1 색상 팔레트

#### Primary
| 이름 | 값 | 용도 |
|------|----|------|
| Notion Black | `rgba(0,0,0,0.95)` | 헤딩, 본문 텍스트 |
| Pure White | `#ffffff` | 페이지 배경, 카드 표면 |
| Notion Blue | `#0075de` | 주요 CTA, 링크, 인터랙티브 강조 |

#### Warm Neutral Scale
| 이름 | 값 | 용도 |
|------|----|------|
| Warm White | `#f6f5f4` | 사이드바 배경, 섹션 교차, 카드 Fill |
| Warm Dark | `#31302e` | 다크 서피스 텍스트 |
| Warm Gray 500 | `#615d59` | 보조 텍스트, 설명, 레이블 |
| Warm Gray 300 | `#a39e98` | 플레이스홀더, 비활성, 캡션 |

#### Semantic (알림/상태)
| 이름 | 값 | 용도 |
|------|----|------|
| Success Teal | `#2a9d99` | 정상, 완료 상태 |
| Success Green | `#1aae39` | 확인, 완료 배지 |
| Warning Orange | `#dd5b00` | 경고, 주의 알림 |
| Critical Red | `#e53e3e` | Critical 알림, 장애 |

#### Interactive
| 이름 | 값 | 용도 |
|------|----|------|
| Active Blue | `#005bab` | 버튼 active/pressed 상태 |
| Focus Blue | `#097fe8` | 포커스 링, 배지 텍스트 |
| Badge Blue Bg | `#f2f9ff` | 필 배지 배경 |
| Link Light Blue | `#62aef0` | 다크 배경 위 링크 |

#### CSS 변수

```css
:root {
  /* Primary */
  --color-text-primary: rgba(0, 0, 0, 0.95);
  --color-bg-primary: #ffffff;
  --color-accent: #0075de;
  --color-accent-active: #005bab;

  /* Warm Neutrals */
  --color-bg-secondary: #f6f5f4;
  --color-bg-dark: #31302e;
  --color-text-secondary: #615d59;
  --color-text-muted: #a39e98;

  /* Semantic */
  --color-success: #2a9d99;
  --color-success-green: #1aae39;
  --color-warning: #dd5b00;
  --color-critical: #e53e3e;

  /* Interactive */
  --color-focus: #097fe8;
  --color-badge-bg: #f2f9ff;
  --color-badge-text: #097fe8;

  /* Borders & Shadows */
  --border-whisper: 1px solid rgba(0, 0, 0, 0.1);
  --shadow-card: rgba(0,0,0,0.04) 0px 4px 18px,
                 rgba(0,0,0,0.027) 0px 2.025px 7.85px,
                 rgba(0,0,0,0.02) 0px 0.8px 2.93px,
                 rgba(0,0,0,0.01) 0px 0.175px 1.04px;
  --shadow-deep: rgba(0,0,0,0.01) 0px 1px 3px,
                 rgba(0,0,0,0.02) 0px 3px 7px,
                 rgba(0,0,0,0.02) 0px 7px 15px,
                 rgba(0,0,0,0.04) 0px 14px 28px,
                 rgba(0,0,0,0.05) 0px 23px 52px;
}
```

---

### 13.2 타이포그래피

**폰트**: `Inter, -apple-system, system-ui, "Segoe UI", Helvetica, Arial, sans-serif`

| 역할 | 크기 | 굵기 | 행간 | 자간 | 사용처 |
|------|------|------|------|------|--------|
| Display | 40px (2.5rem) | 700 | 1.20 | -1.0px | 페이지 없는 빈 슬롯 제목 |
| Section Heading | 26px (1.63rem) | 700 | 1.23 | -0.625px | 섹션 타이틀 |
| Card Title | 22px (1.38rem) | 700 | 1.27 | -0.25px | 테이블 슬롯 헤더, 카드 제목 |
| Body Large | 20px (1.25rem) | 600 | 1.40 | -0.125px | 인트로, 주요 설명 |
| Body | 16px (1rem) | 400 | 1.50 | normal | 기본 본문 |
| Body Medium | 16px (1rem) | 500 | 1.50 | normal | 네비게이션, 강조 UI |
| Body Semibold | 16px (1rem) | 600 | 1.50 | normal | 활성 상태 레이블 |
| Nav / Button | 15px (0.94rem) | 600 | 1.33 | normal | 버튼 텍스트, 네비 링크 |
| Caption | 14px (0.88rem) | 500 | 1.43 | normal | 메타데이터, 보조 레이블 |
| Caption Light | 14px (0.88rem) | 400 | 1.43 | normal | 갱신 시간, 부연 설명 |
| Badge | 12px (0.75rem) | 600 | 1.33 | 0.125px | 상태 배지, 태그 |
| Micro Label | 12px (0.75rem) | 400 | 1.33 | 0.125px | 타임스탬프, 소형 메타 |

**원칙:**
- 헤딩일수록 자간 압축 (-0.625px at 26px → normal at 16px)
- 4단계 굵기 체계: 400(읽기) / 500(인터랙션) / 600(강조) / 700(선언)
- 배지(12px)만 양수 자간(0.125px) — 작은 텍스트의 가독성 확보

---

### 13.3 스페이싱 시스템

**기본 단위: 8px**

| 토큰 | 값 | 용도 |
|------|----|------|
| `--space-1` | 4px | 아이콘-텍스트 간격, 마이크로 패딩 |
| `--space-2` | 8px | 배지 패딩, 인라인 갭 |
| `--space-3` | 12px | 버튼 수직 패딩 |
| `--space-4` | 16px | 버튼 수평 패딩, 카드 내부 패딩 |
| `--space-6` | 24px | 섹션 내부 패딩 |
| `--space-8` | 32px | 카드 간격, 그리드 갭 |
| `--space-12` | 48px | 섹션 수직 마진 |
| `--space-16` | 64px | 주요 섹션 간격 |

---

### 13.4 Border Radius 스케일

| 토큰 | 값 | 용도 |
|------|----|------|
| `--radius-micro` | 4px | 버튼, 입력 필드, 기능적 요소 |
| `--radius-sm` | 8px | 소형 카드, 인라인 컨테이너 |
| `--radius-md` | 12px | 표준 카드, 테이블 슬롯 컨테이너 |
| `--radius-lg` | 16px | 히어로 카드, 모달 |
| `--radius-pill` | 9999px | 배지, 상태 인디케이터, 알림 토스트 |

---

### 13.5 컴포넌트 스타일

#### 버튼

**Primary (파란색)**
```css
.btn-primary {
  background: #0075de;
  color: #ffffff;
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid transparent;
  font-size: 15px;
  font-weight: 600;
}
.btn-primary:hover { background: #005bab; }
.btn-primary:active { transform: scale(0.95); }
.btn-primary:focus-visible { outline: 2px solid #097fe8; }
```

**Secondary (반투명)**
```css
.btn-secondary {
  background: rgba(0, 0, 0, 0.05);
  color: rgba(0, 0, 0, 0.95);
  padding: 8px 16px;
  border-radius: 4px;
  border: var(--border-whisper);
  font-size: 15px;
  font-weight: 600;
}
.btn-secondary:hover { transform: scale(1.02); }
```

**상태 배지 (Pill)**
```css
.badge {
  background: #f2f9ff;
  color: #097fe8;
  padding: 4px 8px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.125px;
}
.badge-warning { background: #fff7ed; color: #dd5b00; }
.badge-critical { background: #fff0f0; color: #e53e3e; }
.badge-success  { background: #f0fdf4; color: #1aae39; }
```

#### 카드 / 테이블 슬롯
```css
.card {
  background: #ffffff;
  border: var(--border-whisper);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
}
.card:hover {
  box-shadow: var(--shadow-deep);
}
```

#### 입력 필드 / 필터
```css
.input {
  background: #ffffff;
  color: rgba(0, 0, 0, 0.9);
  border: 1px solid #dddddd;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 15px;
}
.input::placeholder { color: #a39e98; }
.input:focus {
  outline: 2px solid #097fe8;
  border-color: #0075de;
}
```

#### 알림 토스트
```css
.toast {
  background: #ffffff;
  border: var(--border-whisper);
  border-radius: 9999px;      /* pill 형태 */
  padding: 8px 16px;
  box-shadow: var(--shadow-deep);
  font-size: 14px;
  font-weight: 500;
}
.toast-warning { border-left: 3px solid #dd5b00; border-radius: 8px; }
.toast-critical { border-left: 3px solid #e53e3e; border-radius: 8px; }
```

---

### 13.6 깊이 & 그림자 시스템

| 레벨 | 처리 | 사용처 |
|------|------|--------|
| Flat (0) | 없음 | 페이지 배경, 텍스트 블록 |
| Whisper (1) | `1px solid rgba(0,0,0,0.1)` | 카드 외곽선, 구분선, 테이블 셀 |
| Soft Card (2) | 4층 그림자 (최대 opacity 0.04) | 테이블 슬롯, 필터 패널 |
| Deep Card (3) | 5층 그림자 (최대 opacity 0.05, blur 52px) | 모달, 드롭다운, 토스트 |
| Focus | `2px solid #097fe8` | 모든 인터랙티브 요소 키보드 포커스 |

> **그림자 철학**: 개별 opacity가 0.01~0.05인 다층 레이어가 누적되어 자연광 같은 깊이를 만든다. 단일 진한 그림자 대신, 12px~52px 블러 범위로 그라디언트처럼 퍼지는 방식.

---

### 13.7 레이아웃 원칙

- **최대 콘텐츠 너비**: 1920px (대시보드 전체 활용)
- **그리드 갭**: 24px (테이블 슬롯 간격)
- **사이드바 너비**: 240px (고정)
- **헤더 높이**: 56px
- **섹션 교차**: `#ffffff` ↔ `#f6f5f4` 배경 교차로 구역 구분 (테두리 없이 리듬 생성)
- **여백 철학**: 카드 내부는 16~24px 패딩, 카드 사이는 32px — 밀도 높은 데이터도 "섬처럼 읽힌다"

---

### 13.8 접근성 & 인터랙션 상태

| 상태 | 처리 |
|------|------|
| Default | 표준 + whisper border |
| Hover | 텍스트 색 이동, 버튼 `scale(1.02)` |
| Active/Pressed | `scale(0.95)`, 배경 어두워짐 |
| Focus | `2px solid #097fe8` 아웃라인 |
| Disabled | `#a39e98` 텍스트, opacity 0.5 |
| Loading | 골격(skeleton) — Warm White `#f6f5f4` fill |

**색상 대비 (WCAG 기준):**
- Primary text on white: ~18:1 (AAA)
- Secondary text (#615d59) on white: ~5.5:1 (AA)
- Notion Blue on white: ~4.6:1 (AA, 대형 텍스트 기준)
- Warning Orange on white: ~4.2:1 (AA, 대형 텍스트 기준)
