import { TableSlot } from '../table/TableSlot'
import type { LotRow } from '../../types/lot'

interface DashboardGridProps {
  slot1Rows: LotRow[]
  slot1Loading: boolean
  slot1LastUpdated: Date | null
  onSlot1Refresh: () => void
}

export function DashboardGrid({ slot1Rows, slot1Loading, slot1LastUpdated, onSlot1Refresh }: DashboardGridProps) {
  return (
    <main className="dashboard-grid" aria-label="Pholex dashboard">
      {[0, 1, 2, 3, 4, 5].map((slotId) =>
        slotId === 1 ? (
          <TableSlot
            key={slotId}
            title="내 lot hold"
            rows={slot1Rows}
            loading={slot1Loading}
            lastUpdated={slot1LastUpdated}
            onRefresh={onSlot1Refresh}
          />
        ) : (
          <section key={slotId} className="dashboard-placeholder" aria-label={`slot-${slotId}`}>
            <p className="dashboard-placeholder__index">[{slotId}]</p>
            <p className="dashboard-placeholder__label">준비 중</p>
          </section>
        )
      )}
    </main>
  )
}
