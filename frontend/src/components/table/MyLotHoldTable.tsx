import type { LotRow } from '../../types/lot'

interface MyLotHoldTableProps {
  rows: LotRow[]
}

const columns: Array<{ key: keyof LotRow; label: string }> = [
  { key: 'lot_id', label: 'Lot ID' },
  { key: 'status', label: '상태' },
  { key: 'equipment', label: '장비' },
  { key: 'process_step', label: '공정 단계' },
  { key: 'hold_comment', label: 'Hold 사유' },
  { key: 'updated_at', label: '마지막 갱신' }
]

export function MyLotHoldTable({ rows }: MyLotHoldTableProps) {
  return (
    <table className="table-slot__table">
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key}>{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.lot_id} className={row.status === 'hold' ? 'table-slot__row--critical' : undefined}>
            <td>{row.lot_id}</td>
            <td>{row.status}</td>
            <td>{row.equipment}</td>
            <td>{row.process_step}</td>
            <td>{row.hold_comment}</td>
            <td>{new Date(row.updated_at).toLocaleString('ko-KR', { hour12: false })}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
