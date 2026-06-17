import type { LotRow } from '../types/lot'

// throwaway 프로토타입용 가짜 lot — 페이지네이션이 의미 있을 만큼(≈73건) 만든다.
const STATUSES = ['Hold', 'Hold', 'Active', 'PreActive', 'Hold', 'Aborted'] as const
const TOOLS = ['ETCH-07', 'CMP-02', 'LITHO-11', 'CVD-04', 'IMPL-09', 'DIFF-03', 'WET-06']
const STEPS = ['PHOTO', 'ETCH', 'CMP', 'CVD', 'IMPL', 'DIFF', 'METRO']
const REASONS = [
  'PM 대기',
  'Recipe 확인 필요',
  'Engineer hold',
  '계측 OOC',
  '설비 알람',
  'Lot merge 대기',
  '재작업 검토',
  '—',
]

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function makeMockRows(count = 73): LotRow[] {
  const rows: LotRow[] = []
  const base = Date.UTC(2026, 5, 17, 9, 0, 0) // 2026-06-17 09:00 KST-ish anchor
  for (let i = 0; i < count; i += 1) {
    const status = STATUSES[i % STATUSES.length]
    const minutesAgo = i * 7
    rows.push({
      lotId: `TLX${pad(7 + (i % 9))}${pad(100 + i)}.${pad(i % 25)}`,
      status,
      equipment: TOOLS[i % TOOLS.length],
      processStep: STEPS[i % STEPS.length],
      holdComment: status === 'Hold' ? REASONS[i % REASONS.length] : '—',
      updatedAt: new Date(base - minutesAgo * 60_000).toISOString(),
    })
  }
  return rows
}
