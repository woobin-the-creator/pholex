import type { ReactNode } from 'react'

interface DashboardGridProps {
  children: ReactNode
}

export function DashboardGrid({ children }: DashboardGridProps) {
  return <section className="grid">{children}</section>
}
