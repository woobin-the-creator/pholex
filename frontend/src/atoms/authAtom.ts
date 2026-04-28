import { atom } from 'jotai'
import type { SessionUser } from '../types/auth'

export const authAtom = atom<SessionUser | null>(null)
