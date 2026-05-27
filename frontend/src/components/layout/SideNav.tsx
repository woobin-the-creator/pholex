import type { LotFilters } from '../../utils/filterLots'

interface SideNavProps {
  filters: LotFilters
  totalRows: number
  visibleRows: number
  onFiltersChange: (nextFilters: Partial<LotFilters>) => void
  onResetFilters: () => void
  onLogout: () => void
}

export function SideNav({
  filters,
  totalRows,
  visibleRows,
  onFiltersChange,
  onResetFilters,
  onLogout,
}: SideNavProps) {
  return (
    <aside className="side-nav" aria-label="Lot filters">
      <div className="side-nav__brand">
        <div className="side-nav__brand-mark">F7</div>
        <div>
          <h1 className="side-nav__title">Fab 7 Operations</h1>
          <p className="side-nav__subtitle">Batch Monitoring Active</p>
        </div>
      </div>

      <section className="side-nav__filters">
        <div className="side-nav__section-heading">
          <div>
            <p className="side-nav__section-label">Lot Filters</p>
            <h2 className="side-nav__section-title">내가 볼 lot 조건</h2>
          </div>

          <button type="button" className="side-nav__reset" onClick={onResetFilters}>
            초기화
          </button>
        </div>

        <p className="side-nav__summary">
          현재 <strong>{visibleRows}</strong> / {totalRows} lot 표시 중
        </p>

        <label className="side-nav__field" htmlFor="lot-id-query">
          <span className="side-nav__field-label">Lot ID 검색</span>
          <input
            id="lot-id-query"
            type="search"
            value={filters.lotIdQuery}
            onChange={(event) => onFiltersChange({ lotIdQuery: event.target.value })}
            placeholder="LOT-A2948..."
          />
        </label>

        <label className="side-nav__field" htmlFor="lot-status">
          <span className="side-nav__field-label">상태</span>
          <select
            id="lot-status"
            value={filters.status}
            onChange={(event) =>
              onFiltersChange({
                status: event.target.value as LotFilters['status'],
              })
            }
          >
            <option value="all">전체 상태</option>
            <option value="hold">hold</option>
            <option value="wait">wait</option>
            <option value="run">run</option>
          </select>
        </label>

        <label className="side-nav__toggle">
          <input
            type="checkbox"
            checked={filters.recentOnly}
            onChange={(event) => onFiltersChange({ recentOnly: event.target.checked })}
          />
          <span>최근 30분 내 변경만 보기</span>
        </label>

        <p className="side-nav__hint">최근 변경 필터는 현재 목록의 마지막 갱신 시각을 기준으로 계산합니다.</p>
      </section>

      <div className="side-nav__footer">
        <button type="button" className="side-nav__footer-link">
          <span className="material-symbols-outlined" aria-hidden="true">
            help
          </span>
          <span>Support</span>
        </button>

        <button type="button" className="side-nav__footer-link" onClick={onLogout}>
          <span className="material-symbols-outlined" aria-hidden="true">
            logout
          </span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
