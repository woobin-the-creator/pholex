import { atom } from 'jotai'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'pholex-theme'

function readInitial(): Theme {
  try {
    const stored = window?.localStorage?.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // localStorage may be unavailable (SSR, sandbox, test env)
  }
  return 'light'
}

const baseThemeAtom = atom<Theme>(readInitial())

export const themeAtom = atom(
  (get) => get(baseThemeAtom),
  (get, set, next: Theme | ((current: Theme) => Theme)) => {
    const current = get(baseThemeAtom)
    const value = typeof next === 'function' ? next(current) : next
    set(baseThemeAtom, value)
    try {
      window?.localStorage?.setItem(STORAGE_KEY, value)
    } catch {
      // ignore persistence failures
    }
  }
)
