import { useEffect, useMemo, useState } from 'react'
import { formatDateTime } from '../../utils/format'
import { HOLD_STATUS, statusPillClass } from '../../utils/statusDisplay'
import type { LotRow } from '../../types/lot'

export type PaginationVariant = 'A' | 'B' | 'C'

interface Props {
  rows: LotRow[]
  variant: PaginationVariant
  lastUpdated: string | null
}

function shortClock(iso: string | null): string {
  if (!iso) return '--:--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

/** 번호 페이저 윈도잉 — 현재 페이지 주변 + 양끝, 사이는 줄임표(…). */
function pageWindow(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const lo = Math.max(2, page - 1)
  const hi = Math.min(total - 1, page + 1)
  if (lo > 2) out.push('…')
  for (let p = lo; p <= hi; p += 1) out.push(p)
  if (hi < total - 1) out.push('…')
  out.push(total)
  return out
}

export function ProtoLotHoldPanel({ rows, variant, lastUpdated }: Props) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  const total = rows.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // 페이지 크기가 바뀌어 현재 페이지가 범위를 벗어나면 보정.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const start = (page - 1) * pageSize
  const pageRows = useMemo(() => rows.slice(start, start + pageSize), [rows, start, pageSize])
  const rangeFrom = total === 0 ? 0 : start + 1
  const rangeTo = Math.min(start + pageSize, total)

  const go = (p: number) => setPage(Math.min(Math.max(1, p), totalPages))

  const sizeControl = (
    <label className="proto-size">
      행
      <input
        className="field__input kw-value proto-size__input"
        type="number"
        min={1}
        value={pageSize}
        onChange={(e) => {
          setPageSize(Math.max(1, Number(e.target.value) || 1))
          setPage(1)
        }}
        aria-label="페이지 크기"
      />
    </label>
  )

  return (
    <article className="card card--span2 is-live" aria-labelledby="proto-lot-hold-title" data-testid="dashboard-panel">
      <header className="card__head">
        <div>
          <p className="card__index">— 02 · live</p>
          <h2 id="proto-lot-hold-title" className="card__title">내 lot hold</h2>
        </div>

        <div className="card__meta">
          {/* 시안 C — 헤더 인라인 범위 스테퍼 */}
          {variant === 'C' && total > 0 ? (
            <span className="proto-step" aria-label="페이지 이동">
              <span className="proto-step__range">
                {rangeFrom}–{rangeTo} <span className="proto-step__sep">/</span> {total}
              </span>
              <button
                type="button"
                className="proto-step__btn"
                onClick={() => go(page - 1)}
                disabled={page <= 1}
                aria-label="이전 페이지"
              >
                ‹
              </button>
              <button
                type="button"
                className="proto-step__btn"
                onClick={() => go(page + 1)}
                disabled={page >= totalPages}
                aria-label="다음 페이지"
              >
                ›
              </button>
            </span>
          ) : null}

          <span>{shortClock(lastUpdated)}</span>
          <button
            type="button"
            className="card__action"
            aria-label="즉시 갱신"
            title={`마지막 갱신: ${formatDateTime(lastUpdated)}`}
          >
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
            refresh
          </button>
        </div>
      </header>

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
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="lot-table__empty">현재 내 hold lot이 없습니다.</td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.lotId} className={row.status === HOLD_STATUS ? 'is-hold' : ''} data-status={row.status}>
                  <td className="lot-table__lot-id" title={row.lotId}>{row.lotId}</td>
                  <td>
                    <span className={`pill ${statusPillClass(row.status)}`}>{row.status}</span>
                  </td>
                  <td title={row.equipment ?? undefined}>{row.equipment ?? '—'}</td>
                  <td title={row.processStep ?? undefined}>{row.processStep ?? '—'}</td>
                  <td title={row.holdComment ?? undefined}>{row.holdComment ?? '—'}</td>
                  <td title={row.updatedAt ?? undefined}>{shortClock(row.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 시안 A — Special-hold 동형: 이전/다음 + 현재/전체 + 페이지 크기 */}
      {variant === 'A' && totalPages > 1 ? (
        <div className="pages kw-pages proto-pages-a">
          <button type="button" className="page-link" onClick={() => go(page - 1)} disabled={page <= 1}>
            ‹ 이전
          </button>
          <span className="kw-pageno">{page} / {totalPages}</span>
          <button type="button" className="page-link" onClick={() => go(page + 1)} disabled={page >= totalPages}>
            다음 ›
          </button>
          <span className="kw-spacer" />
          {sizeControl}
        </div>
      ) : null}

      {/* 시안 B — 번호 페이저: 기존 .pages/.page-link 토큰 재사용 + 윈도잉 */}
      {variant === 'B' && totalPages > 1 ? (
        <div className="pages pages--nums proto-pages-b">
          <button
            type="button"
            className="page-link"
            onClick={() => go(page - 1)}
            disabled={page <= 1}
            aria-label="이전 페이지"
          >
            ‹
          </button>
          {pageWindow(page, totalPages).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="page-gap" aria-hidden="true">…</span>
            ) : (
              <button
                key={p}
                type="button"
                className={`page-link${p === page ? ' is-active' : ''}`}
                onClick={() => go(p)}
                aria-label={`${p} 페이지`}
                aria-current={p === page ? 'page' : undefined}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            className="page-link"
            onClick={() => go(page + 1)}
            disabled={page >= totalPages}
            aria-label="다음 페이지"
          >
            ›
          </button>
          <span className="kw-spacer" />
          {sizeControl}
        </div>
      ) : null}
    </article>
  )
}
