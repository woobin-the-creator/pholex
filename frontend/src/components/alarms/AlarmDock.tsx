import type { AlarmItem } from '../../types/alarm'
import { clockLabel, describeAlarm } from '../../utils/alarmDisplay'

interface AlarmDockProps {
  open: boolean
  alarms: AlarmItem[]
  onClose: () => void
  onClear: () => void
  onSelect: (lotId: string) => void
}

/**
 * 좌측 사이드바 "알람 박스"가 열어주는 패널. 변경을 시간순 평면 로그로 보여준다.
 * 항목 클릭 → 메인 테이블의 해당 랏으로 점프(App focusLot). 적립은 localStorage 영속.
 */
export function AlarmDock({ open, alarms, onClose, onClear, onSelect }: AlarmDockProps) {
  if (!open) return null

  return (
    <aside className="alarm-dock" role="dialog" aria-label="알람 박스">
      <header className="alarm-dock__head">
        <h2 className="alarm-dock__title">알람 박스</h2>
        <div className="alarm-dock__head-actions">
          <button
            type="button"
            className="alarm-dock__clear"
            onClick={onClear}
            disabled={alarms.length === 0}
          >
            모두 비우기
          </button>
          <button type="button" className="alarm-dock__close" onClick={onClose} aria-label="닫기">
            ×
          </button>
        </div>
      </header>

      {alarms.length === 0 ? (
        <p className="alarm-dock__empty">새 알람이 없습니다.</p>
      ) : (
        <ul className="alarm-dock__list">
          {alarms.map((alarm: AlarmItem) => (
            <li key={alarm.eventId}>
              <button
                type="button"
                className={`alarm-item alarm-item--${alarm.severity}${alarm.read ? '' : ' is-unread'}`}
                onClick={() => onSelect(alarm.lotId)}
              >
                <span className="alarm-item__lot">{alarm.lotId}</span>
                <span className="alarm-item__desc">{describeAlarm(alarm)}</span>
                <span className="alarm-item__time">{clockLabel(alarm.occurredAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
