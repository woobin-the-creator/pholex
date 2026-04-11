export interface LotRow {
  lot_id: string
  status: string
  equipment: string
  process_step: string
  hold_comment: string
  updated_at: string
}

export interface MyHoldResponse {
  rows: LotRow[]
}
