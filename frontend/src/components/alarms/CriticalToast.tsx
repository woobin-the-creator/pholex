import type { AlarmItem } from '../../types/alarm'
import { describeAlarm } from '../../utils/alarmDisplay'

interface CriticalToastProps {
  item: AlarmItem
  onJump: () => void
  onDismiss: () => void
}

/** critical(→hold)/warning 순간 팝. ~10초 뜨고, 무시하면 만료 후 dock에 안읽음으로 남는다. */
export function CriticalToast({ item, onJump, onDismiss }: CriticalToastProps) {
  return (
    <div className={`alarm-pop alarm-pop--${item.severity}`} role="alert">
      <div className="alarm-pop__body">
        <span className="alarm-pop__lot">{item.lotId}</span>
        <span className="alarm-pop__desc">{describeAlarm(item)}</span>
      </div>
      <div className="alarm-pop__actions">
        <button type="button" className="alarm-pop__jump" onClick={onJump}>
          이동
        </button>
        <button type="button" className="alarm-pop__close" onClick={onDismiss} aria-label="닫기">
          ×
        </button>
      </div>
    </div>
  )
}
