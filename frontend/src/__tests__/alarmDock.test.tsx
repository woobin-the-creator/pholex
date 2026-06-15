import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../app/App'

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CONNECTING = 0

  url: string
  readyState = MockWebSocket.OPEN
  sent: string[] = []
  onopen: null | (() => void) = null
  onmessage: null | ((event: { data: string }) => void) = null
  onclose: null | (() => void) = null

  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
    queueMicrotask(() => this.onopen?.())
  }

  send(message: string) {
    this.sent.push(message)
  }

  close() {
    this.readyState = 3
    this.onclose?.()
  }

  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) })
  }
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const CRITICAL_ALERT = {
  type: 'alert',
  payload: {
    lotId: 'LOT-A2948-01',
    severity: 'critical',
    changeType: 'status',
    previousStatus: 'Run',
    newStatus: 'Hold',
    eventId: 'evt-crit-1',
    occurredAt: '2026-06-13T05:21:00+09:00',
    message: 'LOT-A2948-01: Run → Hold',
  },
}

function mockAuthAndTable() {
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      jsonResponse({
        authenticated: true,
        user: { employee_number: '99999', username: '테스트엔지니어', auth: 'ENGINEER' },
      }),
    )
    .mockResolvedValueOnce(
      jsonResponse({
        tableId: 1,
        rows: [
          {
            lotId: 'LOT-A2948-01',
            status: 'Hold',
            equipment: 'CMP-01',
            processStep: 'CMP',
            holdComment: 'Recipe check',
            updatedAt: '2026-04-18T01:10:00Z',
          },
        ],
        diff: false,
        lastUpdated: '2026-04-18T01:10:00Z',
      }),
    )
}

describe('Alarm dock', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn())
    // jsdom has no scrollIntoView; the jump effect calls it.
    Element.prototype.scrollIntoView = vi.fn()
    window.localStorage?.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage?.clear()
  })

  it('pops a critical alert and accumulates it with an unread badge', async () => {
    mockAuthAndTable()
    render(<App />)

    await screen.findByRole('heading', { name: '내 lot hold' })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

    act(() => MockWebSocket.instances[0].emit(CRITICAL_ALERT))

    // critical → 순간 팝(role=alert) + "이동" 액션
    const pop = await screen.findByRole('alert')
    expect(within(pop).getByRole('button', { name: '이동' })).toBeInTheDocument()

    // dock 배지에 안읽음 1
    expect(await screen.findByTestId('alarm-badge')).toHaveTextContent('1')
  })

  it('opens the dock from the sidebar, lists the alarm, and clears the badge', async () => {
    mockAuthAndTable()
    render(<App />)

    await screen.findByRole('heading', { name: '내 lot hold' })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
    act(() => MockWebSocket.instances[0].emit(CRITICAL_ALERT))
    await screen.findByTestId('alarm-badge')

    await userEvent.click(screen.getByRole('button', { name: /알람 박스/ }))

    const dock = await screen.findByRole('dialog', { name: '알람 박스' })
    expect(within(dock).getByText('Run → Hold')).toBeInTheDocument()
    // (A) 열면 전부 읽음 → 배지 사라짐
    await waitFor(() => expect(screen.queryByTestId('alarm-badge')).not.toBeInTheDocument())
  })

  it('ignores a duplicate eventId (no double accumulation)', async () => {
    mockAuthAndTable()
    render(<App />)

    await screen.findByRole('heading', { name: '내 lot hold' })
    await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

    act(() => {
      MockWebSocket.instances[0].emit(CRITICAL_ALERT)
      MockWebSocket.instances[0].emit(CRITICAL_ALERT)
    })

    expect(await screen.findByTestId('alarm-badge')).toHaveTextContent('1')
  })
})
