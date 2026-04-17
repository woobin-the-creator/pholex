import type { ApiLotRow } from './lot'

export interface SocketEnvelope<T = unknown> {
  type: string
  payload: T
}

export interface TableUpdatePayload {
  tableId: number
  rows: ApiLotRow[]
  diff: boolean
  lastUpdated?: string | null
}
