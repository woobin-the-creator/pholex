import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import type { AlarmItem } from '../types/alarm'
import { addAlarm, clearAll, markAllRead, unreadCount } from './alarmStore'

// localStorage 영속 — 새로고침/재로그인에도 본 알람이 살아남는다.
// 백엔드는 과거 이벤트를 replay하지 않으므로, 이 박스가 "놓친 critical"의 유일한 기록이다.
export const alarmsAtom = atomWithStorage<AlarmItem[]>('pholex.alarms', [])

export const unreadCountAtom = atom((get) => unreadCount(get(alarmsAtom)))

/** 알람 적립. 새로 추가됐으면 true, eventId 중복이면 false를 돌려준다(팝 발화 판단용). */
export const pushAlarmAtom = atom(null, (get, set, item: AlarmItem): boolean => {
  const current = get(alarmsAtom)
  const next = addAlarm(current, item)
  if (next === current) {
    return false
  }
  set(alarmsAtom, next)
  return true
})

export const markAllReadAtom = atom(null, (get, set) => {
  set(alarmsAtom, markAllRead(get(alarmsAtom)))
})

export const clearAlarmsAtom = atom(null, (_get, set) => {
  set(alarmsAtom, clearAll())
})
