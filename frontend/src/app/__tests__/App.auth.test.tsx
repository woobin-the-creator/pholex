import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { AppProviders } from '../providers'
import { createWebSocketClient } from '../../services/ws'
import type { AuthSessionResponse } from '../../types/auth'
import type { LotRow } from '../../types/lot'

vi.mock('../../services/ws', () => ({
  createWebSocketClient: vi.fn()
}))

const mockedCreateWebSocketClient = vi.mocked(createWebSocketClient)

const authenticatedSession: AuthSessionResponse = {
  authenticated: true,
  user: {
    id: 1,
    employee_id: 'E-99999',
    employee_number: '99999',
    username: '홍길동',
    email: 'hong@example.com',
    auth: 'ENGINEER'
  }
}

const lotRows: LotRow[] = [
  {
    lot_id: 'LOT-HOLD-001',
    status: 'hold',
    equipment: 'EQ-01',
    process_step: 'ETCH',
    hold_comment: 'Recipe review',
    updated_at: '2026-04-11T11:00:00.000Z'
  },
  {
    lot_id: 'LOT-HOLD-002',
    status: 'hold',
    equipment: 'EQ-02',
    process_step: 'DIFF',
    hold_comment: 'Tool check',
    updated_at: '2026-04-11T11:05:00.000Z'
  },
  {
    lot_id: 'LOT-HOLD-003',
    status: 'hold',
    equipment: 'EQ-03',
    process_step: 'CVD',
    hold_comment: 'Inline hold',
    updated_at: '2026-04-11T11:10:00.000Z'
  }
]

describe('App auth bootstrap', () => {
  beforeEach(() => {
    mockedCreateWebSocketClient.mockReset()
    vi.restoreAllMocks()
  })

  it('redirects to SSO init when session check returns 401', async () => {
    const assign = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ authenticated: false }), { status: 401 })))
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign }
    })

    render(
      <AppProviders>
        <App />
      </AppProviders>
    )

    await waitFor(() => {
      expect(assign).toHaveBeenCalledWith('/api/auth/sso/init')
    })
  })

  it('renders the dashboard, refreshes via websocket, handles table updates, and logs out', async () => {
    const send = vi.fn()
    const close = vi.fn()
    let onMessage: ((message: unknown) => void) | undefined
    let onOpen: (() => void) | undefined

    mockedCreateWebSocketClient.mockImplementation((options) => {
      onMessage = options.onMessage
      onOpen = options.onOpen
      return {
        send,
        close,
        readyState: () => 'open'
      }
    })

    const assign = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { assign }
    })

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(authenticatedSession)))
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: lotRows })))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AppProviders>
        <App />
      </AppProviders>
    )

    expect(await screen.findByText('홍길동')).toBeInTheDocument()
    expect(screen.getByText('LOT-HOLD-001')).toBeInTheDocument()

    onOpen?.()
    expect(send).toHaveBeenCalledWith({ type: 'subscribe', payload: { tableId: 1 } })

    await userEvent.setup().click(screen.getByRole('button', { name: '새로고침' }))
    expect(send).toHaveBeenCalledWith({ type: 'refresh', payload: { tableId: 1 } })

    onMessage?.({
      type: 'table_update',
      payload: {
        tableId: 1,
        rows: [{ ...lotRows[0], lot_id: 'LOT-HOLD-099' }],
        diff: true
      }
    })

    expect(await screen.findByText('LOT-HOLD-099')).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: '로그아웃' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenLastCalledWith('/api/auth/logout', expect.objectContaining({ method: 'POST' }))
      expect(assign).toHaveBeenCalledWith('/api/auth/sso/init')
    })

    expect(close).toHaveBeenCalled()
  })
})
