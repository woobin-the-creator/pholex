import type { SessionResponse } from '../types/auth'
import type { LotRow, SlotPayload } from '../types/lot'

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

function normalizeSlotPayload(payload: Record<string, unknown>): SlotPayload {
  const rawRows = Array.isArray(payload.rows) ? payload.rows : []

  return {
    tableId: Number(payload.tableId ?? payload.table_id ?? 1),
    rows: rawRows.map((row) => normalizeLotRow((row ?? {}) as Record<string, unknown>)),
    diff: Boolean(payload.diff),
    lastUpdated:
      payload.lastUpdated ? String(payload.lastUpdated) : payload.last_updated ? String(payload.last_updated) : null,
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
