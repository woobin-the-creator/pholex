import { useAtom, useAtomValue } from 'jotai'
import { Provider } from 'jotai/react'
import { useDeferredValue, useEffect, useEffectEvent, useMemo, useState } from 'react'
import { flushSync } from 'react-dom'
import { authAtom } from '../atoms/authAtom'
import { themeAtom } from '../atoms/themeAtom'
import { TopNav } from '../components/layout/TopNav'
import { SideNav } from '../components/layout/SideNav'
import { DashboardGrid } from '../components/layout/DashboardGrid'
import { DashHeader, type KpiSpec } from '../components/layout/DashHeader'
import { SystemFooter } from '../components/layout/SystemFooter'
import { LotHoldPanel } from '../components/panels/LotHoldPanel'
import { PlaceholderPanel } from '../components/panels/PlaceholderPanel'
import { useMyHoldTable } from '../hooks/useMyHoldTable'
import { getSession, logout, UnauthorizedError } from '../services/api'
import { collectStatusOptions, filterLotRows, type LotFilters } from '../utils/filterLots'
import { HOLD_STATUS } from '../utils/statusDisplay'
import type { SessionUser } from '../types/auth'

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
const DEMO_USER: SessionUser = {
  id: 0,
  employee_number: 'DEMO-0001',
  username: '데모 사용자',
  email: 'demo@pholex.local',
  auth: 'ENGINEER',
}

const DEFAULT_FILTERS: LotFilters = {
  lotIdQuery: '',
  status: 'all',
  recentOnly: false,
}

function ThemeBinder() {
  const theme = useAtomValue(themeAtom)
  useEffect(() => {
    if (typeof document === 'undefined') return
    document.body.dataset.theme = theme
  }, [theme])
  return null
}

function formatDate(): string {
  const today = new Date()
  const dd = String(today.getDate()).padStart(2, '0')
  const mm = String(today.getMonth() + 1).padStart(2, '0')
  const yyyy = today.getFullYear()
  return `${dd}.${mm}.${yyyy} · Fab 7`
}

type PanelId = 'slot-0' | 'live' | 'slot-2' | 'slot-3' | 'slot-4' | 'slot-5'

function DashboardApp() {
  const [user, setUser] = useAtom(authAtom)
  const [authResolved, setAuthResolved] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [filters, setFilters] = useState<LotFilters>(DEFAULT_FILTERS)
  const [maximized, setMaximized] = useState<PanelId | null>(null)
  const { rows, loading, error, lastUpdated, refresh } = useMyHoldTable(user)

  const toggleMaximize = (id: PanelId) => {
    const update = () => {
      setMaximized((current) => (current === id ? null : id))
    }
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { ready: Promise<void> }
    }
    if (typeof doc.startViewTransition === 'function') {
      doc.startViewTransition(() => {
        flushSync(update)
      })
    } else {
      update()
    }
  }

  useEffect(() => {
    if (!maximized) return undefined
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMaximized(null)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [maximized])
  const deferredLotIdQuery = useDeferredValue(filters.lotIdQuery)
  const filteredRows = filterLotRows(rows, {
    ...filters,
    lotIdQuery: deferredLotIdQuery,
  })
  const statusOptions = useMemo(() => collectStatusOptions(rows), [rows])

  const kpis = useMemo<KpiSpec[]>(() => {
    const activeCount = rows.length
    const holdCount = rows.filter((row) => row.status === HOLD_STATUS).length
    return [
      { label: 'Active', value: activeCount },
      { label: 'Hold', value: holdCount, tone: 'hold' },
      { label: 'Rework', value: null },
      { label: 'Inform', value: null },
      { label: 'Yield · 24h', value: null, tone: 'yield', suffix: '%' },
    ]
  }, [rows])

  const redirectToSso = useEffectEvent(() => {
    window.location.assign('/api/auth/sso/init')
  })

  const loadSession = useEffectEvent(async () => {
    if (DEMO_MODE) {
      setUser(DEMO_USER)
      setAuthError(null)
      setAuthResolved(true)
      return
    }

    try {
      const session = await getSession()
      if (!session.authenticated || !session.user) {
        redirectToSso()
        return
      }
      setUser(session.user)
      setAuthError(null)
    } catch (sessionError) {
      if (sessionError instanceof UnauthorizedError) {
        redirectToSso()
        return
      }
      setAuthError(
        sessionError instanceof Error ? sessionError.message : '세션을 확인하지 못했습니다.',
      )
    } finally {
      setAuthResolved(true)
    }
  })

  const handleLogout = useEffectEvent(async () => {
    try {
      await logout()
    } finally {
      redirectToSso()
    }
  })

  const handleFiltersChange = useEffectEvent((nextFilters: Partial<LotFilters>) => {
    setFilters((currentFilters) => ({ ...currentFilters, ...nextFilters }))
  })

  const handleResetFilters = useEffectEvent(() => {
    setFilters(DEFAULT_FILTERS)
  })

  useEffect(() => {
    void loadSession()
  }, [])

  if (!authResolved) {
    return (
      <div className="splash-screen">
        <p className="splash-screen__eyebrow">Pholex</p>
        <h1>세션 확인 중</h1>
      </div>
    )
  }

  if (authError) {
    return (
      <div className="splash-screen">
        <p className="splash-screen__eyebrow">Pholex</p>
        <h1>대시보드를 시작하지 못했습니다.</h1>
        <p>{authError}</p>
      </div>
    )
  }

  return (
    <div className="shell">
      <SideNav
        filters={filters}
        statusOptions={statusOptions}
        totalRows={rows.length}
        visibleRows={filteredRows.length}
        onFiltersChange={handleFiltersChange}
        onResetFilters={handleResetFilters}
        onLogout={handleLogout}
      />

      <div className="main">
        <TopNav user={user} />

        <DashHeader
          pageLabel="Lot Monitor"
          scope={formatDate()}
          liveAt={lastUpdated}
          kpis={kpis}
        />

        <DashboardGrid hasMaximized={maximized !== null}>
          <PlaceholderPanel
            slotIndex={0}
            title="전체 홀드"
            subtitle="장기 hold 코멘트 + 제외처리 가능"
            isMaximized={maximized === 'slot-0'}
            onToggleMaximize={() => toggleMaximize('slot-0')}
            vtName="card-slot-0"
          />
          <LotHoldPanel
            rows={filteredRows}
            loading={loading}
            error={error}
            lastUpdated={lastUpdated}
            onRefresh={refresh}
            isMaximized={maximized === 'live'}
            onToggleMaximize={() => toggleMaximize('live')}
            vtName="card-live"
          />
          <PlaceholderPanel
            slotIndex={2}
            title="수율 계측"
            subtitle="측정 결함과 판정 결과를 위한 슬롯입니다."
            isMaximized={maximized === 'slot-2'}
            onToggleMaximize={() => toggleMaximize('slot-2')}
            vtName="card-slot-2"
          />
          <PlaceholderPanel
            slotIndex={3}
            title="인폼 lot hold"
            subtitle="인폼에 포함된 lot 파싱 후 status 표시 (hold가 최상단)"
            isMaximized={maximized === 'slot-3'}
            onToggleMaximize={() => toggleMaximize('slot-3')}
            vtName="card-slot-3"
          />
          <PlaceholderPanel
            slotIndex={4}
            title="Special hold"
            subtitle="SPC/FDC 등 특정 hold code lot"
            isMaximized={maximized === 'slot-4'}
            onToggleMaximize={() => toggleMaximize('slot-4')}
            vtName="card-slot-4"
          />
          <PlaceholderPanel
            slotIndex={5}
            title="간단 hold"
            subtitle="rework cnt / rework 판정대기"
            isMaximized={maximized === 'slot-5'}
            onToggleMaximize={() => toggleMaximize('slot-5')}
            vtName="card-slot-5"
          />
        </DashboardGrid>

        <SystemFooter />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Provider>
      <ThemeBinder />
      <DashboardApp />
    </Provider>
  )
}
