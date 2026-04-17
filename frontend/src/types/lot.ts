export interface LotRow {
  lot_id: string
  status: string
  equipment: string
  process_step: string
  hold_comment: string
  updated_at: string
}

export interface ApiLotRow {
  lotId: string
  status: string
  equipment?: string | null
  processStep?: string | null
  holdComment?: string | null
  updatedAt?: string | null
}

export interface MyHoldResponse {
  rows: ApiLotRow[]
  lastUpdated?: string | null
}

export function normalizeLotRow(row: ApiLotRow | LotRow): LotRow {
  const candidate = row as Partial<ApiLotRow & LotRow>

  return {
    lot_id: candidate.lotId ?? candidate.lot_id ?? '',
    status: candidate.status ?? '',
    equipment: candidate.equipment ?? '',
    process_step: candidate.processStep ?? candidate.process_step ?? '',
    hold_comment: candidate.holdComment ?? candidate.hold_comment ?? '',
    updated_at: candidate.updatedAt ?? candidate.updated_at ?? ''
  }
}

export function normalizeLotRows(rows: Array<ApiLotRow | LotRow>): LotRow[] {
  return rows.map(normalizeLotRow)
}

export interface NormalizedMyHoldResponse {
  rows: LotRow[]
  lastUpdated: string | null
}
