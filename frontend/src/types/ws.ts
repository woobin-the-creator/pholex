import type { LotRow } from './lot'

export interface SocketEnvelope<T = unknown> {
  type: string
  payload: T
}

export interface TableUpdatePayload {
  tableId: number
  rows: LotRow[]
  diff: boolean
}
