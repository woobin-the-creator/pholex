import type { SlotPayload } from '../types/lot'
import { normalizeHolds, representativeComment } from '../utils/holds'
import type { AlarmChangeType, AlarmItem } from '../types/alarm'

interface TableSocketHandlers {
  tableId: number
  onTableUpdate: (payload: SlotPayload) => void
  onAlarm?: (alarm: AlarmItem) => void
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
    rows: rows.map((raw) => {
      const row = raw as Record<string, unknown>
      const myHolds = normalizeHolds(row.myHolds ?? row.my_holds)
      return {
        lotId: String(row.lotId ?? row.lot_id ?? ''),
        status: String(row.status ?? ''),
        equipment: (row.equipment as string | null) ?? null,
        processStep: (row.processStep as string | null) ?? (row.process_step as string | null) ?? null,
        myHolds,
        holdComment: representativeComment(myHolds, row.holdComment ?? row.hold_comment),
        updatedAt: (row.updatedAt as string | null) ?? (row.updated_at as string | null) ?? null,
      }
    }),
    lastUpdated:
      (payload.lastUpdated as string | null) ?? (payload.last_updated as string | null) ?? new Date().toISOString(),
  }
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function strOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/**
 * Map a realtime WS message to an AlarmItem, or null if it is not an alarm.
 *
 * The backend emits one of two alarm shapes (see backend/app/api/wire.py):
 * - `change` (severity info): full payload incl. eventId/occurredAt/newHoldComment
 * - `alert`  (warning|critical): same identity fields, no newHoldComment
 * Every other message type (e.g. table_update) is not an alarm → null.
 */
export function parseAlarmMessage(message: unknown): AlarmItem | null {
  if (typeof message !== 'object' || message === null) {
    return null
  }
  const { type, payload } = message as { type?: string; payload?: Record<string, unknown> }
  if (!payload || (type !== 'change' && type !== 'alert')) {
    return null
  }

  return {
    eventId: str(payload.eventId),
    lotId: str(payload.lotId),
    changeType: str(payload.changeType) as AlarmChangeType,
    previousStatus: strOrNull(payload.previousStatus),
    newStatus: strOrNull(payload.newStatus),
    newHoldComment: strOrNull(payload.newHoldComment),
    occurredAt: str(payload.occurredAt),
    severity: type === 'alert' ? ((str(payload.severity) || 'warning') as AlarmItem['severity']) : 'info',
    read: false,
  }
}

export function connectTableSocket({
  tableId,
  onTableUpdate,
  onAlarm,
}: TableSocketHandlers): TableSocketConnection {
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
        return
      }

      const alarm = parseAlarmMessage(message)
      if (alarm && onAlarm) {
        onAlarm(alarm)
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
