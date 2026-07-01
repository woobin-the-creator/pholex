import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { LotHoldPanel } from '../components/panels/LotHoldPanel'
import type { LotRow } from '../types/lot'

// jsdom은 scrollIntoView 미구현 — 포커스 로직 stub.
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn()
})

const baseProps = {
  loading: false,
  error: null,
  lastUpdated: '2026-06-17T09:00:00+09:00',
  onRefresh: () => {},
}

const multiHoldRow: LotRow = {
  lotId: 'LOT-MULTI',
  status: 'Hold',
  equipment: 'CMP-03',
  processStep: 'CMP',
  myHolds: [
    {
      operatorAdId: 'gd01.hong',
      operatorName: '홍길동',
      itemType: 'USER',
      comment: 'Pad life 초과 의심',
      issueDate: '2026-06-17T07:42:00+09:00',
    },
    {
      operatorAdId: 'gd01.hong',
      operatorName: '홍길동',
      itemType: 'SPC',
      comment: 'thickness SPC OOC',
      issueDate: '2026-06-17T05:10:00+09:00',
    },
  ],
  holdComment: 'Pad life 초과 의심',
  updatedAt: '2026-06-17T07:42:00+09:00',
}

const singleHoldRow: LotRow = {
  lotId: 'LOT-SINGLE',
  status: 'Hold',
  equipment: 'ETCH-11',
  processStep: 'Etch',
  myHolds: [
    {
      operatorAdId: 'gd01.hong',
      operatorName: '홍길동',
      itemType: 'DEFECT',
      comment: 'OES 신호 이상',
      issueDate: '2026-06-17T07:31:00+09:00',
    },
  ],
  holdComment: 'OES 신호 이상',
  updatedAt: '2026-06-17T07:31:00+09:00',
}

describe('LotHoldPanel — lot당 hold 1:N (요약 배지 + 펼침)', () => {
  it('hold가 여러 건이면 개수 배지 + 대표 사유를 lot 1줄로 요약한다', () => {
    render(<LotHoldPanel rows={[multiHoldRow]} {...baseProps} />)
    // lot은 한 줄 — 대표(첫) 사유만 보이고, 두 번째 사유는 접힌 상태라 아직 없다.
    expect(screen.getByText('2건')).toBeInTheDocument()
    expect(screen.getByText('Pad life 초과 의심')).toBeInTheDocument()
    expect(screen.queryByText('thickness SPC OOC')).toBeNull()
  })

  it('단일 hold면 개수 배지·펼침 토글 없이 사유만 보여준다', () => {
    render(<LotHoldPanel rows={[singleHoldRow]} {...baseProps} />)
    expect(screen.queryByText('1건')).toBeNull()
    expect(screen.getByText('OES 신호 이상')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /펼치기|접기/ })).toBeNull()
  })

  it('펼치면 각 hold의 operator·item_type·comment 상세가 나오고 다시 접힌다', async () => {
    const user = userEvent.setup()
    render(<LotHoldPanel rows={[multiHoldRow]} {...baseProps} />)
    const toggle = screen.getByRole('button', { name: /펼치기/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    // 두 번째 hold의 상세(대표가 아니었던 comment)가 이제 보인다.
    expect(screen.getByText('thickness SPC OOC')).toBeInTheDocument()
    // item_type 태그 두 개 모두 상세에 존재.
    expect(screen.getByText('USER')).toBeInTheDocument()
    expect(screen.getByText('SPC')).toBeInTheDocument()
    // operator 이름은 hold마다 렌더된다(2건).
    expect(screen.getAllByText(/홍길동/)).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: /접기/ }))
    expect(screen.queryByText('thickness SPC OOC')).toBeNull()
  })

  it('lot 행은 hold 수와 무관하게 항상 1줄이다 (hold마다 행 반복 금지)', () => {
    render(<LotHoldPanel rows={[multiHoldRow, singleHoldRow]} {...baseProps} />)
    // data-testid 없이 lot id 텍스트 유일성으로 검증 — 각 lot id는 정확히 1번.
    expect(screen.getAllByText('LOT-MULTI')).toHaveLength(1)
    expect(screen.getAllByText('LOT-SINGLE')).toHaveLength(1)
  })

  it('holdComment가 없어도 myHolds 첫 comment를 대표 사유로 쓴다', () => {
    const row: LotRow = { ...multiHoldRow, holdComment: null }
    render(<LotHoldPanel rows={[row]} {...baseProps} />)
    expect(screen.getByText('Pad life 초과 의심')).toBeInTheDocument()
  })
})
