// [Phase 2] hold는 lot당 1:N. 한 lot에 조회자가 건 hold가 여러 건일 수 있어
// wire(backend/app/api/wire.py::hold_to_wire)가 hold 하나를 이 shape로 직렬화한다.
export interface HoldItem {
  operatorAdId: string
  operatorName: string | null
  itemType: string | null
  comment: string | null
  issueDate: string | null
}

export interface LotRow {
  lotId: string
  status: string
  equipment: string | null
  processStep: string | null
  // [Phase 2] lot이 실은 내 hold들. lot_row_to_wire(my-hold/special-hold)는 항상 이 배열을 싣는다.
  myHolds: HoldItem[]
  // 대표 hold 사유 — myHolds[0].comment에서 파생. watchlist(단일 hold_comment) 및
  // 아직 1:N으로 안 옮긴 슬롯[5] 표시용 backward-compat 필드다.
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
  lastUpdated: string | null
  dumpMeta?: DumpMeta | null
}
