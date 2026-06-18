export interface LotRow {
  lotId: string
  status: string
  equipment: string | null
  processStep: string | null
  holdComment: string | null
  updatedAt: string | null
}

export interface DumpMeta {
  lastRunAt: string | null
  freshMaxMinutes: number
  staleMinMinutes: number
}

export interface SlotPayload {
  tableId: number
  rows: LotRow[]
  diff: boolean
  lastUpdated: string | null
  dumpMeta?: DumpMeta | null
}
