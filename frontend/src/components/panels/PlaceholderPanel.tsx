interface PlaceholderPanelProps {
  slotIndex: number
  title: string
  subtitle: string
}

export function PlaceholderPanel({ slotIndex, title, subtitle }: PlaceholderPanelProps) {
  const headingId = `placeholder-panel-${slotIndex}`

  return (
    <section className="panel placeholder-panel" aria-labelledby={headingId} data-testid="dashboard-panel">
      <header className="panel__header">
        <div>
          <p className="panel__eyebrow">{slotIndex}. Placeholder</p>
          <h2 id={headingId} className="panel__title">
            {title}
          </h2>
        </div>
        <span className="panel__meta">MVP 이후</span>
      </header>

      <div className="placeholder-panel__body">
        <p className="placeholder-panel__subtitle">{subtitle}</p>
        <p className="placeholder-panel__copy">이 슬롯은 현재 MVP 범위 밖이라 자리만 유지합니다.</p>
      </div>
    </section>
  )
}
