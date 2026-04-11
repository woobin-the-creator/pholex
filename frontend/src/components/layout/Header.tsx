import type { AuthUser } from '../../types/auth'

interface HeaderProps {
  user: AuthUser
  onLogout: () => void | Promise<void>
}

export function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="app-header">
      <div>
        <p className="app-header__eyebrow">Pholex MVP</p>
        <h1 className="app-header__title">대시보드</h1>
      </div>
      <div className="app-header__actions">
        <span className="app-header__user">{user.username}</span>
        <button type="button" className="app-header__logout" onClick={() => void onLogout()}>
          로그아웃
        </button>
      </div>
    </header>
  )
}
