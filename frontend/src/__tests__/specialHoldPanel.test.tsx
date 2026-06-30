import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpecialHoldPanel } from '../components/panels/SpecialHoldPanel'
import type { LotRow } from '../types/lot'
import * as api from '../services/api'

vi.mock('../services/api', () => ({
  searchSpecialHold: vi.fn(),
  listKeywordPresets: vi.fn(),
  saveKeywordPreset: vi.fn(),
}))

const row = (lotId: string): LotRow => ({
  lotId,
  status: 'Hold',
  equipment: 'ETCH-07',
  processStep: 'PHOTO-LITHO',
  holdComment: '레시피 편차',
  updatedAt: '2026-06-30T05:21:00Z',
})

const result = (total: number, ids: string[]) => ({
  tableId: 5,
  rows: ids.map(row),
  total,
  page: 1,
  pageSize: 100,
  lastUpdated: null,
})

const mockSearch = vi.mocked(api.searchSpecialHold)
const mockList = vi.mocked(api.listKeywordPresets)
const mockSave = vi.mocked(api.saveKeywordPreset)

beforeEach(() => {
  mockSearch.mockReset()
  mockList.mockReset().mockResolvedValue([])
  mockSave.mockReset()
})
afterEach(() => vi.clearAllMocks())

describe('SpecialHoldPanel — 필터 버튼 → 모달', () => {
  it('초기엔 결과 없이 필터 설정 버튼과 빈 안내를 보인다', () => {
    render(<SpecialHoldPanel />)
    expect(screen.getByRole('button', { name: /필터 설정/ })).toBeInTheDocument()
    expect(screen.getByText('필터 설정을 눌러 조건을 추가하세요.')).toBeInTheDocument()
  })

  it('필터 버튼을 누르면 모달이 열리고, 값 입력 시 라이브 미리보기가 갱신된다', async () => {
    const user = userEvent.setup()
    mockSearch.mockResolvedValue(result(41, ['TXJ4821.03', 'TXJ4790.11']))
    render(<SpecialHoldPanel />)

    await user.click(screen.getByRole('button', { name: /필터 설정/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: '적용' })).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText('값'), 'ETCH')

    // 디바운스된 미리보기 쿼리 → 매칭 건수 표시
    await waitFor(() => expect(within(dialog).getByText('41')).toBeInTheDocument())
    expect(within(dialog).getByText('TXJ4821.03')).toBeInTheDocument()
    expect(mockSearch).toHaveBeenCalled()
  })

  it('적용을 누르면 섹션 결과 테이블에 반영되고 모달이 닫힌다', async () => {
    const user = userEvent.setup()
    mockSearch.mockResolvedValue(result(2, ['LOT-A', 'LOT-B']))
    render(<SpecialHoldPanel />)

    await user.click(screen.getByRole('button', { name: /필터 설정/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('값'), 'ETCH')
    await waitFor(() => expect(within(dialog).getByText('2')).toBeInTheDocument())

    await user.click(within(dialog).getByRole('button', { name: '적용' }))

    // 모달 닫힘 + 섹션 결과 반영
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('LOT-A')).toBeInTheDocument()
    expect(screen.getByText('LOT-B')).toBeInTheDocument()
    // 적용된 조건 수 배지(1)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('이름을 입력하고 저장하면 프리셋이 저장되고 아이콘이 체크로 바뀐다', async () => {
    const user = userEvent.setup()
    mockSearch.mockResolvedValue(result(41, ['TXJ4821.03']))
    mockSave.mockResolvedValue({ id: 1, name: 'ETCH 경보', config: { groups: [] }, isDefault: true, createdAt: null })
    render(<SpecialHoldPanel />)

    await user.click(screen.getByRole('button', { name: /필터 설정/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('값'), 'ETCH')
    await user.type(within(dialog).getByLabelText('프리셋 이름'), 'ETCH 경보')
    await user.click(within(dialog).getByRole('button', { name: '프리셋 저장' }))

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith('ETCH 경보', expect.anything(), true))
    expect(await within(dialog).findByText('check')).toBeInTheDocument()
  })
})
