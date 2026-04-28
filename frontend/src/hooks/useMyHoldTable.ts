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

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

const DEMO_ROWS: SlotPayload['rows'] = [
  {
    lotId: 'LOT-A2948',
    status: 'hold',
    equipment: 'CMP-03',
    processStep: 'CMP / 슬러리 모니터',
    holdComment: 'Pad life 초과 의심 — 측정값 확인 필요',
    updatedAt: '2026-04-28T07:42:11+09:00',
  },
  {
    lotId: 'LOT-B1175',
    status: 'hold',
    equipment: 'ETCH-11',
    processStep: 'Dry Etch / Poly',
    holdComment: 'OES 신호 이상, eng review 대기',
    updatedAt: '2026-04-28T07:31:54+09:00',
  },
  {
    lotId: 'LOT-C3320',
    status: 'hold',
    equipment: 'IMP-02',
    processStep: 'Implant / NWell',
    holdComment: 'Dose 검증 재측정 요청',
    updatedAt: '2026-04-28T06:58:02+09:00',
  },
  {
    lotId: 'LOT-D8841',
    status: 'review',
    equipment: 'METRO-07',
    processStep: 'Overlay 측정',
    holdComment: 'overlay 스펙 in/out 경계, 2nd opinion 진행 중',
    updatedAt: '2026-04-28T06:12:40+09:00',
  },
  {
    lotId: 'LOT-E5026',
    status: 'release-pending',
    equipment: 'LITHO-04',
    processStep: 'Photo / Mask 4',
    holdComment: 'Hold 해제 승인 대기 (PE 결재)',
    updatedAt: '2026-04-28T05:47:18+09:00',
  },
]
const DEMO_LAST_UPDATED = '2026-04-28T07:42:11+09:00'

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

    if (DEMO_MODE) {
      applyPayload({ tableId: 1, rows: DEMO_ROWS, diff: false, lastUpdated: DEMO_LAST_UPDATED })
      setLoading(false)
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
