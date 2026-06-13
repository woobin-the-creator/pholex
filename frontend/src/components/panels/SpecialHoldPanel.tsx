import { Fragment, useCallback, useState, type MouseEvent } from 'react'
import { statusPillClass } from '../../utils/statusDisplay'
import { listKeywordPresets, saveKeywordPreset, searchSpecialHold } from '../../services/api'
import type { LotRow } from '../../types/lot'
import type { KeywordConfig, KeywordPreset } from '../../types/keyword'

const FIELDS = ['equipment', 'process_step', 'hold_comment', 'lot_id', 'status'] as const

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

interface Props {
  isMaximized?: boolean
  onToggleMaximize?: () => void
  vtName?: string
}

export function SpecialHoldPanel({ isMaximized = false, onToggleMaximize, vtName }: Props) {
  const [groups, setGroups] = useState<Chip[][]>([])
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [field, setField] = useState<string>('equipment')
  const [value, setValue] = useState('')

  const [rows, setRows] = useState<LotRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(100)
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [presets, setPresets] = useState<KeywordPreset[]>([])
  const [presetName, setPresetName] = useState('')

  const buildConfig = useCallback(
    (): KeywordConfig => ({
      groups: groups
        .filter((g) => g.length > 0)
        .map((g) => ({ conditions: g.map((c) => ({ field: c.field, value: c.value })) })),
    }),
    [groups],
  )

  const dnfText = groups
    .filter((g) => g.length)
    .map((g) => '(' + g.map((c) => `${c.field}${opOf(c.field)}${c.value}`).join(' ∧ ') + ')')
    .join('  ∨  ')

  const addChip = () => {
    const v = value.trim()
    if (!v) return
    setGroups((gs) => [...gs, [{ id: nextId(), field, value: v }]])
    setValue('')
  }

  const toggleSelect = (id: number) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const groupSelected = () => {
    if (selected.size < 2) return
    setGroups((gs) => {
      const picked: Chip[] = []
      const remaining = gs
        .map((g) =>
          g.filter((c) => {
            if (selected.has(c.id)) {
              picked.push(c)
              return false
            }
            return true
          }),
        )
        .filter((g) => g.length > 0)
      return [...remaining, picked]
    })
    setSelected(new Set())
  }

  const removeChip = (id: number) => {
    setGroups((gs) => gs.map((g) => g.filter((c) => c.id !== id)).filter((g) => g.length > 0))
    setSelected((s) => {
      const n = new Set(s)
      n.delete(id)
      return n
    })
  }

  const clearAll = () => {
    setGroups([])
    setSelected(new Set())
    setRows([])
    setTotal(0)
    setSearched(false)
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

  // 프리셋 목록은 드롭다운을 열 때(onFocus) + 저장 직후에만 lazy 로드한다.
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
    setSelected(new Set())
    void runSearch(1, pageSize, p.config)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const handleHeadDoubleClick = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    onToggleMaximize?.()
  }

  return (
    <article
      className={`card card--span2${isMaximized ? ' is-maximized' : ''}`}
      aria-labelledby="special-hold-title"
      data-testid="dashboard-panel"
      style={vtName ? { viewTransitionName: vtName } : undefined}
    >
      <header className="card__head" onDoubleClick={handleHeadDoubleClick}>
        <div>
          <p className="card__index">— 05</p>
          <h2 id="special-hold-title" className="card__title">Special hold</h2>
        </div>
        <div className="card__meta">
          <span>키워드 모니터</span>
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

      <div className="kw-editor">
        <select
          className="kw-select"
          value={field}
          onChange={(e) => setField(e.target.value)}
          aria-label="필드"
        >
          {FIELDS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <input
          className="field__input kw-value"
          placeholder={field === 'status' ? '예: Hold (정확히 일치)' : '예: ETCH (포함)'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addChip()
          }}
          aria-label="값"
        />
        <button type="button" className="kw-btn" onClick={addChip}>
          + 키워드
        </button>
      </div>

      <div className="kw-chips">
        {groups.length === 0 ? (
          <span className="kw-hint">
            필드+값으로 키워드를 추가하고, 여러 개를 선택해 <b>AND 묶기</b>. 그룹끼리는 OR.
          </span>
        ) : (
          groups.map((g, gi) => (
            <span key={gi} className="kw-group">
              {g.map((c, ci) => (
                <Fragment key={c.id}>
                  {ci > 0 ? <span className="kw-and">∧</span> : null}
                  <button
                    type="button"
                    className={`kw-chip${selected.has(c.id) ? ' is-selected' : ''}${
                      c.field === 'status' ? ' is-exact' : ''
                    }`}
                    onClick={() => toggleSelect(c.id)}
                    title="클릭해서 선택 (AND 묶기 대상)"
                  >
                    <span className="kw-chip__f">
                      {c.field}
                      {opOf(c.field)}
                    </span>
                    {c.value}
                    <span
                      className="kw-chip__x"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeChip(c.id)
                      }}
                      aria-hidden
                    >
                      ×
                    </span>
                  </button>
                </Fragment>
              ))}
              {gi < groups.length - 1 ? <span className="kw-or">OR</span> : null}
            </span>
          ))
        )}
      </div>

      <div className="kw-toolbar">
        <button
          type="button"
          className="kw-btn kw-btn--ghost"
          onClick={groupSelected}
          disabled={selected.size < 2}
        >
          AND 묶기 ({selected.size})
        </button>
        <button
          type="button"
          className="kw-btn kw-btn--ghost"
          onClick={clearAll}
          disabled={groups.length === 0}
        >
          비우기
        </button>
        <code className="kw-dnf">{dnfText || '—'}</code>
      </div>

      <div className="kw-toolbar">
        <button
          type="button"
          className="kw-btn kw-btn--primary"
          onClick={() => void runSearch(1, pageSize)}
          disabled={busy || groups.length === 0}
        >
          검색
        </button>
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
        <span className="kw-spacer" />
        <input
          className="field__input kw-value"
          placeholder="프리셋 이름"
          value={presetName}
          onChange={(e) => setPresetName(e.target.value)}
          aria-label="프리셋 이름"
        />
        <button
          type="button"
          className="kw-btn kw-btn--ghost"
          onClick={() => void savePreset()}
          disabled={busy || !presetName.trim() || groups.length === 0}
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
      </div>

      {error ? <p className="card__error">{error}</p> : null}

      {searched ? (
        <div className="kw-result-meta">
          <strong>{total}</strong>건 매칭 · {rows.length}건 표시 (page {page}/{totalPages})
        </div>
      ) : null}

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
            {!searched ? (
              <tr>
                <td colSpan={6} className="lot-table__empty">
                  키워드를 추가하고 검색하세요.
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="lot-table__empty">
                  조건에 맞는 lot이 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.lotId}
                  className={row.status === 'Hold' ? 'is-hold' : ''}
                  data-status={row.status}
                >
                  <td className="lot-table__lot-id" title={row.lotId}>
                    {row.lotId}
                  </td>
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
          <span className="kw-pageno">
            {page} / {totalPages}
          </span>
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
    </article>
  )
}
