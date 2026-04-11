import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TableSlot } from '../TableSlot'
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

describe('TableSlot', () => {
  it('highlights hold rows and shows the last updated time', async () => {
    const onRefresh = vi.fn()

    render(
      <TableSlot
        title="내 lot hold"
        rows={rows}
        loading={false}
        lastUpdated={new Date('2026-04-11T11:30:00.000Z')}
        onRefresh={onRefresh}
      />
    )

    const row = screen.getByRole('row', { name: /LOT-HOLD-001 hold EQ-01 ETCH Recipe review/i })
    expect(row).toHaveClass('table-slot__row--critical')
    expect(screen.getByText(/마지막 갱신 20시 30분 0초/i)).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: '새로고침' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})
