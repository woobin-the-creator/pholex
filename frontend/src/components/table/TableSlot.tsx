import { MyLotHoldTable } from './MyLotHoldTable'
import { TableHeader } from './TableHeader'
import type { LotRow } from '../../types/lot'

interface TableSlotProps {
  title: string
  rows: LotRow[]
  loading: boolean
  lastUpdated: Date | null
  onRefresh: () => void
}

export function TableSlot({ title, rows, loading, lastUpdated, onRefresh }: TableSlotProps) {
  return (
    <section className="table-slot" aria-label={title}>
      <TableHeader title={title} lastUpdated={lastUpdated} onRefresh={onRefresh} refreshDisabled={loading} />
      {loading ? <p className="table-slot__empty">불러오는 중…</p> : null}
      {!loading && rows.length === 0 ? <p className="table-slot__empty">표시할 hold 랏이 없습니다.</p> : null}
      {!loading && rows.length > 0 ? <MyLotHoldTable rows={rows} /> : null}
    </section>
  )
}
