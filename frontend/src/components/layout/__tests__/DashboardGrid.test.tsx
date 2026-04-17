import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardGrid } from '../DashboardGrid'
import type { LotRow } from '../../../types/lot'

const rows: LotRow[] = [
  {
    lot_id: 'LOT-HOLD-001',
    status: 'hold',
    equipment: 'EQ-01',
    process_step: 'ETCH',
    hold_comment: 'Recipe review',
    updated_at: '2026-04-11T11:00:00.000Z'
  }
]

describe('DashboardGrid', () => {
  it('renders a 2x3 grid with five placeholders and a live slot [1]', () => {
    render(
      <DashboardGrid
        slot1Rows={rows}
        slot1Loading={false}
        slot1LastUpdated={new Date('2026-04-11T11:00:00.000Z')}
        onSlot1Refresh={vi.fn()}
      />
    )

    expect(screen.getByRole('heading', { name: '내 lot hold' })).toBeInTheDocument()
    expect(screen.getAllByText('준비 중')).toHaveLength(5)
    expect(screen.getByText('LOT-HOLD-001')).toBeInTheDocument()
  })
})
