interface TableHeaderProps {
  title: string
  lastUpdated: Date | null
  onRefresh: () => void
  refreshDisabled?: boolean
}

export function TableHeader({ title, lastUpdated, onRefresh, refreshDisabled = false }: TableHeaderProps) {
  return (
    <div className="table-slot__header">
      <div>
        <h2>{title}</h2>
        <p className="table-slot__meta">
          마지막 갱신 {lastUpdated ? lastUpdated.toLocaleTimeString('ko-KR', { hour12: false }) : '없음'}
        </p>
      </div>
      <button type="button" className="table-slot__refresh" disabled={refreshDisabled} onClick={onRefresh}>
        새로고침
      </button>
    </div>
  )
}
