import type { SessionResponse } from '../types/auth'
import type { DumpMeta, LotRow, SlotPayload } from '../types/lot'
import type { KeywordConfig, KeywordPreset, SpecialHoldResult } from '../types/keyword'

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  if (response.status === 401) {
    throw new UnauthorizedError()
  }

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`)
  }

  return response.json() as Promise<T>
}

function normalizeLotRow(row: Record<string, unknown>): LotRow {
  return {
    lotId: String(row.lotId ?? row.lot_id ?? ''),
    status: String(row.status ?? ''),
    equipment: row.equipment ? String(row.equipment) : null,
    processStep: row.processStep ? String(row.processStep) : row.process_step ? String(row.process_step) : null,
    holdComment: row.holdComment ? String(row.holdComment) : row.hold_comment ? String(row.hold_comment) : null,
    updatedAt: row.updatedAt ? String(row.updatedAt) : row.updated_at ? String(row.updated_at) : null,
  }
}

function normalizeDumpMeta(raw: unknown): DumpMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const meta = raw as Record<string, unknown>
  return {
    lastRunAt: meta.lastRunAt != null ? String(meta.lastRunAt) : null,
    freshMaxMinutes: Number(meta.freshMaxMinutes ?? 30),
    staleMinMinutes: Number(meta.staleMinMinutes ?? 60),
  }
}

function normalizeSlotPayload(payload: Record<string, unknown>): SlotPayload {
  const rawRows = Array.isArray(payload.rows) ? payload.rows : []

  return {
    tableId: Number(payload.tableId ?? payload.table_id ?? 1),
    rows: rawRows.map((row) => normalizeLotRow((row ?? {}) as Record<string, unknown>)),
    lastUpdated:
      payload.lastUpdated ? String(payload.lastUpdated) : payload.last_updated ? String(payload.last_updated) : null,
    dumpMeta: normalizeDumpMeta(payload.dumpMeta ?? payload.dump_meta),
  }
}

export async function getSession(): Promise<SessionResponse> {
  return requestJson<SessionResponse>('/api/auth/session')
}

export async function getMyHoldPayload(forceRefresh = false): Promise<SlotPayload> {
  const search = forceRefresh ? '?force_refresh=true' : ''
  const payload = await requestJson<Record<string, unknown>>(`/api/lots/my-hold${search}`)
  return normalizeSlotPayload(payload)
}

export async function logout(): Promise<void> {
  await requestJson('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

// ── 슬롯[5] Special hold — 키워드 모니터 ──

export async function searchSpecialHold(
  config: KeywordConfig,
  page = 1,
  pageSize = 100,
): Promise<SpecialHoldResult> {
  const payload = await requestJson<Record<string, unknown>>('/api/special-hold/search', {
    method: 'POST',
    body: JSON.stringify({ config, page, pageSize }),
  })
  const rawRows = Array.isArray(payload.rows) ? payload.rows : []
  return {
    tableId: Number(payload.tableId ?? 5),
    rows: rawRows.map((row) => normalizeLotRow((row ?? {}) as Record<string, unknown>)),
    total: Number(payload.total ?? 0),
    page: Number(payload.page ?? 1),
    pageSize: Number(payload.pageSize ?? pageSize),
    lastUpdated: payload.lastUpdated ? String(payload.lastUpdated) : null,
  }
}

function normalizeKeywordPreset(raw: Record<string, unknown>): KeywordPreset {
  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? ''),
    config: (raw.config ?? { groups: [] }) as KeywordConfig,
    isDefault: Boolean(raw.isDefault),
    createdAt: raw.createdAt ? String(raw.createdAt) : null,
  }
}

export async function listKeywordPresets(): Promise<KeywordPreset[]> {
  const payload = await requestJson<{ presets?: unknown[] }>('/api/keyword-presets')
  const arr = Array.isArray(payload.presets) ? payload.presets : []
  return arr.map((p) => normalizeKeywordPreset((p ?? {}) as Record<string, unknown>))
}

export async function saveKeywordPreset(
  name: string,
  config: KeywordConfig,
  isDefault = false,
): Promise<KeywordPreset> {
  const payload = await requestJson<Record<string, unknown>>('/api/keyword-presets', {
    method: 'POST',
    body: JSON.stringify({ name, config, isDefault }),
  })
  return normalizeKeywordPreset(payload)
}
