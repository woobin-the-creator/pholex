import { useAtom } from 'jotai'
import { useState } from 'react'
import { themeAtom } from '../../atoms/themeAtom'
import type { SessionUser } from '../../types/auth'

interface TopNavProps {
  user: SessionUser | null
}

const PAGE_ITEMS = [
  { label: 'Overview', active: true },
]

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

export function TopNav({ user }: TopNavProps) {
  const [theme, setTheme] = useAtom(themeAtom)
  const [flipping, setFlipping] = useState(false)

  const toggleTheme = () => {
    setFlipping(true)
    window.setTimeout(() => setFlipping(false), 420)
    setTheme(theme === 'light' ? 'dark' : 'light')
  }

  return (
    <nav className="topnav" aria-label="Primary">
      <div className="topnav__left">
        <p className="topnav__title">batch monitoring</p>
        <div className="pages">
          {PAGE_ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`page-link${item.active ? ' is-active' : ''}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="topnav__right">
        <label className="search" aria-label="Search">
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 16 }}>
            search
          </span>
          <input type="search" placeholder="Search lot, tool, comment…" />
        </label>

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

        <button type="button" className="icon-btn" aria-label="Notifications">
          <span className="material-symbols-outlined" aria-hidden="true">notifications</span>
        </button>

        <button type="button" className="icon-btn" aria-label="Settings">
          <span className="material-symbols-outlined" aria-hidden="true">settings</span>
        </button>

        <div className="user">
          <div className="user__meta">
            <div className="user__name">{user?.username ?? '데모 사용자'}</div>
            <div className="user__role">{user?.employee_number ?? 'Engineer'}</div>
          </div>
          <div className="avatar" aria-hidden="true">{initialsOf(user)}</div>
        </div>
      </div>
    </nav>
  )
}
