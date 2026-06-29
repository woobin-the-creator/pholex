import { useMemo, useState } from 'react'
import { useAtom } from 'jotai'
import { themeAtom } from '../../atoms/themeAtom'
import type { SessionUser } from '../../types/auth'
import { useCountUp } from '../../hooks/useCountUp'

export interface KpiSpec {
  label: string
  value: number | null
  decimals?: number
  tone?: 'default' | 'hold'
}

interface DashHeaderProps {
  scope: string
  liveAt: string | null
  kpis: KpiSpec[]
  user: SessionUser | null
}

function formatClock(iso: string | null): string {
  if (!iso) return '--:--:--'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--:--'
  return date.toLocaleTimeString('ko-KR', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function initialsOf(user: SessionUser | null): string {
  const name = user?.username?.trim() ?? ''
  if (!name) return 'WB'
  // Latin name with a space → first initials (e.g. "John Doe" → "JD")
  if (name.includes(' ') && /^[A-Za-z\s]+$/.test(name)) {
    const parts = name.split(/\s+/)
    return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
  }
  // Korean / single-word → first 2 chars (e.g. "김우빈" → "김우", "데모 사용자" → "데모")
  return name.replace(/\s+/g, '').slice(0, 2)
}

function Kpi({ spec, delay }: { spec: KpiSpec; delay: number }) {
  const isNumeric = typeof spec.value === 'number' && Number.isFinite(spec.value)
  const text = useCountUp({
    target: isNumeric ? (spec.value as number) : 0,
    decimals: spec.decimals ?? 0,
    delay,
    enabled: isNumeric,
  })
  const toneClass = spec.tone === 'hold' ? ' kpi--hold' : ''

  return (
    <div className={`kpi${toneClass}${isNumeric ? '' : ' kpi--pending'}`}>
      <span className="kpi__label">{spec.label}</span>
      <span className="kpi__value">
        {isNumeric ? (
          text
        ) : (
          <span className="kpi__pending" title="데이터 준비 중">
            —
          </span>
        )}
      </span>
    </div>
  )
}

export function DashHeader({ scope, liveAt, kpis, user }: DashHeaderProps) {
  const clock = useMemo(() => formatClock(liveAt), [liveAt])
  const [theme, setTheme] = useAtom(themeAtom)
  const [flipping, setFlipping] = useState(false)

  const toggleTheme = () => {
    setFlipping(true)
    window.setTimeout(() => setFlipping(false), 420)
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  // 단일 바: 좌측은 날짜·Live·KPI를 묶은 상태줄, 우측은 테마·유저 컨트롤.
  // (구 TopNav 바를 흡수 — 두 줄 헤더의 공간 낭비 제거)
  return (
    <section className="dash-header">
      <div className="dash-header__context">
        <p className="dash-header__meta">
          <span>{scope}</span>
          <span className="dash-header__live">Live · {clock}</span>
        </p>
        <div className="kpis">
          {kpis.map((spec, index) => (
            <Kpi key={spec.label} spec={spec} delay={260 + index * 60} />
          ))}
        </div>
      </div>

      <div className="topnav__right">
        <button
          type="button"
          className={`theme-switch${flipping ? ' is-flipping' : ''}`}
          onClick={toggleTheme}
          aria-label="Toggle theme"
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {theme === 'light' ? 'dark_mode' : 'light_mode'}
          </span>
          <span>{theme === 'light' ? 'Dark' : 'Light'}</span>
        </button>

        <div className="user">
          <div className="user__meta">
            <div className="user__name">{user?.username ?? '데모 사용자'}</div>
            <div className="user__role">{user?.employee_number ?? 'Engineer'}</div>
          </div>
          <div className="avatar" aria-hidden="true">{initialsOf(user)}</div>
        </div>
      </div>
    </section>
  )
}
