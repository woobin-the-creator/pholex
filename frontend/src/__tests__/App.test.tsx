import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    queueMicrotask(() => {
      this.onopen?.()
    })
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

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  })
}

describe('App', () => {
  beforeEach(() => {
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders six dashboard panels and loads the live my-hold slot', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        createJsonResponse({
          authenticated: true,
          user: {
            employee_id: 'test001',
            employee_number: '99999',
            username: '테스트엔지니어',
            auth: 'ENGINEER',
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          tableId: 1,
          rows: [
            {
              lotId: 'LOT-A2948-01',
              status: 'hold',
              equipment: 'CMP-01',
              processStep: 'CMP - Planarization',
              holdComment: 'Recipe check',
              updatedAt: '2026-04-18T01:10:00Z',
            },
            {
              lotId: 'LOT-B5532-19',
              status: 'wait',
              equipment: 'ETCH-09',
              processStep: 'Photo - Align',
              holdComment: 'Queue waiting',
              updatedAt: '2026-04-18T00:10:00Z',
            },
            {
              lotId: 'LOT-C8812-44',
              status: 'hold',
              equipment: 'ETCH-02',
              processStep: 'Photo - Exposure',
              holdComment: 'Operator hold',
              updatedAt: '2026-04-18T00:50:00Z',
            },
          ],
          diff: false,
          lastUpdated: '2026-04-18T01:10:00Z',
        }),
      )

    render(<App />)

    expect(await screen.findByRole('heading', { name: '내 lot hold' })).toBeInTheDocument()
    expect(screen.getAllByTestId('dashboard-panel')).toHaveLength(6)
    expect(await screen.findByText('LOT-A2948-01')).toBeInTheDocument()
    expect(await screen.findByText('LOT-B5532-19')).toBeInTheDocument()
    expect(screen.getAllByText('MVP 이후')).toHaveLength(5)

    const pageNavigation = screen.getByRole('navigation', { name: 'Page sections' })
    expect(within(pageNavigation).getByRole('button', { name: 'Dashboard' })).toBeInTheDocument()
    expect(within(pageNavigation).getByRole('button', { name: 'Lot Tracking' })).toBeInTheDocument()

    const filtersSidebar = screen.getByRole('complementary', { name: 'Lot filters' })
    expect(within(filtersSidebar).getByLabelText('Lot ID 검색')).toBeInTheDocument()
    expect(within(filtersSidebar).getByLabelText('상태')).toBeInTheDocument()
    expect(within(filtersSidebar).getByLabelText('최근 30분 내 변경만 보기')).toBeInTheDocument()

    await waitFor(() => {
      expect(MockWebSocket.instances).toHaveLength(1)
      expect(MockWebSocket.instances[0].sent).toContain(JSON.stringify({ type: 'subscribe', payload: { tableId: 1 } }))
    })
  })

  it('filters visible lots from the sidebar controls', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        createJsonResponse({
          authenticated: true,
          user: {
            employee_id: 'test001',
            employee_number: '99999',
            username: '테스트엔지니어',
            auth: 'ENGINEER',
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          tableId: 1,
          rows: [
            {
              lotId: 'LOT-A2948-01',
              status: 'hold',
              equipment: 'CMP-01',
              processStep: 'CMP - Planarization',
              holdComment: 'Recipe check',
              updatedAt: '2026-04-18T01:10:00Z',
            },
            {
              lotId: 'LOT-B5532-19',
              status: 'wait',
              equipment: 'ETCH-09',
              processStep: 'Photo - Align',
              holdComment: 'Queue waiting',
              updatedAt: '2026-04-18T00:10:00Z',
            },
            {
              lotId: 'LOT-C8812-44',
              status: 'hold',
              equipment: 'ETCH-02',
              processStep: 'Photo - Exposure',
              holdComment: 'Operator hold',
              updatedAt: '2026-04-18T00:50:00Z',
            },
          ],
          diff: false,
          lastUpdated: '2026-04-18T01:10:00Z',
        }),
      )

    const user = userEvent.setup()

    render(<App />)

    expect(await screen.findByText('LOT-A2948-01')).toBeInTheDocument()
    expect(screen.getByText('LOT-B5532-19')).toBeInTheDocument()
    expect(screen.getByText('LOT-C8812-44')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('상태'), 'wait')

    expect(screen.getByText('LOT-B5532-19')).toBeInTheDocument()
    expect(screen.queryByText('LOT-A2948-01')).not.toBeInTheDocument()
    expect(screen.queryByText('LOT-C8812-44')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('상태'), 'all')
    await user.click(screen.getByLabelText('최근 30분 내 변경만 보기'))

    expect(screen.getByText('LOT-A2948-01')).toBeInTheDocument()
    expect(screen.getByText('LOT-C8812-44')).toBeInTheDocument()
    expect(screen.queryByText('LOT-B5532-19')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Lot ID 검색'), 'C8812')

    expect(screen.getByText('LOT-C8812-44')).toBeInTheDocument()
    expect(screen.queryByText('LOT-A2948-01')).not.toBeInTheDocument()
  })

  it('refreshes the live slot through websocket and force-refresh fetch', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        createJsonResponse({
          authenticated: true,
          user: {
            employee_id: 'test001',
            employee_number: '99999',
            username: '테스트엔지니어',
            auth: 'ENGINEER',
          },
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          tableId: 1,
          rows: [],
          diff: false,
          lastUpdated: '2026-04-18T01:10:00Z',
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          tableId: 1,
          rows: [
            {
              lotId: 'LOT-C8812-44',
              status: 'hold',
              equipment: 'ETCH-02',
              processStep: 'Photo - Exposure',
              holdComment: 'Operator hold',
              updatedAt: '2026-04-18T01:11:00Z',
            },
          ],
          diff: true,
          lastUpdated: '2026-04-18T01:11:00Z',
        }),
      )

    const user = userEvent.setup()

    render(<App />)

    expect(await screen.findByRole('button', { name: /즉시 갱신/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /즉시 갱신/i }))

    await waitFor(() => {
      expect(fetch).toHaveBeenLastCalledWith(
        '/api/lots/my-hold?force_refresh=true',
        expect.objectContaining({
          credentials: 'same-origin',
        }),
      )
    })

    expect(MockWebSocket.instances[0].sent).toContain(JSON.stringify({ type: 'refresh', payload: { tableId: 1 } }))
    expect(await screen.findByText('LOT-C8812-44')).toBeInTheDocument()
  })
})
