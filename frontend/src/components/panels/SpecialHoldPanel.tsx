import { Fragment, useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useAtomValue } from 'jotai'
import { statusPillClass } from '../../utils/statusDisplay'
import { listKeywordPresets, saveKeywordPreset, searchSpecialHold } from '../../services/api'
import { clearPinned, getPinnedId, setPinned } from '../../services/presetPin'
import { authAtom } from '../../atoms/authAtom'
import { LotIdCopyButton } from '../lot/LotIdCopyButton'
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

/** groups → KeywordConfig — 빈 조건/그룹은 제거(백엔드 422 방지). */
function buildConfig(groups: Group[]): KeywordConfig {
  return {
    groups: groups
      .map((g) => ({
        conditions: g.conditions
          .filter((c) => c.value.trim().length > 0)
          .map((c) => ({ field: c.field, value: c.value.trim() })),
      }))
      .filter((g) => g.conditions.length > 0),
  }
}

function groupsFromConfig(config: KeywordConfig | null): Group[] {
  const gs: Group[] = (config?.groups ?? []).map((g) => ({
    id: nextId(),
    conditions: g.conditions.map((c) => ({
      id: nextId(),
      field: (FIELDS.includes(c.field as FieldKey) ? c.field : 'equipment') as FieldKey,
      value: c.value,
    })),
  }))
  return gs.length > 0 ? gs : [newGroup()]
}

function countConditions(config: KeywordConfig | null): number {
  return (config?.groups ?? []).reduce((n, g) => n + g.conditions.length, 0)
}

interface Props {
  isMaximized?: boolean
  onToggleMaximize?: () => void
  vtName?: string
}

export function SpecialHoldPanel({ isMaximized = false, onToggleMaximize, vtName }: Props) {
  // ── 섹션(적용된 필터) 상태 ──
  const [appliedConfig, setAppliedConfig] = useState<KeywordConfig | null>(null)
  const [appliedLabel, setAppliedLabel] = useState<string | null>(null)
  const [rows, setRows] = useState<LotRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(100)
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── 모달(편집 초안) 상태 ──
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<Group[]>(() => [newGroup()])
  const [presets, setPresets] = useState<KeywordPreset[]>([])
  const [presetName, setPresetName] = useState('')
  const [saved, setSaved] = useState(false)

  // ── 프리셋 고정(📌) 상태 ──
  const user = useAtomValue(authAtom)
  const sabun = user?.employee_number ?? null
  const [pinnedId, setPinnedId] = useState<number | null>(null)
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const presetRef = useRef<HTMLDivElement | null>(null)

  // ── 라이브 미리보기 상태 ──
  const [previewTotal, setPreviewTotal] = useState<number | null>(null)
  const [previewRows, setPreviewRows] = useState<LotRow[]>([])
  const [previewBusy, setPreviewBusy] = useState(false)
  const previewSeq = useRef(0)

  const draftConfig = buildConfig(draft)
  const draftHasQuery = draftConfig.groups.length > 0

  const runSearch = useCallback(
    async (config: KeywordConfig, toPage = 1) => {
      if (config.groups.length === 0) return
      setBusy(true)
      setError(null)
      try {
        const res = await searchSpecialHold(config, toPage, pageSize)
        setRows(res.rows)
        setTotal(res.total)
        setPage(res.page)
        setSearched(true)
      } catch (e) {
        setError(e instanceof Error ? e.message : '검색 실패')
      } finally {
        setBusy(false)
      }
    },
    [pageSize],
  )

  const loadPresets = useCallback(async () => {
    try {
      setPresets(await listKeywordPresets())
    } catch {
      /* 세션 없으면 무시 */
    }
  }, [])

  // ── 모달 열기/닫기 ──
  const openModal = () => {
    setDraft(groupsFromConfig(appliedConfig))
    setSaved(false)
    setOpen(true)
    void loadPresets()
  }
  const closeModal = useCallback(() => {
    setOpen(false)
    setPresetMenuOpen(false)
  }, [])

  // ESC 닫기
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, closeModal])

  // 프리셋 메뉴 바깥 클릭 시 닫기
  useEffect(() => {
    if (!presetMenuOpen) return
    const onDown = (e: globalThis.MouseEvent) => {
      if (presetRef.current && !presetRef.current.contains(e.target as Node)) {
        setPresetMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [presetMenuOpen])

  // 로드 시: 사번이 고정한 프리셋이 있으면 자동 적용 + 검색 (재접속해도 유지).
  // 핀(localStorage)을 먼저 확인해, 핀이 없으면 네트워크 호출 자체를 하지 않는다.
  useEffect(() => {
    if (!sabun) return
    let cancelled = false
    void (async () => {
      const pid = await getPinnedId(sabun)
      if (cancelled || pid == null) return // 핀 없음 → 아무 것도 안 함
      const list = await listKeywordPresets().catch(() => [] as KeywordPreset[])
      if (cancelled) return
      setPresets(list)
      const p = list.find((x) => x.id === pid)
      if (!p) {
        void clearPinned(sabun) // 깨진 핀(삭제된 프리셋) — 조용히 해제
        return
      }
      setPinnedId(pid)
      setAppliedConfig(p.config)
      setAppliedLabel(p.name)
      void runSearch(p.config, 1)
    })()
    return () => {
      cancelled = true
    }
    // runSearch 는 pageSize(상수)에만 의존해 안정적 — 중복 적용 방지를 위해 sabun 변화에만 반응
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sabun])

  // 고정 토글 (단일 핀 — 새 핀을 누르면 이전 핀 해제, 켜진 핀을 다시 누르면 해제)
  const togglePin = async (id: number) => {
    if (!sabun) return
    if (pinnedId === id) {
      await clearPinned(sabun)
      setPinnedId(null)
    } else {
      await setPinned(sabun, id)
      setPinnedId(id)
    }
  }

  // ── 초안 편집 ──
  const setField = (gid: number, cid: number, field: FieldKey) => {
    setDraft((gs) =>
      gs.map((g) =>
        g.id === gid
          ? { ...g, conditions: g.conditions.map((c) => (c.id === cid ? { ...c, field } : c)) }
          : g,
      ),
    )
    setSaved(false)
  }
  const setValue = (gid: number, cid: number, value: string) => {
    setDraft((gs) =>
      gs.map((g) =>
        g.id === gid
          ? { ...g, conditions: g.conditions.map((c) => (c.id === cid ? { ...c, value } : c)) }
          : g,
      ),
    )
    setSaved(false)
  }
  const addCond = (gid: number) => {
    setDraft((gs) =>
      gs.map((g) => (g.id === gid ? { ...g, conditions: [...g.conditions, newCond()] } : g)),
    )
    setSaved(false)
  }
  const removeCond = (gid: number, cid: number) => {
    setDraft((gs) => {
      const next = gs
        .map((g) =>
          g.id === gid ? { ...g, conditions: g.conditions.filter((c) => c.id !== cid) } : g,
        )
        .filter((g) => g.conditions.length > 0)
      return next.length > 0 ? next : [newGroup()]
    })
    setSaved(false)
  }
  const addGroup = () => {
    setDraft((gs) => [...gs, newGroup()])
    setSaved(false)
  }
  const resetDraft = () => {
    setDraft([newGroup()])
    setPresetName('')
    setSaved(false)
  }

  // ── 라이브 미리보기 (디바운스) ──
  useEffect(() => {
    if (!open) return
    if (!draftHasQuery) {
      setPreviewTotal(null)
      setPreviewRows([])
      setPreviewBusy(false)
      return
    }
    const seq = ++previewSeq.current
    setPreviewBusy(true)
    const t = setTimeout(async () => {
      try {
        const res = await searchSpecialHold(draftConfig, 1, 6)
        if (previewSeq.current !== seq) return
        setPreviewTotal(res.total)
        setPreviewRows(res.rows)
      } catch {
        if (previewSeq.current !== seq) return
        setPreviewTotal(null)
        setPreviewRows([])
      } finally {
        if (previewSeq.current === seq) setPreviewBusy(false)
      }
    }, 350)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, JSON.stringify(draftConfig)])

  // ── 적용 / 프리셋 ──
  const apply = () => {
    if (!draftHasQuery) return
    const config = draftConfig
    setAppliedConfig(config)
    setAppliedLabel(presetName.trim() || null)
    void runSearch(config, 1)
    closeModal()
  }

  const savePreset = async () => {
    const name = presetName.trim()
    if (!name || !draftHasQuery) return
    setBusy(true)
    try {
      await saveKeywordPreset(name, draftConfig)
      setSaved(true)
      await loadPresets()
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  const applyPresetById = (id: string) => {
    const p = presets.find((x) => String(x.id) === id)
    if (!p) return
    setDraft(groupsFromConfig(p.config))
    setPresetName(p.name)
    setSaved(false)
  }

  const refetch = () => {
    if (appliedConfig) void runSearch(appliedConfig, page)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const appliedCount = countConditions(appliedConfig)
  const summary = appliedConfig
    ? appliedLabel ?? dnfPreview(appliedConfig)
    : '필터 없음 — 필터 설정을 눌러 조건을 추가하세요'

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

      {/* 섹션: 필터 버튼 + 활성 필터 요약 한 줄 */}
      <div className="kw-filterbar">
        <button type="button" className="kw-filter-btn" onClick={openModal}>
          <span className="material-symbols-outlined" aria-hidden="true">filter_alt</span>
          필터 설정
          {appliedCount > 0 ? <span className="kw-filter-btn__cnt">{appliedCount}</span> : null}
        </button>
        <span className="kw-summary" title={appliedConfig ? summary : undefined}>{summary}</span>
        {appliedConfig ? (
          <button
            type="button"
            className="kw-iconbtn"
            onClick={refetch}
            disabled={busy}
            title="다시 조회"
            aria-label="다시 조회"
          >
            <span className="material-symbols-outlined" aria-hidden="true">refresh</span>
          </button>
        ) : null}
      </div>

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
                <td colSpan={6} className="lot-table__empty">필터 설정을 눌러 조건을 추가하세요.</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="lot-table__empty">조건에 맞는 lot이 없습니다.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.lotId} className={row.status === 'Hold' ? 'is-hold' : ''} data-status={row.status}>
                  <td className="lot-table__lot-id" title={row.lotId}>
                    <span className="lot-id-cell">
                      <span className="lot-id-cell__text">{row.lotId}</span>
                      <LotIdCopyButton lotId={row.lotId} />
                    </span>
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
            onClick={() => appliedConfig && void runSearch(appliedConfig, page - 1)}
            disabled={busy || page <= 1}
          >
            ‹ 이전
          </button>
          <span className="kw-pageno">{page} / {totalPages}</span>
          <button
            type="button"
            className="page-link"
            onClick={() => appliedConfig && void runSearch(appliedConfig, page + 1)}
            disabled={busy || page >= totalPages}
          >
            다음 ›
          </button>
        </div>
      ) : null}

      {/* ── 필터 설정 모달 ── */}
      {open ? (
        <>
          <div className="kw-scrim" onClick={closeModal} />
          <div className="kw-modal" role="dialog" aria-modal="true" aria-labelledby="kw-modal-title">
            <div className="kw-modal__head">
              <h3 id="kw-modal-title" className="kw-modal__title">
                필터 설정 <span className="kw-modal__sub">실시간 미리보기</span>
              </h3>
              <div className="kw-modal__head-right">
                <div className="kw-presetpick" ref={presetRef}>
                  <button
                    type="button"
                    className="kw-presetpick__btn"
                    onClick={() => {
                      void loadPresets()
                      setPresetMenuOpen((o) => !o)
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={presetMenuOpen}
                  >
                    <span className="material-symbols-outlined kw-presetpick__ic" aria-hidden="true">bookmark</span>
                    프리셋
                    <span className="kw-presetpick__caret material-symbols-outlined" aria-hidden="true">expand_more</span>
                  </button>
                  {presetMenuOpen ? (
                    <div className="kw-presetmenu" role="listbox">
                      {presets.length === 0 ? (
                        <div className="kw-presetmenu__empty">저장된 프리셋이 없어요.</div>
                      ) : (
                        presets.map((p) => (
                          <div className="kw-presetmenu__row" key={p.id}>
                            <button
                              type="button"
                              className="kw-presetmenu__name"
                              onClick={() => {
                                applyPresetById(String(p.id))
                                setPresetMenuOpen(false)
                              }}
                            >
                              {p.name}
                            </button>
                            <button
                              type="button"
                              className={`kw-presetmenu__pin${pinnedId === p.id ? ' is-pinned' : ''}`}
                              onClick={() => void togglePin(p.id)}
                              disabled={!sabun}
                              aria-pressed={pinnedId === p.id}
                              title={pinnedId === p.id ? '고정 해제 — 재접속 시 자동 적용 끄기' : '고정 — 재접속해도 자동 적용'}
                              aria-label={pinnedId === p.id ? `${p.name} 고정 해제` : `${p.name} 고정`}
                            >
                              <span className="material-symbols-outlined" aria-hidden="true">push_pin</span>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>
                <button type="button" className="kw-modal__close" onClick={closeModal} aria-label="닫기">×</button>
              </div>
            </div>

            <div className="kw-modal__body">
              <div className="kw-split">
                {/* 좌: 빌더 */}
                <div className="kw-build">
                  {draft.map((g, gi) => (
                    <Fragment key={g.id}>
                      {gi > 0 ? <div className="kw-orsep"><span className="kw-orsep__chip">또는</span></div> : null}
                      <div className="kw-grp">
                        {g.conditions.map((c, ci) => (
                          <div className="kw-row" key={c.id}>
                            <span className="kw-row__and">{ci > 0 ? '그리고' : ''}</span>
                            <span className="kw-fieldsel">
                              <select
                                className="kw-fieldsel__select"
                                value={c.field}
                                onChange={(e) => setField(g.id, c.id, e.target.value as FieldKey)}
                                aria-label="필드"
                              >
                                {FIELDS.map((f) => (
                                  <option key={f} value={f}>{FIELD_LABEL[f]}</option>
                                ))}
                              </select>
                              <span className="kw-fieldsel__caret material-symbols-outlined" aria-hidden="true">expand_more</span>
                            </span>
                            <span className={`kw-op${c.field === 'status' ? ' is-exact' : ''}`}>{opLabel(c.field)}</span>
                            <input
                              className="kw-valinput"
                              value={c.value}
                              placeholder={c.field === 'status' ? 'Hold' : 'ETCH'}
                              onChange={(e) => setValue(g.id, c.id, e.target.value)}
                              aria-label="값"
                            />
                            <button
                              type="button"
                              className="kw-row__x"
                              onClick={() => removeCond(g.id, c.id)}
                              aria-label="조건 삭제"
                            >
                              <span className="material-symbols-outlined" aria-hidden="true">close</span>
                            </button>
                          </div>
                        ))}
                        <button type="button" className="kw-addbtn" onClick={() => addCond(g.id)}>
                          + 조건 추가
                        </button>
                      </div>
                    </Fragment>
                  ))}
                  <button type="button" className="kw-addbtn kw-addbtn--or" onClick={addGroup}>
                    + 또는(OR) 그룹
                  </button>
                </div>

                {/* 우: 라이브 미리보기 */}
                <div className="kw-preview">
                  <div className="kw-preview__h">미리보기</div>
                  <p className="kw-preview__nl">{dnfPreview(draftConfig)}</p>
                  <div className="kw-preview__match">
                    <strong>{previewBusy ? '…' : previewTotal ?? '—'}</strong> 건 매칭
                  </div>
                  <div className="kw-preview__rows">
                    {previewRows.length === 0 ? (
                      <p className="kw-preview__empty">{draftHasQuery ? '결과 없음' : '조건을 추가하면 결과가 표시됩니다.'}</p>
                    ) : (
                      previewRows.map((r) => (
                        <div className="kw-preview__row" key={r.lotId}>
                          <span className="kw-preview__lid">{r.lotId}</span>
                          <span className={`pill ${statusPillClass(r.status)}`}>{r.status}</span>
                          <span className="kw-preview__tool">{r.equipment ?? '—'}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="kw-modal__foot">
              <button type="button" className="kw-btn" onClick={resetDraft}>초기화</button>
              <span className="kw-spacer" />
              <button type="button" className="kw-btn" onClick={closeModal}>취소</button>
              <button
                type="button"
                className="kw-btn kw-btn--primary"
                onClick={apply}
                disabled={busy || !draftHasQuery}
              >
                적용
              </button>
              <span className="kw-foot-div" aria-hidden="true" />
              <input
                className="kw-foot-name"
                placeholder="필터 이름"
                value={presetName}
                onChange={(e) => {
                  setPresetName(e.target.value)
                  setSaved(false)
                }}
                aria-label="프리셋 이름"
              />
              <button
                type="button"
                className={`kw-iconbtn kw-iconbtn--save${saved ? ' is-ok' : ''}`}
                onClick={() => void savePreset()}
                disabled={busy || !presetName.trim() || !draftHasQuery}
                title="프리셋 저장"
                aria-label="프리셋 저장"
              >
                <span className="material-symbols-outlined" aria-hidden="true">{saved ? 'check' : 'save'}</span>
              </button>
            </div>
          </div>
        </>
      ) : null}
    </article>
  )
}
