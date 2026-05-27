import type { SlotPayload } from '../types/lot'

interface TableSocketHandlers {
  tableId: number
  onTableUpdate: (payload: SlotPayload) => void
}

interface TableSocketConnection {
  close: () => void
  refresh: () => void
}

function getSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

function normalizeSocketPayload(payload: Record<string, unknown>): SlotPayload {
  const rows = Array.isArray(payload.rows) ? payload.rows : []

  return {
    tableId: Number(payload.tableId ?? payload.table_id ?? 1),
    rows: rows.map((row) => ({
      lotId: String((row as Record<string, unknown>).lotId ?? (row as Record<string, unknown>).lot_id ?? ''),
      status: String((row as Record<string, unknown>).status ?? ''),
      equipment: ((row as Record<string, unknown>).equipment as string | null) ?? null,
      processStep:
        ((row as Record<string, unknown>).processStep as string | null) ??
        ((row as Record<string, unknown>).process_step as string | null) ??
        null,
      holdComment:
        ((row as Record<string, unknown>).holdComment as string | null) ??
        ((row as Record<string, unknown>).hold_comment as string | null) ??
        null,
      updatedAt:
        ((row as Record<string, unknown>).updatedAt as string | null) ??
        ((row as Record<string, unknown>).updated_at as string | null) ??
        null,
    })),
    diff: Boolean(payload.diff),
    lastUpdated:
      (payload.lastUpdated as string | null) ?? (payload.last_updated as string | null) ?? new Date().toISOString(),
  }
}

export function connectTableSocket({ tableId, onTableUpdate }: TableSocketHandlers): TableSocketConnection {
  const socket = new WebSocket(getSocketUrl())

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'subscribe', payload: { tableId } }))
  }

  socket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data) as {
        type?: string
        payload?: Record<string, unknown>
      }

      if (message.type === 'table_update' && message.payload) {
        const normalized = normalizeSocketPayload(message.payload)
        if (normalized.tableId === tableId) {
          onTableUpdate(normalized)
        }
      }
    } catch {
      // Ignore malformed realtime payloads; the next refresh restores consistency.
    }
  }

  return {
    close: () => {
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close()
      }
    },
    refresh: () => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'refresh', payload: { tableId } }))
      }
    },
  }
}
