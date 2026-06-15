import type { LotFilters } from '../../utils/filterLots'

interface SideNavProps {
  filters: LotFilters
  statusOptions: string[]
  totalRows: number
  visibleRows: number
  unreadAlarms: number
  onOpenAlarms: () => void
  onFiltersChange: (nextFilters: Partial<LotFilters>) => void
  onResetFilters: () => void
  onLogout: () => void
}

// "Lot tracking"(과거 빈 버튼) 자리를 알람 박스로 교체 — 배지 + 클릭 시 dock 패널을 연다.
const NAV_ITEMS = [
  { icon: 'dashboard', label: 'Dashboard', active: true },
  { icon: 'precision_manufacturing', label: 'Equipment' },
  { icon: 'analytics', label: 'Yield analytics' },
  { icon: 'description', label: 'Reports' },
]

export function SideNav({
  filters,
  statusOptions,
  totalRows,
  visibleRows,
  unreadAlarms,
  onOpenAlarms,
  onFiltersChange,
  onResetFilters,
  onLogout,
}: SideNavProps) {
  return (
    <aside className="side" aria-label="Workspace navigation">
      <div className="brand">
        <p className="brand__mark">
          pho<span className="brand__accent">lex</span>
        </p>
        <div className="brand__line" aria-hidden="true" />
        <p className="brand__sub">Fab 7 ops</p>
      </div>

      <div className="nav-section">
        <p className="nav-section__label">Workspace</p>
        <ul className="nav-list">
          <li>
            <button
              type="button"
              className="nav-item nav-item--alarms"
              onClick={onOpenAlarms}
              aria-label={`알람 박스${unreadAlarms > 0 ? ` (안읽음 ${unreadAlarms})` : ''}`}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                notifications
              </span>
              <span>알람 박스</span>
              {unreadAlarms > 0 ? (
                <span className="nav-item__badge" data-testid="alarm-badge">
                  {unreadAlarms > 99 ? '99+' : unreadAlarms}
                </span>
              ) : null}
            </button>
          </li>
          {NAV_ITEMS.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                className={`nav-item${item.active ? ' is-active' : ''}`}
              >
                <span className="material-symbols-outlined" aria-hidden="true">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="nav-section">
        <p className="nav-section__label">Filter</p>
        <div className="side-filters">
          <label className="field" htmlFor="lot-id-query">
            <span className="field__label">Lot ID</span>
            <input
              id="lot-id-query"
              className="field__input"
              type="search"
              value={filters.lotIdQuery}
              onChange={(event) => onFiltersChange({ lotIdQuery: event.target.value })}
              placeholder="LOT-A2948…"
            />
          </label>

          <label className="field" htmlFor="lot-status">
            <span className="field__label">상태</span>
            <select
              id="lot-status"
              className="field__input field__select"
              value={filters.status}
              onChange={(event) => onFiltersChange({ status: event.target.value })}
            >
              <option value="all">전체</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>

          <label className="toggle">
            <input
              type="checkbox"
              checked={filters.recentOnly}
              onChange={(event) => onFiltersChange({ recentOnly: event.target.checked })}
            />
            <span>최근 30분 변경만</span>
          </label>

          <div className="side-summary">
            <strong>{visibleRows}</strong> of {totalRows} lots
            <br />
            <button type="button" className="side-summary__reset" onClick={onResetFilters}>
              필터 초기화
            </button>
          </div>
        </div>
      </div>

      <div className="side-footer">
        <button type="button" className="nav-item">
          <span className="material-symbols-outlined" aria-hidden="true">
            help
          </span>
          <span>Support</span>
        </button>

        <button type="button" className="nav-item" onClick={onLogout}>
          <span className="material-symbols-outlined" aria-hidden="true">
            logout
          </span>
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  )
}
