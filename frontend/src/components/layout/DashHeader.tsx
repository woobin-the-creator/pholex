import { useMemo } from 'react'
import { useCountUp } from '../../hooks/useCountUp'

export interface KpiSpec {
  label: string
  value: number | null
  decimals?: number
  suffix?: string
  tone?: 'default' | 'hold' | 'yield'
}

interface DashHeaderProps {
  pageLabel: string
  scope: string
  liveAt: string | null
  kpis: KpiSpec[]
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

function Kpi({ spec, delay }: { spec: KpiSpec; delay: number }) {
  const isNumeric = typeof spec.value === 'number' && Number.isFinite(spec.value)
  const text = useCountUp({
    target: isNumeric ? (spec.value as number) : 0,
    decimals: spec.decimals ?? 0,
    delay,
    enabled: isNumeric,
  })
  const toneClass = spec.tone === 'hold' ? ' kpi--hold' : spec.tone === 'yield' ? ' kpi--yield' : ''

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
        {isNumeric && spec.suffix ? <span className="kpi__unit">{spec.suffix}</span> : null}
      </span>
    </div>
  )
}

export function DashHeader({ pageLabel, scope, liveAt, kpis }: DashHeaderProps) {
  const clock = useMemo(() => formatClock(liveAt), [liveAt])

  return (
    <section className="dash-header">
      <div className="dash-header__context">
        <h1 className="dash-header__page">{pageLabel}</h1>
        <p className="dash-header__meta">
          <span>{scope}</span>
          <span className="dash-header__live">Live · {clock}</span>
        </p>
      </div>

      <div className="kpis">
        {kpis.map((spec, index) => (
          <Kpi key={spec.label} spec={spec} delay={260 + index * 60} />
        ))}
      </div>
    </section>
  )
}
