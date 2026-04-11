import { useAtom } from 'jotai'
import { useCallback, useEffect } from 'react'
import { tableDataAtomFamily, tableLastUpdatedAtomFamily, tableLoadingAtomFamily } from '../atoms/tableAtoms'
import { fetchJson } from '../services/api'
import type { MyHoldResponse } from '../types/lot'

const SLOT_1_ENDPOINT = '/api/lots/my-hold'

export function useTableData(tableId: number, enabled: boolean) {
  const [rows, setRows] = useAtom(tableDataAtomFamily(tableId))
  const [lastUpdated, setLastUpdated] = useAtom(tableLastUpdatedAtomFamily(tableId))
  const [loading, setLoading] = useAtom(tableLoadingAtomFamily(tableId))

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetchJson<MyHoldResponse>(SLOT_1_ENDPOINT)
      setRows(response.rows)
      setLastUpdated(new Date())
    } finally {
      setLoading(false)
    }
  }, [setLastUpdated, setLoading, setRows])

  useEffect(() => {
    if (!enabled) {
      return
    }

    void load()
  }, [enabled, load])

  return {
    rows,
    lastUpdated,
    loading,
    load,
    setRows,
    setLastUpdated
  }
}
