import { useAtom, useAtomValue } from 'jotai'
import { Provider } from 'jotai/react'
import { useDeferredValue, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { Toaster, toast } from 'sonner'
import { authAtom } from '../atoms/authAtom'
import { themeAtom } from '../atoms/themeAtom'
import { TopNav } from '../components/layout/TopNav'
import { SideNav } from '../components/layout/SideNav'
import { DashboardGrid } from '../components/layout/DashboardGrid'
import { DashHeader, type KpiSpec } from '../components/layout/DashHeader'
import { LotHoldPanel } from '../components/panels/LotHoldPanel'
import { SpecialHoldPanel } from '../components/panels/SpecialHoldPanel'
import { AlarmDock } from '../components/alarms/AlarmDock'
import { useMyHoldTable } from '../hooks/useMyHoldTable'
import { useAlarms } from '../hooks/useAlarms'
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
  return `${dd}.${mm}.${yyyy}`
}

type PanelId = 'live' | 'slot-4'

function DashboardApp() {
  const [user, setUser] = useAtom(authAtom)
  const [authResolved, setAuthResolved] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [filters, setFilters] = useState<LotFilters>(DEFAULT_FILTERS)
  const [maximized, setMaximized] = useState<PanelId | null>(null)
  const [alarmsOpen, setAlarmsOpen] = useState(false)
  const [focusLotId, setFocusLotId] = useState<string | null>(null)

  // 순환 끊기: useAlarms→focusLot→filteredRows→rows→useMyHoldTable→handleAlarm.
  // focusLot은 최신 filteredRows를 ref로 읽고, useAlarms엔 안정 래퍼만 넘긴다.
  const focusLotRef = useRef<(lotId: string) => void>(() => {})
  const stableFocusLot = useRef((lotId: string) => focusLotRef.current(lotId)).current
  const { alarms, unread, handleAlarm, markAllRead, clearAlarms, removeAlarm } =
    useAlarms(stableFocusLot)
  const { rows, loading, error, lastUpdated, refresh } = useMyHoldTable(user, handleAlarm)

  // 데모/e2e 전용: 성능 e2e가 토스트를 직접 띄울 수 있게 노출. DEMO_MODE에서만 등록(프로덕션 비활성).
  useEffect(() => {
    if (!DEMO_MODE) return undefined
    const w = window as Window & { __demoAlarm?: typeof handleAlarm }
    w.__demoAlarm = handleAlarm
    return () => {
      delete w.__demoAlarm
    }
  }, [handleAlarm])

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

  // 알람 클릭 → 테이블 점프. 필터에 가려져 있으면 필터를 풀고(안내) 이동시킨다.
  const focusLot = (lotId: string) => {
    setAlarmsOpen(false)
    if (!filteredRows.some((row) => row.lotId === lotId)) {
      setFilters(DEFAULT_FILTERS)
      toast('필터를 해제하고 이동했습니다', { description: lotId })
    }
    setFocusLotId(lotId)
  }
  focusLotRef.current = focusLot

  // 박스 항목 클릭 = 그 변경을 "처리"한 것 → 해당 알람을 비우고 랏으로 점프한다.
  // focusLot 자체는 WS 자동 점프 등에서도 쓰이므로 순수하게 두고, 제거는 이 클릭 경로에서만.
  const handleAlarmSelect = (lotId: string, eventId: string) => {
    removeAlarm(eventId)
    focusLot(lotId)
  }

  // (A) 박스를 열면 전부 읽음 처리 — 배지가 0으로. 항목별 읽음은 추후 read 플래그로 승격.
  const openAlarms = () => {
    setAlarmsOpen(true)
    markAllRead()
  }

  useEffect(() => {
    if (!focusLotId) return undefined
    const timer = window.setTimeout(() => setFocusLotId(null), 3000)
    return () => window.clearTimeout(timer)
  }, [focusLotId])

  const kpis = useMemo<KpiSpec[]>(() => {
    const activeCount = rows.length
    const holdCount = rows.filter((row) => row.status === HOLD_STATUS).length
    return [
      { label: 'Active', value: activeCount },
      { label: 'Hold', value: holdCount, tone: 'hold' },
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
        unreadAlarms={unread}
        onOpenAlarms={openAlarms}
        onFiltersChange={handleFiltersChange}
        onResetFilters={handleResetFilters}
        onLogout={handleLogout}
      />

      <AlarmDock
        open={alarmsOpen}
        alarms={alarms}
        onClose={() => setAlarmsOpen(false)}
        onClear={clearAlarms}
        onSelect={handleAlarmSelect}
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
          <LotHoldPanel
            rows={filteredRows}
            loading={loading}
            error={error}
            lastUpdated={lastUpdated}
            onRefresh={refresh}
            focusLotId={focusLotId}
            isMaximized={maximized === 'live'}
            onToggleMaximize={() => toggleMaximize('live')}
            vtName="card-live"
          />
          <SpecialHoldPanel
            isMaximized={maximized === 'slot-4'}
            onToggleMaximize={() => toggleMaximize('slot-4')}
            vtName="card-slot-4"
          />
        </DashboardGrid>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <Provider>
      <ThemeBinder />
      <DashboardApp />
      <Toaster position="top-center" />
    </Provider>
  )
}
