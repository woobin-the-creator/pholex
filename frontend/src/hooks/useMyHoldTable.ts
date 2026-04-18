import { startTransition, useEffect, useEffectEvent, useRef } from 'react'
import { useAtom } from 'jotai'
import {
  lotHoldErrorAtom,
  lotHoldLastUpdatedAtom,
  lotHoldLoadingAtom,
  lotHoldRowsAtom,
} from '../atoms/tableAtoms'
import { getMyHoldPayload } from '../services/api'
import { connectTableSocket } from '../services/ws'
import type { SessionUser } from '../types/auth'
import type { SlotPayload } from '../types/lot'

function fallbackLastUpdated(payload: SlotPayload): string {
  return payload.lastUpdated ?? payload.rows[0]?.updatedAt ?? new Date().toISOString()
}

export function useMyHoldTable(user: SessionUser | null) {
  const [rows, setRows] = useAtom(lotHoldRowsAtom)
  const [loading, setLoading] = useAtom(lotHoldLoadingAtom)
  const [error, setError] = useAtom(lotHoldErrorAtom)
  const [lastUpdated, setLastUpdated] = useAtom(lotHoldLastUpdatedAtom)
  const socketRef = useRef<ReturnType<typeof connectTableSocket> | null>(null)

  const applyPayload = useEffectEvent((payload: SlotPayload) => {
    startTransition(() => {
      setRows(payload.rows)
      setLastUpdated(fallbackLastUpdated(payload))
      setError(null)
    })
  })

  const loadTable = useEffectEvent(async (forceRefresh = false) => {
    setLoading(true)

    try {
      const payload = await getMyHoldPayload(forceRefresh)
      applyPayload(payload)
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : '데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  })

  useEffect(() => {
    if (!user) {
      return undefined
    }

    void loadTable(false)

    const connection = connectTableSocket({
      tableId: 1,
      onTableUpdate: applyPayload,
    })

    socketRef.current = connection

    return () => {
      connection.close()
      socketRef.current = null
    }
  }, [user])

  const refresh = useEffectEvent(async () => {
    socketRef.current?.refresh()
    await loadTable(true)
  })

  return {
    rows,
    loading,
    error,
    lastUpdated,
    refresh,
  }
}
