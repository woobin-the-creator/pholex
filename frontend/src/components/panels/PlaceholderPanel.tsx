interface PlaceholderPanelProps {
  slotIndex: number
  title: string
  subtitle: string
  spanTwo?: boolean
}

const SLOT_LABEL = (n: number) => `— 0${n + 1}`

export function PlaceholderPanel({
  slotIndex,
  title,
  subtitle,
  spanTwo = false,
}: PlaceholderPanelProps) {
  const headingId = `placeholder-panel-${slotIndex}`

  return (
    <article
      className={`card${spanTwo ? ' card--span2' : ''}`}
      aria-labelledby={headingId}
      data-testid="dashboard-panel"
    >
      <header className="card__head">
        <div>
          <p className="card__index">{SLOT_LABEL(slotIndex)}</p>
          <h2 id={headingId} className="card__title">
            {title}
          </h2>
        </div>
        <span className="card__meta">MVP 이후</span>
      </header>

      <p className="placeholder-copy">{subtitle}</p>
    </article>
  )
}
