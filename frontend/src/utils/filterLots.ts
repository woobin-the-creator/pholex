import type { LotRow } from '../types/lot'

export interface LotFilters {
  lotIdQuery: string
  status: 'all' | 'hold' | 'wait' | 'run'
  recentOnly: boolean
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
    if (filters.status !== 'all' && row.status.toLowerCase() !== filters.status) {
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
