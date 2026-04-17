interface TableHeaderProps {
  title: string
  lastUpdated: Date | null
  onRefresh: () => void
  refreshDisabled?: boolean
}

function formatTimestamp(value: Date | null): string {
  if (!value) {
    return '없음'
  }

  const hours = String(value.getHours()).padStart(2, '0')
  const minutes = String(value.getMinutes()).padStart(2, '0')
  const seconds = String(value.getSeconds()).padStart(2, '0')
  const milliseconds = String(value.getMilliseconds()).padStart(3, '0')

  return `${hours}:${minutes}:${seconds}.${milliseconds}`
}

export function TableHeader({ title, lastUpdated, onRefresh, refreshDisabled = false }: TableHeaderProps) {
  return (
    <div className="table-slot__header">
      <div>
        <h2>{title}</h2>
        <p className="table-slot__meta">
          마지막 갱신 {formatTimestamp(lastUpdated)}
        </p>
      </div>
      <button type="button" className="table-slot__refresh" disabled={refreshDisabled} onClick={onRefresh}>
        새로고침
      </button>
    </div>
  )
}
