import { useCallback, useEffect, useRef } from 'react'
import { createWebSocketClient, type WebSocketClient } from '../services/ws'
import type { SocketEnvelope, TableUpdatePayload } from '../types/ws'
import { normalizeLotRows, type LotRow } from '../types/lot'

interface UseSlot1WebSocketOptions {
  enabled: boolean
  tableId: number
  onRows: (rows: LotRow[]) => void
  onUpdatedAt: (value: Date) => void
}

export function useSlot1WebSocket({ enabled, tableId, onRows, onUpdatedAt }: UseSlot1WebSocketOptions) {
  const clientRef = useRef<WebSocketClient | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }

    const client = createWebSocketClient({
      onOpen: () => {
        client.send({ type: 'subscribe', payload: { tableId } })
      },
      onMessage: (message) => {
        const envelope = message as SocketEnvelope<TableUpdatePayload>
        if (envelope.type !== 'table_update' || envelope.payload.tableId !== tableId) {
          return
        }

        onRows(normalizeLotRows(envelope.payload.rows))
        onUpdatedAt(new Date())
      }
    })

    clientRef.current = client

    return () => {
      client.close()
      clientRef.current = null
    }
  }, [enabled, onRows, onUpdatedAt, tableId])

  return useCallback(() => {
    const client = clientRef.current

    if (!client || client.readyState() !== 'open') {
      return false
    }

    client.send({ type: 'refresh', payload: { tableId } })
    return true
  }, [tableId])
}
