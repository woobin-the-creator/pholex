import type { LotRow } from '../types/lot'

// status는 열린 집합 — raw lot_status_seg 값(Active/Hold/PreActive + 미래 값)을 그대로
// 비교한다. 'all'은 전체 표시 sentinel. 드롭다운 옵션은 실제 데이터에서 동적 수집한다.
export interface LotFilters {
  lotIdQuery: string
  status: string
  recentOnly: boolean
}

// 현재 로드된 rows에 실재하는 status 목록(중복 제거). Hold를 항상 맨 앞에 고정(슬롯[1] 핵심).
export function collectStatusOptions(rows: LotRow[]): string[] {
  const seen = new Set<string>()
  for (const row of rows) {
    if (row.status) seen.add(row.status)
  }
  const rest = [...seen].filter((s) => s !== 'Hold').sort()
  return seen.has('Hold') ? ['Hold', ...rest] : rest
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000

function getTimestamp(value: string | null): number | null {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

function getLatestTimestamp(rows: LotRow[]): number | null {
  const validTimestamps = rows.map((row) => getTimestamp(row.updatedAt)).filter((value): value is number => value !== null)
  return validTimestamps.length > 0 ? Math.max(...validTimestamps) : null
}

export function filterLotRows(rows: LotRow[], filters: LotFilters): LotRow[] {
  const normalizedQuery = filters.lotIdQuery.trim().toLowerCase()
  const latestTimestamp = getLatestTimestamp(rows)
  const recentCutoff = latestTimestamp === null ? null : latestTimestamp - THIRTY_MINUTES_MS

  return rows.filter((row) => {
    if (filters.status !== 'all' && row.status !== filters.status) {
      return false
    }

    if (normalizedQuery && !row.lotId.toLowerCase().includes(normalizedQuery)) {
      return false
    }

    if (filters.recentOnly && recentCutoff !== null) {
      const rowTimestamp = getTimestamp(row.updatedAt)
      if (rowTimestamp === null || rowTimestamp < recentCutoff) {
        return false
      }
    }

    return true
  })
}
