import { Fragment, useCallback, useState, type MouseEvent } from 'react'
import { statusPillClass } from '../../utils/statusDisplay'
import { listKeywordPresets, saveKeywordPreset, searchSpecialHold } from '../../services/api'
import type { LotRow } from '../../types/lot'
import type { KeywordConfig, KeywordPreset } from '../../types/keyword'

const FIELDS = ['equipment', 'process_step', 'hold_comment', 'lot_id', 'status'] as const
type FieldKey = (typeof FIELDS)[number]

const FIELD_LABEL: Record<string, string> = {
  equipment: '설비',
  process_step: '공정스텝',
  hold_comment: '홀드사유',
  lot_id: 'Lot ID',
  status: '상태',
}

/** operator label shown next to a field: status is exact, everything else is substring. */
const opLabel = (field: string): string => (field === 'status' ? '정확히' : '포함')

interface Cond {
  id: number
  field: FieldKey
  value: string
}
interface Group {
  id: number
  conditions: Cond[]
}

let _seq = 0
const nextId = () => (_seq += 1)
const newCond = (field: FieldKey = 'equipment'): Cond => ({ id: nextId(), field, value: '' })
const newGroup = (): Group => ({ id: nextId(), conditions: [newCond()] })

function shortClock(iso: string | null): string {
  if (!iso) return '--:--'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '--:--'
    : d.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' })
}

function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field
}

function conditionPhrase(field: string, value: string): string {
  const label = fieldLabel(field)
  if (field === 'status') {
    return `${label}가 정확히 ‘${value}’`
  }
  return `${label}에 ‘${value}’ 포함`
}

/** Build a Korean human-language preview from a KeywordConfig. */
function dnfPreview(config: KeywordConfig): string {
  const groups = config.groups
    .map((g) =>
      g.conditions
        .map((c) => ({ field: c.field, value: c.value.trim() }))
        .filter((c) => c.value.length > 0),
    )
    .filter((g) => g.length > 0)

  if (groups.length === 0) return '조건을 추가하세요.'

  const groupSentences = groups.map((g) => {
    const inner = g.map((c) => conditionPhrase(c.field, c.value)).join(' 그리고 ')
    return `(${inner})`
  })

  return `다음 중 하나라도 맞는 lot: ${groupSentences.join(' 또는 ')}`
}

interface Props {
  isMaximized?: boolean
  onToggleMaximize?: () => void
  vtName?: string
}

export function SpecialHoldPanel({ isMaximized = false, onToggleMaximize, vtName }: Props) {
  // Always show one ready-to-type ghost chip — never a dead button.
  const [groups, setGroups] = useState<Group[]>(() => [newGroup()])

  const [collapsed, setCollapsed] = useState(true)

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

  // ── 조건 편집 (인라인 고스트 칩) ──
  const setField = (gid: number, cid: number, field: FieldKey) => {
    setGroups((gs) =>
      gs.map((g) =>
        g.id === gid
          ? { ...g, conditions: g.conditions.map((c) => (c.id === cid ? { ...c, field } : c)) }
          : g,
      ),
    )
    setActiveLabel(null)
  }

  const setValue = (gid: number, cid: number, value: string) => {
    setGroups((gs) =>
      gs.map((g) =>
        g.id === gid
          ? { ...g, conditions: g.conditions.map((c) => (c.id === cid ? { ...c, value } : c)) }
          : g,
      ),
    )
    setActiveLabel(null)
  }

  const addGhost = (gid: number) => {
    setGroups((gs) =>
      gs.map((g) => (g.id === gid ? { ...g, conditions: [...g.conditions, newCond()] } : g)),
    )
    setActiveLabel(null)
  }

  const removeCond = (gid: number, cid: number) => {
    setGroups((gs) => {
      const next = gs
        .map((g) =>
          g.id === gid ? { ...g, conditions: g.conditions.filter((c) => c.id !== cid) } : g,
        )
        .filter((g) => g.conditions.length > 0)
      return next.length > 0 ? next : [newGroup()]
    })
    setActiveLabel(null)
  }

  // On blur: if the ghost chip is still empty, discard it (unless it's the only
  // condition in the only group — then keep one empty ghost so there's always a row).
  const commitOrDiscard = (gid: number, cid: number) =>
    setGroups((gs) => {
      const onlyGroup = gs.length === 1
      const next = gs
        .map((g) => {
          if (g.id !== gid) return g
          const cond = g.conditions.find((c) => c.id === cid)
          if (!cond) return g
          if (cond.value.trim().length > 0) return g // commit (becomes solid chip)
          const onlyCond = g.conditions.length === 1
          if (onlyGroup && onlyCond) return g // keep the single empty ghost
          return { ...g, conditions: g.conditions.filter((c) => c.id !== cid) }
        })
        .filter((g) => g.conditions.length > 0)
      return next.length > 0 ? next : [newGroup()]
    })

  const addGroup = () => setGroups((gs) => [...gs, newGroup()])

  // ── 설정 빌드 — 빈 조건/그룹은 반드시 제거(백엔드 422 방지) ──
  const buildConfig = useCallback(
    (): KeywordConfig => ({
      groups: groups
        .map((g) => ({
          conditions: g.conditions
            .filter((c) => c.value.trim().length > 0)
            .map((c) => ({ field: c.field, value: c.value.trim() })),
        }))
        .filter((g) => g.conditions.length > 0),
    }),
    [groups],
  )

  const preview = dnfPreview(buildConfig())
  const hasQuery = groups.some((g) => g.conditions.some((c) => c.value.trim().length > 0))

  const clearAll = () => {
    setGroups([newGroup()])
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
    const gs: Group[] = (p.config?.groups ?? []).map((g) => ({
      id: nextId(),
      conditions: g.conditions.map((c) => ({ id: nextId(), field: c.field as FieldKey, value: c.value })),
    }))
    setGroups(gs.length > 0 ? gs : [newGroup()])
    setActiveLabel(p.name)
    void runSearch(1, pageSize, p.config)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const summary = activeLabel ?? (hasQuery ? preview : '필터 없음 — 펼쳐서 추가')

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

      {/* 접힘: 활성 필터 요약 한 줄 / 펼침: 인라인 고스트 칩 빌더 */}
      {collapsed ? (
        <div className="kw-bar">
          <span className="kw-bar__label">필터</span>
          <code className="kw-bar__summary" title={hasQuery ? preview : undefined}>{summary}</code>
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
          <div className="kw-builder kw-builder--chips">
            {groups.map((g, gi) => (
              <Fragment key={g.id}>
                {gi > 0 ? <span className="kw-or-chip">또는</span> : null}
                <div className="kw-chipbox">
                  {g.conditions.map((c, ci) => {
                    const committed = c.value.trim().length > 0
                    return (
                      <Fragment key={c.id}>
                        {ci > 0 ? <span className="kw-and-mark">그리고</span> : null}
                        {committed ? (
                          // Solid committed chip — click the value to edit again.
                          <span className={`kw-chip${c.field === 'status' ? ' is-exact' : ''}`}>
                            <span className="kw-chip__f">{FIELD_LABEL[c.field]} {opLabel(c.field)}</span>
                            <input
                              className="kw-chip__edit"
                              value={c.value}
                              onChange={(e) => setValue(g.id, c.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              }}
                              aria-label="값 수정"
                              size={Math.max(c.value.length, 2)}
                            />
                            <button
                              type="button"
                              className="kw-chip__x"
                              onClick={() => removeCond(g.id, c.id)}
                              aria-label="삭제"
                            >
                              ×
                            </button>
                          </span>
                        ) : (
                          // Editable ghost chip — ready to type.
                          <span className="kw-chip kw-chip--ghost">
                            <select
                              className="kw-ghost__field"
                              value={c.field}
                              onChange={(e) => setField(g.id, c.id, e.target.value as FieldKey)}
                              aria-label="필드"
                            >
                              {FIELDS.map((f) => (
                                <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                              ))}
                            </select>
                            <span className={`kw-ghost__op${c.field === 'status' ? ' is-exact' : ''}`}>
                              {opLabel(c.field)}
                            </span>
                            <input
                              className="kw-ghost__input"
                              value={c.value}
                              autoFocus={g.conditions.length > 1 || gi > 0}
                              placeholder={c.field === 'status' ? 'Hold' : 'ETCH'}
                              onChange={(e) => setValue(g.id, c.id, e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                              }}
                              onBlur={() => commitOrDiscard(g.id, c.id)}
                              aria-label="값"
                              size={6}
                            />
                          </span>
                        )}
                      </Fragment>
                    )
                  })}
                  <button
                    type="button"
                    className="kw-add-chip"
                    onClick={() => addGhost(g.id)}
                    title="이 그룹에 AND 조건 추가"
                  >
                    + AND
                  </button>
                </div>
              </Fragment>
            ))}
            <button type="button" className="kw-add-or" onClick={addGroup}>
              + 또는(OR) 그룹
            </button>
          </div>

          <p className="kw-preview" title={preview}>
            <span className="kw-preview__tag">미리보기</span>
            {preview}
          </p>

          <div className="kw-editor">
            <button
              type="button"
              className="kw-btn kw-btn--primary"
              onClick={() => void runSearch(1, pageSize)}
              disabled={busy || !hasQuery}
            >
              {busy ? '검색 중…' : '검색'}
            </button>
            <button type="button" className="kw-toggle" onClick={() => setCollapsed(true)}>
              접기 <span aria-hidden>▴</span>
            </button>
            <span className="kw-spacer" />
            <label className="kw-size">
              page&nbsp;
              <input
                className="field__input kw-value"
                type="number"
                min={1}
                value={pageSize}
                onChange={(e) => setPageSize(Math.max(1, Number(e.target.value) || 1))}
                aria-label="페이지 크기"
              />
            </label>
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
    </article>
  )
}
