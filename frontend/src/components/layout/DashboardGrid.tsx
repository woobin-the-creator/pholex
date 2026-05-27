import type { ReactNode } from 'react'

interface DashboardGridProps {
  children: ReactNode
  hasMaximized?: boolean
}

export function DashboardGrid({ children, hasMaximized = false }: DashboardGridProps) {
  return (
    <section className={`grid${hasMaximized ? ' has-maximized' : ''}`}>
      {children}
    </section>
  )
}
