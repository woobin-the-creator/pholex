import { atom } from 'jotai'
import type { LotRow } from '../types/lot'

export const lotHoldRowsAtom = atom<LotRow[]>([])
export const lotHoldLoadingAtom = atom<boolean>(false)
export const lotHoldErrorAtom = atom<string | null>(null)
export const lotHoldLastUpdatedAtom = atom<string | null>(null)
