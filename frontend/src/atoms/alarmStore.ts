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

export function clearAll(): AlarmItem[] {
  return []
}
