import { useAtom } from 'jotai'
import { useEffect } from 'react'
import { authAtom } from '../atoms/authAtom'
import { Header } from '../components/layout/Header'
import { DashboardGrid } from '../components/layout/DashboardGrid'
import { useTableData } from '../hooks/useTableData'
import { useSlot1WebSocket } from '../hooks/useSlot1WebSocket'
import { ApiError, fetchJson } from '../services/api'
import type { AuthSessionResponse } from '../types/auth'

function redirectToSSO() {
  window.location.assign('/api/auth/sso/init')
}

export function App() {
  const [user, setUser] = useAtom(authAtom)
  const { rows, lastUpdated, loading, setRows, setLastUpdated } = useTableData(1, Boolean(user))
  const refreshFromSocket = useSlot1WebSocket({
    enabled: Boolean(user),
    tableId: 1,
    onRows: setRows,
    onUpdatedAt: setLastUpdated
  })

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      try {
        const session = await fetchJson<AuthSessionResponse>('/api/auth/session')
        if (!active) {
          return
        }

        if (!session.authenticated || !session.user) {
          redirectToSSO()
          return
        }

        setUser(session.user)
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          redirectToSSO()
          return
        }

        throw error
      }
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [setUser])

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
    redirectToSSO()
  }

  if (!user) {
    return <div className="app-loading">세션 확인 중…</div>
  }

  return (
    <div className="app-shell">
      <Header user={user} onLogout={handleLogout} />
      <DashboardGrid
        slot1Rows={rows}
        slot1Loading={loading}
        slot1LastUpdated={lastUpdated}
        onSlot1Refresh={() => {
          refreshFromSocket()
        }}
      />
    </div>
  )
}
