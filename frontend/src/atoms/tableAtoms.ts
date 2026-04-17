import { atom } from 'jotai'
import { atomFamily } from 'jotai/utils'
import type { LotRow } from '../types/lot'

export const tableDataAtomFamily = atomFamily((tableId: number) => {
  void tableId
  return atom<LotRow[]>([])
})
export const tableLastUpdatedAtomFamily = atomFamily((tableId: number) => {
  void tableId
  return atom<Date | null>(null)
})
export const tableLoadingAtomFamily = atomFamily((tableId: number) => {
  void tableId
  return atom<boolean>(false)
})
