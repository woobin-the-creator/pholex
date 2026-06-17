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

const rangeText = (container: HTMLElement): string =>
  (container.querySelector('.lot-step__range')?.textContent ?? '').replace(/\s+/g, ' ').trim()

describe('LotHoldPanel 페이지네이션 (시안 C 인-헤더 범위 스테퍼)', () => {
  it('한 페이지에 다 들어오면 범위/이전·다음을 숨긴다 (totalPages <= 1)', () => {
    const { container } = render(<LotHoldPanel rows={makeRows(10)} {...baseProps} />)
    expect(container.querySelector('.lot-step__range')).toBeNull()
    expect(screen.queryByLabelText('이전 페이지')).toBeNull()
    expect(screen.queryByLabelText('다음 페이지')).toBeNull()
    // 단, 페이지 크기 조절은 헤더에 남는다(작게 줄여 페이징할 수 있어야 하므로).
    expect(screen.getByLabelText('페이지 크기')).toBeInTheDocument()
  })

  it('rows가 비면 헤더 스테퍼 자체를 숨긴다', () => {
    render(<LotHoldPanel rows={[]} {...baseProps} />)
    expect(screen.queryByLabelText('페이지 크기')).toBeNull()
  })

  it('여러 페이지면 범위 스테퍼를 보이고 첫 페이지 15행만 렌더한다', () => {
    const { container } = render(<LotHoldPanel rows={makeRows(73)} {...baseProps} />)
    expect(screen.getByText('LOT-000')).toBeInTheDocument()
    expect(screen.getByText('LOT-014')).toBeInTheDocument()
    expect(screen.queryByText('LOT-015')).toBeNull()
    expect(rangeText(container)).toBe('1–15 / 73')
  })

  it('다음/이전 버튼으로 페이지를 이동하고 범위 표기가 갱신된다', async () => {
    const user = userEvent.setup()
    const { container } = render(<LotHoldPanel rows={makeRows(73)} {...baseProps} />)
    await user.click(screen.getByLabelText('다음 페이지'))
    expect(screen.getByText('LOT-015')).toBeInTheDocument()
    expect(screen.queryByText('LOT-000')).toBeNull()
    expect(rangeText(container)).toBe('16–30 / 73')
    await user.click(screen.getByLabelText('이전 페이지'))
    expect(screen.getByText('LOT-000')).toBeInTheDocument()
    expect(rangeText(container)).toBe('1–15 / 73')
  })

  it('이전/다음이 양 끝에서 비활성화된다', async () => {
    const user = userEvent.setup()
    render(<LotHoldPanel rows={makeRows(30)} {...baseProps} />)
    // 30/15 = 2 페이지
    expect(screen.getByLabelText('이전 페이지')).toBeDisabled()
    expect(screen.getByLabelText('다음 페이지')).toBeEnabled()
    await user.click(screen.getByLabelText('다음 페이지'))
    expect(screen.getByLabelText('다음 페이지')).toBeDisabled()
    expect(screen.getByLabelText('이전 페이지')).toBeEnabled()
  })

  it('마지막 페이지 범위는 전체 건수에서 끊긴다', async () => {
    const user = userEvent.setup()
    const { container } = render(<LotHoldPanel rows={makeRows(73)} {...baseProps} />)
    // 5페이지(끝)로: 다음 4번
    for (let i = 0; i < 4; i += 1) await user.click(screen.getByLabelText('다음 페이지'))
    expect(rangeText(container)).toBe('61–73 / 73')
  })

  it('페이지 크기를 바꾸면 1페이지로 리셋하고 행 수가 바뀐다', async () => {
    const user = userEvent.setup()
    const { container } = render(<LotHoldPanel rows={makeRows(73)} {...baseProps} />)
    await user.click(screen.getByLabelText('다음 페이지'))
    fireEvent.change(screen.getByLabelText('페이지 크기'), { target: { value: '30' } })
    expect(screen.getByText('LOT-000')).toBeInTheDocument()
    expect(screen.getByText('LOT-029')).toBeInTheDocument()
    expect(screen.queryByText('LOT-030')).toBeNull()
    expect(rangeText(container)).toBe('1–30 / 73')
  })

  it('focusLotId가 다른 페이지의 lot이면 그 페이지로 점프한다', () => {
    const { rerender, container } = render(<LotHoldPanel rows={makeRows(73)} {...baseProps} />)
    expect(screen.getByText('LOT-000')).toBeInTheDocument()
    // LOT-050 은 4페이지(index 50 → floor(50/15)+1 = 4) → 범위 46–60
    rerender(<LotHoldPanel rows={makeRows(73)} {...baseProps} focusLotId="LOT-050" />)
    expect(screen.getByText('LOT-050')).toBeInTheDocument()
    expect(rangeText(container)).toBe('46–60 / 73')
  })
})
