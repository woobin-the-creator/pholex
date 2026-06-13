import type { AlarmItem } from '../types/alarm'

/** 알람 한 건을 사람이 읽을 한 줄로. status는 열린 집합이라 raw 값을 그대로 보여준다. */
export function describeAlarm(item: AlarmItem): string {
  switch (item.changeType) {
    case 'status':
      return `${item.previousStatus ?? '?'} → ${item.newStatus ?? '?'}`
    case 'hold':
      return `hold ${item.newStatus ?? '변경'}`
    case 'comment':
      return item.newHoldComment ? `코멘트: ${item.newHoldComment}` : '코멘트 변경'
    case 'created':
      return '새 랏 등장'
    case 'removed':
      return '랏 사라짐'
    default:
      return item.changeType
  }
}

export function clockLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '--:--'
  return date.toLocaleTimeString('ko-KR', { hour12: false, hour: '2-digit', minute: '2-digit' })
}
