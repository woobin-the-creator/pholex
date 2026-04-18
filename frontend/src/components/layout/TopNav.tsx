import type { SessionUser } from '../../types/auth'

interface TopNavProps {
  user: SessionUser | null
}

const PAGE_ITEMS = [
  { icon: 'dashboard', label: 'Dashboard', active: true },
  { icon: 'lan', label: 'Lot Tracking' },
  { icon: 'precision_manufacturing', label: 'Equipment' },
  { icon: 'analytics', label: 'Yield Analytics' },
  { icon: 'description', label: 'Reports' },
]

export function TopNav({ user }: TopNavProps) {
  return (
    <header className="top-nav">
      <div className="top-nav__left">
        <p className="top-nav__brand">Lot Monitor</p>

        <nav className="top-nav__page-nav" aria-label="Page sections">
          {PAGE_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`top-nav__page-link${item.active ? ' top-nav__page-link--active' : ''}`}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </div>

      <div className="top-nav__right">
        <label className="top-nav__search" aria-label="Search lots">
          <span className="material-symbols-outlined" aria-hidden="true">
            search
          </span>
          <input type="search" placeholder="Search Lot, Tool, or Operator..." />
        </label>

        <button type="button" className="top-nav__icon-button" aria-label="Notifications">
          <span className="material-symbols-outlined" aria-hidden="true">
            notifications
          </span>
        </button>

        <button type="button" className="top-nav__icon-button" aria-label="Settings">
          <span className="material-symbols-outlined" aria-hidden="true">
            settings
          </span>
        </button>

        <div className="top-nav__user">
          <div>
            <p className="top-nav__user-name">{user?.username ?? 'Lead Engineer'}</p>
            <p className="top-nav__user-meta">{user?.employee_number ?? 'Station 04-A'}</p>
          </div>

          <div className="top-nav__avatar" aria-hidden="true">
            {user?.username?.slice(0, 1) ?? 'L'}
          </div>
        </div>
      </div>
    </header>
  )
}
