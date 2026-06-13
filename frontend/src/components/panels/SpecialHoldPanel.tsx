import { Fragment, useCallback, useEffect, useState, type MouseEvent } from 'react'
import { statusPillClass } from '../../utils/statusDisplay'
import { listKeywordPresets, saveKeywordPreset, searchSpecialHold } from '../../services/api'
import type { LotRow } from '../../types/lot'
import type { KeywordConfig, KeywordPreset } from '../../types/keyword'

const FIELDS = ['equipment', 'process_step', 'hold_comment', 'lot_id', 'status'] as const
const GUIDE_SRC = '/keyword-hold-guide.mp4'

interface Chip {
  id: number
  field: string
  value: string
}

let _seq = 0
const nextId = () => (_seq += 1)
const opOf = (field: string) => (field === 'status' ? '=' : '~')

function shortClock(iso: string | null): string {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '--:--'
    : d.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

function dnfOf(groups: Chip[][]): string {
  return groups
    .filter((g) => g.length)
    .map((g) => '(' + g.map((c) => `${c.field}${opOf(c.field)}${c.value}`).join(' ∧ ') + ')')
    .join('  ∨  ')
}

interface Props {
  isMaximized?: boolean
  onToggleMaximize?: () => void
  vtName?: string
}

export function SpecialHoldPanel({ isMaximized = false, onToggleMaximize, vtName }: Props) {
  const [groups, setGroups] = useState<Chip[][]>([])
  const [field, setField] = useState<string>('equipment')
  const [value, setValue] = useState('')

  const [collapsed, setCollapsed] = useState(true)
  const [helpOpen, setHelpOpen] = useState(false)

  const [rows, setRows] = useState<LotRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [presets, setPresets] = useState<KeywordPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [activeLabel, setActiveLabel] = useState<string | null>(null)

  const buildConfig = useCallback(
    (): KeywordConfig => ({
      groups: groups
        .filter((g) => g.length > 0)
        .map((g) => ({ conditions: g.map((c) => ({ field: c.field, value: c.value })) })),
    }),
    [groups],
  )

  const dnfText = dnfOf(groups)
  const hasQuery = groups.some((g) => g.length)

  // ── 키워드 편집 (인터랙션 A) ──
  const takeInput = (): Chip | null => {
    const v = value.trim()
    if (!v) return null
    setValue('')
    return { id: nextId(), field, value: v }
  }
  const addOrGroup = () => {
    const c = takeInput()
    if (!c) return
    setGroups((gs) => [...gs, [c]])
    setActiveLabel(null)
  }
  const addAndTo = (gi: number) => {
    const c = takeInput()
    if (!c) return
    setGroups((gs) => gs.map((g, i) => (i === gi ? [...g, c] : g)))
    setActiveLabel(null)
  }
  const removeChip = (id: number) => {
    setGroups((gs) => gs.map((g) => g.filter((c) => c.id !== id)).filter((g) => g.length > 0))
    setActiveLabel(null)
  }
  const clearAll = () => {
    setGroups([])
    setRows([])
    setTotal(0)
    setSearched(false)
    setActiveLabel(null)
  }

  const runSearch = useCallback(
    async (toPage = 1, size = pageSize, explicit?: KeywordConfig) => {
      const config = explicit ?? buildConfig()
      if (config.groups.length === 0) return
      setBusy(true)
      setError(null)
      try {
        const res = await searchSpecialHold(config, toPage, size)
        setRows(res.rows)
        setTotal(res.total)
        setPage(res.page)
        setPageSize(res.pageSize)
        setSearched(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : '검색 실패')
      } finally {
        setBusy(false)
      }
    },
    [buildConfig, pageSize],
  )

  const loadPresets = useCallback(async () => {
    try {
      setPresets(await listKeywordPresets())
    } catch {
      /* 세션 없으면 무시 */
    }
  }, [])

  const savePreset = async () => {
    const name = presetName.trim()
    const config = buildConfig()
    if (!name || config.groups.length === 0) return
    setBusy(true)
    try {
      await saveKeywordPreset(name, config, presets.length === 0)
      setPresetName('')
      setActiveLabel(name)
      await loadPresets()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  const applyPreset = (p: KeywordPreset) => {
    const gs: Chip[][] = (p.config?.groups ?? []).map((g) =>
      g.conditions.map((c) => ({ id: nextId(), field: c.field, value: c.value })),
    )
    setGroups(gs)
    setActiveLabel(p.name)
    void runSearch(1, pageSize, p.config)
  }

  // Esc로 모달 닫기
  useEffect(() => {
    if (!helpOpen) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [helpOpen])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const summary = activeLabel ?? (dnfText || '필터 없음 — 펼쳐서 추가')

  const handleHeadDoubleClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    onToggleMaximize?.()
  }

  return (
    <article
      className={`card card--span2 kw-card${isMaximized ? ' is-maximized' : ''}`}
      aria-labelledby="special-hold-title"
      data-testid="dashboard-panel"
      style={vtName ? { viewTransitionName: vtName } : undefined}
    >
      <header className="card__head kw-head" onDoubleClick={handleHeadDoubleClick}>
        <div className="kw-titlewrap">
          <p className="card__index">— 05</p>
          <h2 id="special-hold-title" className="card__title">키워드 Hold</h2>
          <button
            type="button"
            className="kw-help"
            onClick={() => setHelpOpen(true)}
            aria-label="사용법 안내 영상"
            title="사용법 안내 영상"
          >
            ?
          </button>
        </div>
        <div className="card__meta">
          {searched ? <span className="kw-count"><strong>{total}</strong>건</span> : null}
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

      {/* 밀도 B — 접힘: 활성 필터 요약 한 줄 / 펼침: 풀 편집기 */}
      {collapsed ? (
        <div className="kw-bar">
          <span className="kw-bar__label">필터</span>
          <code className="kw-bar__summary" title={dnfText || undefined}>{summary}</code>
          <button type="button" className="kw-toggle" onClick={() => setCollapsed(false)}>
            편집 <span aria-hidden>▾</span>
          </button>
          <button
            type="button"
            className="kw-toggle kw-toggle--ghost"
            onClick={() => void runSearch(1, pageSize)}
            disabled={busy || !hasQuery}
            title="다시 조회"
            aria-label="다시 조회"
          >
            ↻
          </button>
        </div>
      ) : (
        <div className="kw-edit">
          <div className="kw-editor">
            <select className="kw-select" value={field} onChange={(e) => setField(e.target.value)} aria-label="필드">
              {FIELDS.map((f) => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
            <input
              className="field__input kw-value"
              placeholder={field === 'status' ? '예: Hold (정확히 일치)' : '예: ETCH (포함)'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addOrGroup()
              }}
              aria-label="값"
            />
            <button type="button" className="kw-btn kw-btn--primary" onClick={addOrGroup}>
              + 키워드(OR)
            </button>
            <span className="kw-spacer" />
            <button
              type="button"
              className="kw-btn kw-btn--primary"
              onClick={() => void runSearch(1, pageSize)}
              disabled={busy || !hasQuery}
            >
              검색
            </button>
            <button type="button" className="kw-toggle" onClick={() => setCollapsed(true)}>
              접기 <span aria-hidden>▴</span>
            </button>
          </div>

          <div className="kw-chips">
            {!hasQuery ? (
              <span className="kw-hint">
                <b>+ 키워드(OR)</b>로 그룹을 만들고, 그룹 박스의 <b>+ AND</b>로 조건을 묶으세요. 박스끼리는 OR.
              </span>
            ) : (
              groups.map((g, gi) => (
                <Fragment key={gi}>
                  {gi > 0 ? <span className="kw-or"><b>OR</b></span> : null}
                  <span className="kw-box">
                    {g.map((c, ci) => (
                      <Fragment key={c.id}>
                        {ci > 0 ? <span className="kw-and">∧</span> : null}
                        <span className={`kw-chip${c.field === 'status' ? ' is-exact' : ''}`}>
                          <span className="kw-chip__f">{c.field}{opOf(c.field)}</span>
                          {c.value}
                          <button
                            type="button"
                            className="kw-chip__x"
                            onClick={() => removeChip(c.id)}
                            aria-label="삭제"
                          >
                            ×
                          </button>
                        </span>
                      </Fragment>
                    ))}
                    <button type="button" className="kw-addand" onClick={() => addAndTo(gi)} title="이 그룹에 AND 조건 추가">
                      + AND
                    </button>
                  </span>
                </Fragment>
              ))
            )}
          </div>

          <div className="kw-editor kw-editor--sub">
            <code className="kw-dnf" title={dnfText || undefined}>{dnfText || '—'}</code>
            <span className="kw-spacer" />
            <label className="kw-size">
              page&nbsp;
              <input
                className="field__input kw-num"
                type="number"
                min={1}
                value={pageSize}
                onChange={(e) => setPageSize(Math.max(1, Number(e.target.value) || 1))}
                aria-label="페이지 크기"
              />
            </label>
            <input
              className="field__input kw-value kw-value--sm"
              placeholder="프리셋 이름"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              aria-label="프리셋 이름"
            />
            <button
              type="button"
              className="kw-btn kw-btn--ghost"
              onClick={() => void savePreset()}
              disabled={busy || !presetName.trim() || !hasQuery}
            >
              프리셋 저장
            </button>
            <select
              className="kw-select"
              value=""
              onFocus={() => void loadPresets()}
              onChange={(e) => {
                const p = presets.find((x) => String(x.id) === e.target.value)
                if (p) applyPreset(p)
              }}
              aria-label="프리셋 불러오기"
            >
              <option value="">프리셋…</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? ' ★' : ''}
                </option>
              ))}
            </select>
            <button type="button" className="kw-btn kw-btn--ghost" onClick={clearAll} disabled={!hasQuery}>
              비우기
            </button>
          </div>
        </div>
      )}

      {error ? <p className="card__error">{error}</p> : null}

      <div className="lot-table-wrap kw-table-wrap">
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
            {!searched ? (
              <tr>
                <td colSpan={6} className="lot-table__empty">키워드를 추가하고 검색하세요.</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="lot-table__empty">조건에 맞는 lot이 없습니다.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.lotId} className={row.status === 'Hold' ? 'is-hold' : ''} data-status={row.status}>
                  <td className="lot-table__lot-id" title={row.lotId}>{row.lotId}</td>
                  <td>
                    <span className={`pill ${statusPillClass(row.status)}`}>{row.status}</span>
                  </td>
                  <td>{row.equipment ?? '—'}</td>
                  <td>{row.processStep ?? '—'}</td>
                  <td>{row.holdComment ?? '—'}</td>
                  <td>{shortClock(row.updatedAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {searched && totalPages > 1 ? (
        <div className="pages kw-pages">
          <button
            type="button"
            className="page-link"
            onClick={() => void runSearch(page - 1, pageSize)}
            disabled={busy || page <= 1}
          >
            ‹ 이전
          </button>
          <span className="kw-pageno">{page} / {totalPages}</span>
          <button
            type="button"
            className="page-link"
            onClick={() => void runSearch(page + 1, pageSize)}
            disabled={busy || page >= totalPages}
          >
            다음 ›
          </button>
        </div>
      ) : null}

      {helpOpen ? (
        <div className="kw-modal" role="dialog" aria-modal="true" aria-label="키워드 Hold 사용법" onClick={() => setHelpOpen(false)}>
          <div className="kw-modal__box" onClick={(e) => e.stopPropagation()}>
            <div className="kw-modal__head">
              <strong>키워드 Hold — 사용법</strong>
              <button type="button" className="kw-modal__x" onClick={() => setHelpOpen(false)} aria-label="닫기">×</button>
            </div>
            <video className="kw-modal__video" src={GUIDE_SRC} controls autoPlay muted loop playsInline />
          </div>
        </div>
      ) : null}
    </article>
  )
}
