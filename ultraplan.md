# Pholex — 랏 현황 조회 대시보드 Ultraplan

## 1. 제품 개요

**Pholex**는 반도체 제조 공정의 랏(Lot) 현황을 실시간으로 모니터링하는 웹 기반 대시보드입니다.
다양한 필터를 통해 원하는 데이터를 빠르게 탐색하고, 6개 섹션으로 구성된 메인 화면에서 공정 현황을 한눈에 파악할 수 있습니다.

---

## 2. PRD (Product Requirements Document)

### 2.1 목표

- 제조 현장 엔지니어 및 관리자가 랏 상태를 실시간으로 파악
- 필터 기반 탐색으로 원하는 데이터에 빠르게 접근
- 공정별 병목, 홀드, 완료 현황을 직관적으로 시각화

### 2.2 사용자

| 역할 | 주요 관심사 |
|------|------------|
| 공정 엔지니어 | 특정 장비/공정의 랏 현황, Hold 원인 |
| 생산 관리자 | 전체 WIP, TAT, 생산 목표 달성률 |
| 품질 담당자 | Scrap/Hold 랏, 이상 현황 추적 |

### 2.3 핵심 기능

#### 좌측 사이드바 — 필터 패널

| 필터 | 세부 내용 |
|------|----------|
| 공정 단계 | Diffusion / Etch / CMP / Photo / 기타 |
| 장비 | 장비 ID 다중 선택 |
| 날짜 범위 | 조회 기간 (DatePicker) |
| 랏 상태 | In Progress / Hold / Complete / Scrapped |
| 우선순위 | Hot / Normal / Cold |
| Product | 제품군 선택 |
| Layer | 레이어 선택 |
| 필터 초기화 | 전체 필터 리셋 버튼 |

#### 메인 화면 — 2×3 그리드 (2열×3행)

| 행\열 | 좌 (Col 1) | 우 (Col 2) |
|-------|-----------|-----------|
| 1행 | **전체 현황 요약** — 총 랏 수, 진행중/홀드/완료/스크랩 카운트 | **WIP 트렌드** — 시간대별 공정 내 랏 수 추이 |
| 2행 | **공정별 분포** — 각 스텝별 랏 수 현황 | **Hold 랏 목록** — 홀드 중인 랏 상세 테이블 |
| 3행 | **TAT (Turn Around Time)** — 공정별 평균 소요 시간 | **최근 완료 랏** — 최근 완료된 랏 리스트 |

---

## 3. 기술 스택

### Frontend

| 항목 | 선택 | 이유 |
|------|------|------|
| Framework | **Next.js 14 (App Router)** | SSR/SSG, 파일 기반 라우팅 |
| Language | **TypeScript** | 타입 안전성, 유지보수성 |
| Styling | **Tailwind CSS** | 빠른 UI 구성 |
| UI Components | **shadcn/ui** | 접근성 보장, 커스터마이징 용이 |
| Charts | **Recharts** | React 친화적, 경량 |
| State | **Zustand** | 필터 전역 상태 관리 |
| Data Fetching | **TanStack Query (React Query)** | 캐싱, 자동 리페치, 로딩/에러 상태 |

### Backend (MVP: Mock → 이후 실제 연동)

| 항목 | 선택 |
|------|------|
| API | Next.js Route Handlers (Mock API) |
| DB | PostgreSQL + Prisma (실제 연동 시) |
| ORM | Prisma |

### 개발 도구

| 항목 | 선택 |
|------|------|
| 패키지 매니저 | pnpm |
| Linter | ESLint |
| Formatter | Prettier |
| 버전 관리 | Git |

---

## 4. MVP 구현 계획

### Phase 1 — 기반 구성

- [ ] Next.js 프로젝트 초기화 (`pnpm create next-app`)
- [ ] Tailwind CSS + shadcn/ui 설정
- [ ] 전체 레이아웃 구성 (사이드바 + 메인 2×3 그리드)
- [ ] Mock 데이터 정의 (`/lib/mock-data.ts`)
- [ ] Zustand 스토어 초기 구성 (필터 상태)

### Phase 2 — 핵심 UI 컴포넌트

- [ ] 사이드바 필터 컴포넌트 (`FilterPanel`)
  - 공정/장비/날짜/상태/우선순위 필터
  - 필터 초기화 버튼
- [ ] 섹션 카드 컴포넌트 (`SectionCard`)
  - 전체 현황 요약 (KPI 카드)
  - WIP 트렌드 (라인 차트)
  - 공정별 분포 (바 차트)
  - Hold 랏 목록 (데이터 테이블)
  - TAT 현황 (바 차트)
  - 최근 완료 랏 (데이터 테이블)

### Phase 3 — 인터랙션 연결

- [ ] 필터 상태 → 데이터 필터링 로직 연결
- [ ] 로딩 / 에러 / 빈 데이터 상태 처리
- [ ] 반응형 레이아웃 (모바일/태블릿 대응)
- [ ] 새로고침 / 자동 폴링 (선택)

### Phase 4 — 실제 데이터 연동 (Post-MVP)

- [ ] PostgreSQL 스키마 설계
- [ ] Prisma 마이그레이션
- [ ] API Route Handlers 구현
- [ ] Mock → 실제 API 교체

---

## 5. 디렉터리 구조 (예정)

```
pholex/
├── app/
│   ├── layout.tsx          # 루트 레이아웃
│   ├── page.tsx            # 메인 대시보드
│   └── api/
│       └── lots/
│           └── route.ts    # Mock API
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx     # 필터 사이드바
│   │   └── MainGrid.tsx    # 2×3 그리드
│   ├── filters/
│   │   └── FilterPanel.tsx
│   └── sections/
│       ├── SummaryCard.tsx
│       ├── WipTrend.tsx
│       ├── ProcessDistribution.tsx
│       ├── HoldLotTable.tsx
│       ├── TatChart.tsx
│       └── RecentLots.tsx
├── lib/
│   ├── mock-data.ts        # Mock 데이터
│   └── types.ts            # 공통 타입 정의
├── store/
│   └── filter-store.ts     # Zustand 필터 스토어
└── public/
```

---

## 6. 미결 사항 (확인 필요)

- [ ] **도메인 확인** — 반도체 제조 공정 기준인지, 다른 도메인인지
- [ ] **섹션 구성** — 차트 위주 vs 테이블 위주 선호도
- [ ] **데이터 소스** — 연동할 실제 API/DB가 있는지, Mock으로 시작할지
- [ ] **인증/권한** — 로그인 기능 필요 여부
