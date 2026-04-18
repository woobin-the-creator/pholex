import { useAtom } from 'jotai'
import { Provider } from 'jotai/react'
import { useDeferredValue, useEffect, useEffectEvent, useState } from 'react'
import { authAtom } from '../atoms/authAtom'
import { TopNav } from '../components/layout/TopNav'
import { SideNav } from '../components/layout/SideNav'
import { DashboardGrid } from '../components/layout/DashboardGrid'
import { SystemFooter } from '../components/layout/SystemFooter'
import { LotHoldPanel } from '../components/panels/LotHoldPanel'
import { PlaceholderPanel } from '../components/panels/PlaceholderPanel'
import { useMyHoldTable } from '../hooks/useMyHoldTable'
import { getSession, logout, UnauthorizedError } from '../services/api'
import { filterLotRows, type LotFilters } from '../utils/filterLots'

const PLACEHOLDER_SLOTS = [
  { slotIndex: 0, title: '활성 Lot 상태', subtitle: '실시간 생산 흐름 카드가 들어올 자리입니다.' },
  { slotIndex: 2, title: '수율 계측', subtitle: '측정 결함과 판정 결과를 위한 슬롯입니다.' },
  { slotIndex: 3, title: '자재 재고', subtitle: '부품/배치 재고 테이블이 여기에 들어옵니다.' },
  { slotIndex: 4, title: '작업자 교대 로그', subtitle: '교대 이벤트와 메모 피드가 들어옵니다.' },
  { slotIndex: 5, title: '중요 알림', subtitle: 'Critical alert 카드와 toast 연동 예정 슬롯입니다.' },
]

const DEFAULT_FILTERS: LotFilters = {
  lotIdQuery: '',
  status: 'all',
  recentOnly: false,
}

function DashboardApp() {
  const [user, setUser] = useAtom(authAtom)
  const [authResolved, setAuthResolved] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [filters, setFilters] = useState<LotFilters>(DEFAULT_FILTERS)
  const { rows, loading, error, lastUpdated, refresh } = useMyHoldTable(user)
  const deferredLotIdQuery = useDeferredValue(filters.lotIdQuery)
  const filteredRows = filterLotRows(rows, {
    ...filters,
    lotIdQuery: deferredLotIdQuery,
  })

  const redirectToSso = useEffectEvent(() => {
    window.location.assign('/api/auth/sso/init')
  })

  const loadSession = useEffectEvent(async () => {
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

      setAuthError(sessionError instanceof Error ? sessionError.message : '세션을 확인하지 못했습니다.')
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
    setFilters((currentFilters) => ({
      ...currentFilters,
      ...nextFilters,
    }))
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
    <div className="app-shell">
      <SideNav
        filters={filters}
        totalRows={rows.length}
        visibleRows={filteredRows.length}
        onFiltersChange={handleFiltersChange}
        onResetFilters={handleResetFilters}
        onLogout={handleLogout}
      />

      <div className="main-shell">
        <TopNav user={user} />

        <main className="dashboard-content">
          <DashboardGrid>
            <PlaceholderPanel {...PLACEHOLDER_SLOTS[0]} />
            <LotHoldPanel
              rows={filteredRows}
              loading={loading}
              error={error}
              lastUpdated={lastUpdated}
              onRefresh={refresh}
            />
            <PlaceholderPanel {...PLACEHOLDER_SLOTS[1]} />
            <PlaceholderPanel {...PLACEHOLDER_SLOTS[2]} />
            <PlaceholderPanel {...PLACEHOLDER_SLOTS[3]} />
            <PlaceholderPanel {...PLACEHOLDER_SLOTS[4]} />
          </DashboardGrid>
        </main>

        <SystemFooter />
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Provider>
      <DashboardApp />
    </Provider>
  )
}
