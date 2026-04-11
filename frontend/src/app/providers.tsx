import { Provider } from 'jotai'
import type { PropsWithChildren } from 'react'

export function AppProviders({ children }: PropsWithChildren) {
  return <Provider>{children}</Provider>
}
