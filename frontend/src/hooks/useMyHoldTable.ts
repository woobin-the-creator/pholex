import { startTransition, useEffect, useEffectEvent, useRef } from 'react'
import { useAtom } from 'jotai'
import {
  lotHoldDumpMetaAtom,
  lotHoldErrorAtom,
  lotHoldLastUpdatedAtom,
  lotHoldLoadingAtom,
  lotHoldRowsAtom,
} from '../atoms/tableAtoms'
import { getMyHoldPayload } from '../services/api'
import { connectTableSocket } from '../services/ws'
import type { AlarmItem } from '../types/alarm'
import type { SessionUser } from '../types/auth'
import type { SlotPayload } from '../types/lot'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'

// status는 열린 집합 — raw lot_status_seg 값(예: "Hold")을 변환 없이 그대로 쓴다.
// DEMO_ROWS는 backend Fake adapter golden dataset(backend/app/adapters/fake/golden_dataset.py)과
// 일치해야 VITE_DEMO_MODE=true/false가 동일 화면을 내준다(AC 7). 슬롯[1]은 전부 "Hold".
const DEMO_ROWS: SlotPayload['rows'] = [
  {
    lotId: 'LOT-A2948',
    status: 'Hold',
    equipment: 'CMP-03',
    processStep: 'CMP / 슬러리 모니터',
    holdComment: 'Pad life 초과 의심 — 측정값 확인 필요',
    updatedAt: '2026-04-28T07:42:11+09:00',
  },
  {
    lotId: 'LOT-B1175',
    status: 'Hold',
    equipment: 'ETCH-11',
    processStep: 'Dry Etch / Poly',
    holdComment: 'OES 신호 이상, eng review 대기',
    updatedAt: '2026-04-28T07:31:54+09:00',
  },
  {
    lotId: 'LOT-C3320',
    status: 'Hold',
    equipment: 'IMP-02',
    processStep: 'Implant / NWell',
    holdComment: 'Dose 검증 재측정 요청',
    updatedAt: '2026-04-28T06:58:02+09:00',
  },
]
const DEMO_LAST_UPDATED = '2026-04-28T07:42:11+09:00'

function fallbackLastUpdated(payload: SlotPayload): string {
  return payload.lastUpdated ?? payload.rows[0]?.updatedAt ?? new Date().toISOString()
}

export function useMyHoldTable(user: SessionUser | null, onAlarm?: (alarm: AlarmItem) => void) {
  const [rows, setRows] = useAtom(lotHoldRowsAtom)
  const [loading, setLoading] = useAtom(lotHoldLoadingAtom)
  const [error, setError] = useAtom(lotHoldErrorAtom)
  const [lastUpdated, setLastUpdated] = useAtom(lotHoldLastUpdatedAtom)
  const [, setDumpMeta] = useAtom(lotHoldDumpMetaAtom)
  const socketRef = useRef<ReturnType<typeof connectTableSocket> | null>(null)
  // onAlarm 식별자가 바뀌어도 소켓 effect([user])를 다시 띄우지 않도록 ref로 최신값을 읽는다.
  const onAlarmRef = useRef(onAlarm)
  onAlarmRef.current = onAlarm

  const applyPayload = useEffectEvent((payload: SlotPayload) => {
    startTransition(() => {
      setRows(payload.rows)
      setLastUpdated(fallbackLastUpdated(payload))
      setDumpMeta(payload.dumpMeta ?? null)
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
      applyPayload({
        tableId: 1,
        rows: DEMO_ROWS,
        lastUpdated: DEMO_LAST_UPDATED,
        dumpMeta: { lastRunAt: DEMO_LAST_UPDATED, freshMaxMinutes: 30, staleMinMinutes: 60 },
      })
      setLoading(false)
      return undefined
    }

    void loadTable(false)

    const connection = connectTableSocket({
      tableId: 1,
      onTableUpdate: applyPayload,
      onAlarm: (alarm) => onAlarmRef.current?.(alarm),
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

// dumpMeta는 atom을 통해 LotHoldPanel에서 직접 읽는다.
