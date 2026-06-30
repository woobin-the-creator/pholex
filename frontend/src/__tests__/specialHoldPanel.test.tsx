import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider, createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SpecialHoldPanel } from '../components/panels/SpecialHoldPanel'
import { authAtom } from '../atoms/authAtom'
import { getPinnedId, setPinned } from '../services/presetPin'
import type { LotRow } from '../types/lot'
import type { KeywordPreset } from '../types/keyword'
import * as api from '../services/api'

vi.mock('../services/api', () => ({
  searchSpecialHold: vi.fn(),
  listKeywordPresets: vi.fn(),
  saveKeywordPreset: vi.fn(),
}))

const preset = (id: number, name: string): KeywordPreset => ({
  id,
  name,
  config: { groups: [{ conditions: [{ field: 'equipment', value: 'ETCH' }] }] },
  isDefault: false,
  createdAt: null,
})

// 이 Node/jsdom 조합에서 window.localStorage 가 no-op 이라, 결정적 검증을 위해
// 인메모리 Storage 폴리필을 매 테스트마다 새로 주입한다(실제 presetPin 모듈을 그대로 탄다).
class MemStorage {
  private m = new Map<string, string>()
  get length() {
    return this.m.size
  }
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v))
  }
  removeItem(k: string) {
    this.m.delete(k)
  }
  clear() {
    this.m.clear()
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null
  }
}

function renderWithUser(sabun = '12345') {
  const store = createStore()
  store.set(authAtom, { employee_number: sabun, username: 'tester', auth: 'ENGINEER' })
  return render(
    <Provider store={store}>
      <SpecialHoldPanel />
    </Provider>,
  )
}

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
  Object.defineProperty(window, 'localStorage', {
    value: new MemStorage(),
    writable: true,
    configurable: true,
  })
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

    await waitFor(() => expect(mockSave).toHaveBeenCalledWith('ETCH 경보', expect.anything()))
    expect(await within(dialog).findByText('check')).toBeInTheDocument()
  })
})

describe('SpecialHoldPanel — 프리셋 고정(📌)', () => {
  it('프리셋 옆 핀을 누르면 사번별 localStorage에 저장되고 아이콘이 켜진다', async () => {
    const user = userEvent.setup()
    mockList.mockResolvedValue([preset(7, 'ETCH 경보')])
    renderWithUser('12345')

    await user.click(screen.getByRole('button', { name: /필터 설정/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '프리셋' }))

    await user.click(await within(dialog).findByRole('button', { name: 'ETCH 경보 고정' }))

    expect(await getPinnedId('12345')).toBe(7)
    // 라벨이 '해제'로 토글됨(아이콘 켜짐)
    expect(within(dialog).getByRole('button', { name: 'ETCH 경보 고정 해제' })).toBeInTheDocument()
  })

  it('고정된 프리셋이 있으면 로드 시 자동 적용되어 결과가 뜬다 (재접속 유지)', async () => {
    await setPinned('12345', 7)
    mockList.mockResolvedValue([preset(7, 'ETCH 경보')])
    mockSearch.mockResolvedValue(result(2, ['LOT-A', 'LOT-B']))
    renderWithUser('12345')

    expect(await screen.findByText('LOT-A')).toBeInTheDocument()
    expect(screen.getByText('LOT-B')).toBeInTheDocument()
    expect(screen.getByText('ETCH 경보')).toBeInTheDocument() // 요약에 프리셋 이름
    expect(mockSearch).toHaveBeenCalled()
  })

  it('고정된 프리셋이 목록에 없으면(삭제됨) 조용히 해제하고 자동 적용하지 않는다', async () => {
    await setPinned('12345', 999)
    mockList.mockResolvedValue([preset(7, 'ETCH 경보')])
    renderWithUser('12345')

    expect(await screen.findByText('필터 설정을 눌러 조건을 추가하세요.')).toBeInTheDocument()
    await waitFor(async () => expect(await getPinnedId('12345')).toBeNull())
    expect(mockSearch).not.toHaveBeenCalled()
  })
})
