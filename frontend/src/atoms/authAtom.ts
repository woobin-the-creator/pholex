import { atom } from 'jotai'
import type { AuthUser } from '../types/auth'

export const authAtom = atom<AuthUser | null>(null)
