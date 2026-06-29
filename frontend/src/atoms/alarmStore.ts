import type { AlarmItem } from '../types/alarm'

export const ALARM_CAP = 50

export function addAlarm(items: AlarmItem[], item: AlarmItem): AlarmItem[] {
  if (items.some((existing) => existing.eventId === item.eventId)) {
    return items
  }
  return [item, ...items].slice(0, ALARM_CAP)
}

export function unreadCount(items: AlarmItem[]): number {
  return items.reduce((count, item) => (item.read ? count : count + 1), 0)
}

export function markAllRead(items: AlarmItem[]): AlarmItem[] {
  return items.map((item) => (item.read ? item : { ...item, read: true }))
}

/** eventId로 알람 하나를 제거한다. 박스에서 항목을 클릭(=처리)하면 그 알람을 비운다. */
export function removeAlarm(items: AlarmItem[], eventId: string): AlarmItem[] {
  return items.filter((item) => item.eventId !== eventId)
}

export function clearAll(): AlarmItem[] {
  return []
}
