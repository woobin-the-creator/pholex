import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { formatDateTime } from '../../utils/format'
import { HOLD_STATUS, statusPillClass } from '../../utils/statusDisplay'
import type { LotRow } from '../../types/lot'

interface LotHoldPanelProps {
  rows: LotRow[]
  loading: boolean
  error: string | null
  lastUpdated: string | null
  onRefresh: () => void
  focusLotId?: string | null
  isMaximized?: boolean
  onToggleMaximize?: () => void
  vtName?: string
}

function shortClock(iso: string | null): string {
  if (!iso) return '--:--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function LotHoldPanel({
  rows,
  loading,
  error,
  lastUpdated,
  onRefresh,
  focusLotId,
  isMaximized = false,
  onToggleMaximize,
  vtName,
}: LotHoldPanelProps) {
  const [spinning, setSpinning] = useState(false)
  const [cometGeo, setCometGeo] = useState<{ w: number; h: number; d: string } | null>(null)
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

  useEffect(() => {
    if (!focusLotId) {
      setCometGeo(null)
      return
    }
    const row = rowRefs.current.get(focusLotId)
    row?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (!row) {
      setCometGeo(null)
      return
    }
    // 행 테두리를 따르는 둥근 경로 — 상단 중앙(w/2, 0)에서 시작해 시계방향 1회전.
    // r=h/2면 짧은 변이 반원(stadium). 코멧은 이 경로 위 stroke-dash라 모서리에서 곡선으로 휜다.
    const w = row.offsetWidth
    const h = row.offsetHeight
    const r = h / 2
    const d =
      `M ${w / 2} 0 H ${w - r} A ${r} ${r} 0 0 1 ${w} ${r} V ${h - r} ` +
      `A ${r} ${r} 0 0 1 ${w - r} ${h} H ${r} A ${r} ${r} 0 0 1 0 ${h - r} ` +
      `V ${r} A ${r} ${r} 0 0 1 ${r} 0 Z`
    setCometGeo({ w, h, d })
  }, [focusLotId])

  const handleRefresh = () => {
    setSpinning(true)
    window.setTimeout(() => setSpinning(false), 900)
    onRefresh()
  }

  const handleHeadDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    onToggleMaximize?.()
  }

  const renderBody = () => {
    if (loading && rows.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="lot-table__empty">데이터를 불러오는 중입니다.</td>
        </tr>
      )
    }
    if (rows.length === 0) {
      return (
        <tr>
          <td colSpan={6} className="lot-table__empty">현재 내 hold lot이 없습니다.</td>
        </tr>
      )
    }
    return rows.map((row) => {
      const isHold = row.status === HOLD_STATUS
      return (
        <tr
          key={row.lotId}
          ref={(el) => {
            if (el) rowRefs.current.set(row.lotId, el)
            else rowRefs.current.delete(row.lotId)
          }}
          className={`${isHold ? 'is-hold' : ''}${focusLotId === row.lotId ? ' is-focused' : ''}`.trim()}
          data-status={row.status}
        >
          <td className="lot-table__lot-id" title={row.lotId}>
            {focusLotId === row.lotId && cometGeo ? (
              <svg
                className="lot-trace-svg"
                width={cometGeo.w}
                height={cometGeo.h}
                viewBox={`0 0 ${cometGeo.w} ${cometGeo.h}`}
                fill="none"
                aria-hidden="true"
              >
                <path className="lot-trace-comet lot-trace-comet--tail" pathLength={100} d={cometGeo.d} />
                <path className="lot-trace-comet lot-trace-comet--mid" pathLength={100} d={cometGeo.d} />
                <path className="lot-trace-comet lot-trace-comet--head" pathLength={100} d={cometGeo.d} />
              </svg>
            ) : null}
            {row.lotId}
          </td>
          <td>
            <span className={`pill ${statusPillClass(row.status)}`}>
              {row.status}
            </span>
          </td>
          <td title={row.equipment ?? undefined}>{row.equipment ?? '—'}</td>
          <td title={row.processStep ?? undefined}>{row.processStep ?? '—'}</td>
          <td title={row.holdComment ?? undefined}>{row.holdComment ?? '—'}</td>
          <td title={row.updatedAt ?? undefined}>{shortClock(row.updatedAt)}</td>
        </tr>
      )
    })
  }

  return (
    <article
      className={`card card--span2 is-live${isMaximized ? ' is-maximized' : ''}`}
      aria-labelledby="lot-hold-title"
      data-testid="dashboard-panel"
      style={vtName ? { viewTransitionName: vtName } : undefined}
    >
      <header className="card__head" onDoubleClick={handleHeadDoubleClick}>
        <div>
          <p className="card__index">— 02 · live</p>
          <h2 id="lot-hold-title" className="card__title">내 lot hold</h2>
        </div>

        <div className="card__meta">
          <span>{shortClock(lastUpdated)}</span>
          <button
            type="button"
            className={`card__action${spinning ? ' is-spinning' : ''}`}
            onClick={handleRefresh}
            disabled={loading}
            aria-label="즉시 갱신"
            title={`마지막 갱신: ${formatDateTime(lastUpdated)}`}
          >
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
            refresh
          </button>
          {onToggleMaximize ? (
            <button
              type="button"
              className="card__icon"
              onClick={onToggleMaximize}
              aria-label={isMaximized ? '원래대로' : '패널 확대'}
              title={isMaximized ? '원래대로 (ESC)' : '패널 확대'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {isMaximized ? 'close_fullscreen' : 'open_in_full'}
              </span>
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p className="card__error">{error}</p> : null}

      <div className="lot-table-wrap">
        <table className="lot-table">
          <colgroup>
            <col className="col-lot-id" />
            <col className="col-status" />
            <col className="col-equipment" />
            <col className="col-process" />
            <col className="col-comment" />
            <col className="col-updated" />
          </colgroup>
          <thead>
            <tr>
              <th>Lot ID</th>
              <th>State</th>
              <th>Tool</th>
              <th>Step</th>
              <th>Reason</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>{renderBody()}</tbody>
        </table>
      </div>
    </article>
  )
}
