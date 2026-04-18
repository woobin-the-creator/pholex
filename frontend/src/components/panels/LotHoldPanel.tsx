import { formatDateTime } from '../../utils/format'
import type { LotRow } from '../../types/lot'

interface LotHoldPanelProps {
  rows: LotRow[]
  loading: boolean
  error: string | null
  lastUpdated: string | null
  onRefresh: () => void
}

export function LotHoldPanel({ rows, loading, error, lastUpdated, onRefresh }: LotHoldPanelProps) {
  return (
    <section className="panel lot-panel" aria-labelledby="lot-hold-title" data-testid="dashboard-panel">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">1. MVP Live Slot</p>
          <h2 id="lot-hold-title" className="panel__title">
            내 lot hold
          </h2>
        </div>

        <div className="panel__actions">
          <span className="panel__meta">Last update: {formatDateTime(lastUpdated)}</span>
          <button type="button" className="panel__button" onClick={onRefresh} disabled={loading}>
            <span className="material-symbols-outlined" aria-hidden="true">
              refresh
            </span>
            즉시 갱신
          </button>
        </div>
      </header>

      {error ? <p className="panel__error">{error}</p> : null}

      <div className="lot-panel__table-wrap">
        <table className="lot-table">
          <thead>
            <tr>
              <th>Lot ID</th>
              <th>상태</th>
              <th>장비</th>
              <th>공정 단계</th>
              <th>Hold 사유</th>
              <th>마지막 갱신</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="lot-table__empty">
                  데이터를 불러오는 중입니다.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="lot-table__empty">
                  현재 내 hold lot이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.lotId}
                  className={`lot-table__row${row.status === 'hold' ? ' lot-table__row--hold' : ''}`}
                  data-status={row.status}
                >
                  <td className="lot-table__lot-id">{row.lotId}</td>
                  <td>
                    <span
                      className={`status-pill${row.status === 'hold' ? ' status-pill--hold' : ' status-pill--default'}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td>{row.equipment ?? '-'}</td>
                  <td>{row.processStep ?? '-'}</td>
                  <td>{row.holdComment ?? '-'}</td>
                  <td>{formatDateTime(row.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
