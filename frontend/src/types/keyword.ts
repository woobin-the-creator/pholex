import type { LotRow } from './lot'

export interface KeywordCondition {
  field: string
  value: string
}

export interface KeywordGroup {
  conditions: KeywordCondition[]
}

/** DNF — 그룹 안 AND, 그룹끼리 OR. */
export interface KeywordConfig {
  groups: KeywordGroup[]
}

export interface KeywordPreset {
  id: number
  name: string
  config: KeywordConfig
  isDefault: boolean
  createdAt: string | null
}

export interface SpecialHoldResult {
  tableId: number
  rows: LotRow[]
  total: number
  page: number
  pageSize: number
  lastUpdated: string | null
}
