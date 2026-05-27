import type { MouseEvent } from 'react'

interface PlaceholderPanelProps {
  slotIndex: number
  title: string
  subtitle: string
  spanTwo?: boolean
  isMaximized?: boolean
  onToggleMaximize?: () => void
  /** view-transition-name. Set to enable cross-state morph via View Transitions API. */
  vtName?: string
}

const SLOT_LABEL = (n: number) => `— 0${n + 1}`

export function PlaceholderPanel({
  slotIndex,
  title,
  subtitle,
  spanTwo = false,
  isMaximized = false,
  onToggleMaximize,
  vtName,
}: PlaceholderPanelProps) {
  const headingId = `placeholder-panel-${slotIndex}`

  const handleHeadDoubleClick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) return
    onToggleMaximize?.()
  }

  return (
    <article
      className={`card${spanTwo ? ' card--span2' : ''}${isMaximized ? ' is-maximized' : ''}`}
      aria-labelledby={headingId}
      data-testid="dashboard-panel"
      style={vtName ? { viewTransitionName: vtName } : undefined}
    >
      <header className="card__head" onDoubleClick={handleHeadDoubleClick}>
        <div>
          <p className="card__index">{SLOT_LABEL(slotIndex)}</p>
          <h2 id={headingId} className="card__title">
            {title}
          </h2>
        </div>
        <div className="card__meta">
          <span>MVP 이후</span>
          {onToggleMaximize ? (
            <button
              type="button"
              className="card__icon"
              onClick={onToggleMaximize}
              aria-label={isMaximized ? '원래대로' : '패널 확대'}
              title={isMaximized ? '원래대로 (ESC)' : '패널 확대'}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {isMaximized ? 'close_fullscreen' : 'open_in_full'}
              </span>
            </button>
          ) : null}
        </div>
      </header>

      <p className="placeholder-copy">{subtitle}</p>
    </article>
  )
}
