import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { LotHoldPanel } from '../components/panels/LotHoldPanel'
import type { LotRow } from '../types/lot'

// jsdom은 scrollIntoView를 구현하지 않는다 — 포커스 점프 검증용으로 stub.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

function makeRows(n: number): LotRow[] {
  return Array.from({ length: n }, (_, i) => ({
    lotId: `LOT-${String(i).padStart(3, '0')}`,
    status: i % 2 === 0 ? 'Hold' : 'Active',
    equipment: `EQ-${i}`,
    processStep: `STEP-${i}`,
    holdComment: `c${i}`,
    updatedAt: '2026-06-17T09:00:00+09:00',
  }))
}

const baseProps = {
  loading: false,
  error: null,
  lastUpdated: '2026-06-17T09:00:00+09:00',
  onRefresh: () => {},
}

describe('LotHoldPanel 페이지네이션 (시안 B 번호 페이저)', () => {
  it('한 페이지에 다 들어오면 페이저를 숨긴다 (totalPages <= 1)', () => {
    const { container } = render(<LotHoldPanel rows={makeRows(10)} {...baseProps} />)
    expect(container.querySelector('.lot-pages')).toBeNull()
  })

  it('여러 페이지면 번호 페이저를 보이고, 첫 페이지 15행만 렌더한다', () => {
    render(<LotHoldPanel rows={makeRows(73)} {...baseProps} />)
    // 기본 page size 15 → 첫 페이지 LOT-000..LOT-014
    expect(screen.getByText('LOT-000')).toBeInTheDocument()
    expect(screen.getByText('LOT-014')).toBeInTheDocument()
    expect(screen.queryByText('LOT-015')).toBeNull()
    // 1 페이지가 active
    expect(screen.getByLabelText('1 페이지')).toHaveClass('is-active')
    expect(screen.getByLabelText('1 페이지')).toHaveAttribute('aria-current', 'page')
  })

  it('번호 클릭으로 해당 페이지 행으로 점프한다', async () => {
    const user = userEvent.setup()
    render(<LotHoldPanel rows={makeRows(73)} {...baseProps} />)
    await user.click(screen.getByLabelText('3 페이지'))
    // page 3 → index 30..44
    expect(screen.getByText('LOT-030')).toBeInTheDocument()
    expect(screen.queryByText('LOT-000')).toBeNull()
    expect(screen.getByLabelText('3 페이지')).toHaveAttribute('aria-current', 'page')
  })

  it('이전/다음 화살표가 양 끝에서 비활성화된다', async () => {
    const user = userEvent.setup()
    render(<LotHoldPanel rows={makeRows(73)} {...baseProps} />)
    expect(screen.getByLabelText('이전 페이지')).toBeDisabled()
    expect(screen.getByLabelText('다음 페이지')).toBeEnabled()
    // 마지막 페이지(5)로 이동
    await user.click(screen.getByLabelText('5 페이지'))
    expect(screen.getByLabelText('다음 페이지')).toBeDisabled()
    expect(screen.getByLabelText('이전 페이지')).toBeEnabled()
  })

  it('윈도잉: 7페이지 초과면 줄임표(…)로 가운데를 접는다', () => {
    render(<LotHoldPanel rows={makeRows(200)} {...baseProps} />)
    // 200/15 = 14 페이지 → 줄임표 존재
    expect(document.querySelector('.page-gap')).not.toBeNull()
    expect(screen.getByLabelText('1 페이지')).toBeInTheDocument()
    expect(screen.getByLabelText('14 페이지')).toBeInTheDocument()
  })

  it('페이지 크기를 바꾸면 1페이지로 리셋하고 행 수가 바뀐다', async () => {
    const user = userEvent.setup()
    render(<LotHoldPanel rows={makeRows(73)} {...baseProps} />)
    await user.click(screen.getByLabelText('3 페이지'))
    const sizeInput = screen.getByLabelText('페이지 크기')
    fireEvent.change(sizeInput, { target: { value: '30' } })
    // 1페이지로 리셋 + 30행 → LOT-029 보이고 LOT-030은 안 보임
    expect(screen.getByText('LOT-000')).toBeInTheDocument()
    expect(screen.getByText('LOT-029')).toBeInTheDocument()
    expect(screen.queryByText('LOT-030')).toBeNull()
  })

  it('focusLotId가 다른 페이지의 lot이면 그 페이지로 점프한다', () => {
    const { rerender } = render(<LotHoldPanel rows={makeRows(73)} {...baseProps} />)
    expect(screen.getByText('LOT-000')).toBeInTheDocument()
    // LOT-050 은 4페이지(index 50 → floor(50/15)+1 = 4)
    rerender(<LotHoldPanel rows={makeRows(73)} {...baseProps} focusLotId="LOT-050" />)
    expect(screen.getByText('LOT-050')).toBeInTheDocument()
    expect(screen.getByLabelText('4 페이지')).toHaveAttribute('aria-current', 'page')
  })
})
