import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { useAtomValue } from 'jotai'
import { lotHoldDumpMetaAtom } from '../../atoms/tableAtoms'
import { formatDateTime } from '../../utils/format'
import { HOLD_STATUS, statusPillClass } from '../../utils/statusDisplay'
import { computeFreshness, formatElapsed } from '../../utils/freshness'
import { LotIdCopyButton } from '../lot/LotIdCopyButton'
import type { LotRow } from '../../types/lot'

const DEFAULT_PAGE_SIZE = 15

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

// 펼침 상세용 — 날짜+시:분 (issue_date). 값이 없으면 em dash.
function issueStamp(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ko-KR', {
    hour12: false,
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// 대표 사유 — myHolds가 있으면 첫 comment, 없으면 backward-compat holdComment.
function primaryReason(row: LotRow): string | null {
  const first = row.myHolds.find((h) => h.comment && h.comment.trim().length > 0)
  return first?.comment ?? row.holdComment ?? null
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
  // [Phase 2] lot당 hold 1:N — 어느 lot 행이 상세로 펼쳐졌는지. 여러 개 동시 펼침 허용.
  const [expandedLots, setExpandedLots] = useState<Set<string>>(() => new Set())
  const toggleExpanded = (lotId: string) =>
    setExpandedLots((prev) => {
      const next = new Set(prev)
      if (next.has(lotId)) next.delete(lotId)
      else next.add(lotId)
      return next
    })

  // ── dump 신선도 신호등 + 매초 경과 카운터 ──
  const dumpMeta = useAtomValue(lotHoldDumpMetaAtom)
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const freshness = dumpMeta
    ? computeFreshness(dumpMeta.lastRunAt, nowMs, dumpMeta)
    : 'stale'
  const elapsedText = dumpMeta ? formatElapsed(dumpMeta.lastRunAt, nowMs) : '—'

  const freshnessColor =
    freshness === 'fresh'
      ? 'var(--color-success-green, #1aae39)'
      : freshness === 'aging'
        ? 'var(--color-warning, #dd5b00)'
        : 'var(--color-critical, #e53e3e)'

  // ── 클라이언트 slice 페이지네이션 ──
  // '내 lot hold' rows는 WebSocket 푸시(props)로 내려오므로 서버 페이징 대신 slice가 단순/적합.
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  // page state가 범위를 벗어나도(rows 축소 등) 렌더는 항상 안전한 페이지를 쓴다 —
  // 보정용 effect를 두면 out-of-range로 한 프레임 빈 테이블이 깜빡이므로, 렌더에서 파생한다.
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  const pagedRows = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize])
  const goToPage = (p: number) => setPage(Math.min(Math.max(1, p), totalPages))
  const rangeFrom = total === 0 ? 0 : start + 1
  const rangeTo = Math.min(start + pageSize, total)

  // 알람 등에서 특정 lot으로 포커스가 오면, 그 lot이 있는 페이지로 '한 번만' 점프해 하이라이트가 보이게 한다.
  // 같은 focus 요청엔 재점프하지 않는다 — 안 그러면 focus가 살아있는 3초 동안 들어오는 모든
  // WebSocket push(rows 변경)마다 effect가 재실행돼 사용자가 넘긴 페이지가 강제로 되돌려진다.
  // rows는 deps에 남겨 데이터가 늦게 도착하는 경우(첫 렌더 때 lot이 아직 없음)도 커버한다.
  const jumpedFocusRef = useRef<string | null>(null)
  useEffect(() => {
    if (!focusLotId) {
      jumpedFocusRef.current = null
      return
    }
    if (jumpedFocusRef.current === focusLotId) return
    const idx = rows.findIndex((r) => r.lotId === focusLotId)
    if (idx >= 0) {
      setPage(Math.floor(idx / pageSize) + 1)
      jumpedFocusRef.current = focusLotId
    }
  }, [focusLotId, rows, pageSize])

  // 포커스된 행을 화면 중앙으로 스크롤하고, 코멧 SVG 경로를 행 크기에 맞춰 잰다 —
  // 페이지 점프로 행이 마운트된 뒤 다시 재기 위해 렌더되는 페이지(safePage)도 의존성에 둔다.
  // 코멧은 PRIMARY 하이라이트(GPU 있는 환경)다. GPU 없는 환경(prefers-reduced-motion: reduce)에선
  // CSS가 이 SVG를 숨기고 경량 Rounded Ring 폴백으로 대체하므로, 측정/주입은 양쪽 모두 무해하다.
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
  }, [focusLotId, safePage])

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
    return pagedRows.map((row) => {
      const isHold = row.status === HOLD_STATUS
      const holdCount = row.myHolds.length
      const reason = primaryReason(row)
      const isExpanded = expandedLots.has(row.lotId)
      // 사유가 여럿(1:N)일 때만 펼침 토글을 노출한다. 단일 hold면 그냥 사유만 보여준다.
      const expandable = holdCount > 1
      const reasonLabel = reason ?? '—'

      return (
        <Fragment key={row.lotId}>
          <tr
            ref={(el) => {
              if (el) rowRefs.current.set(row.lotId, el)
              else rowRefs.current.delete(row.lotId)
            }}
            className={`${isHold ? 'is-hold' : ''}${focusLotId === row.lotId ? ' is-focused' : ''}${
              isExpanded ? ' is-expanded' : ''
            }`.trim()}
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
              <span className="lot-id-cell">
                <span className="lot-id-cell__text">{row.lotId}</span>
                <LotIdCopyButton lotId={row.lotId} />
              </span>
            </td>
            <td>
              <span className={`pill ${statusPillClass(row.status)}`}>
                {row.status}
              </span>
            </td>
            <td title={row.equipment ?? undefined}>{row.equipment ?? '—'}</td>
            <td title={row.processStep ?? undefined}>{row.processStep ?? '—'}</td>
            <td className="lot-reason-cell" title={reasonLabel}>
              {expandable ? (
                <button
                  type="button"
                  className="hold-summary"
                  onClick={() => toggleExpanded(row.lotId)}
                  aria-expanded={isExpanded}
                  aria-label={`내 hold ${holdCount}건 ${isExpanded ? '접기' : '펼치기'}`}
                >
                  <span className="hold-count" aria-hidden="true">
                    {holdCount}건
                  </span>
                  <span className="hold-summary__reason">{reasonLabel}</span>
                  <span className="material-symbols-outlined hold-summary__chevron" aria-hidden="true">
                    expand_more
                  </span>
                </button>
              ) : (
                <span className="hold-summary hold-summary--static">
                  <span className="hold-summary__reason">{reasonLabel}</span>
                </span>
              )}
            </td>
            <td title={row.updatedAt ?? undefined}>{shortClock(row.updatedAt)}</td>
          </tr>
          {isExpanded ? (
            <tr className="lot-hold-detail-row" data-status={row.status}>
              <td colSpan={6}>
                <ul className="hold-detail-list">
                  {row.myHolds.map((hold, i) => (
                    <li className="hold-detail" key={`${row.lotId}-${i}`}>
                      <div className="hold-detail__head">
                        <span className="hold-detail__operator">
                          {hold.operatorName ?? hold.operatorAdId ?? '—'}
                          {hold.operatorName && hold.operatorAdId ? (
                            <span className="hold-detail__adid"> ({hold.operatorAdId})</span>
                          ) : null}
                        </span>
                        {hold.itemType ? <span className="hold-item-type">{hold.itemType}</span> : null}
                        <span className="hold-detail__date">{issueStamp(hold.issueDate)}</span>
                      </div>
                      <p className="hold-detail__comment">{hold.comment ?? '—'}</p>
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ) : null}
        </Fragment>
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
          {/* 인-헤더 범위 스테퍼 — 행 크기 + N–M / 전체 + 이전/다음. 푸터 없음(테이블 풀 높이). */}
          {total > 0 ? (
            <span className="lot-step">
              <label className="lot-step__size">
                행
                <input
                  className="field__input lot-step__sizeinput"
                  type="number"
                  min={1}
                  value={pageSize}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    setPageSize(Math.max(1, Number(e.target.value) || 1))
                    setPage(1)
                  }}
                  aria-label="페이지 크기"
                />
              </label>
              {totalPages > 1 ? (
                <>
                  <span className="lot-step__sep" aria-hidden="true">·</span>
                  <span className="lot-step__range">
                    {rangeFrom}–{rangeTo} <span className="lot-step__of">/</span> {total}
                  </span>
                  <button
                    type="button"
                    className="lot-step__btn"
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    aria-label="이전 페이지"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className="lot-step__btn"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= totalPages}
                    aria-label="다음 페이지"
                  >
                    ›
                  </button>
                </>
              ) : null}
            </span>
          ) : null}
          <span>{shortClock(lastUpdated)}</span>
          {dumpMeta ? (
            <span className="dump-freshness" title={dumpMeta.lastRunAt ?? '갱신 없음'}>
              <span
                className="dump-freshness__dot"
                aria-label={`신선도: ${freshness}`}
                style={{ background: freshnessColor }}
              />
              <span className="dump-freshness__elapsed">
                마지막 갱신 {elapsedText} 전
              </span>
            </span>
          ) : null}
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
