import { describe, expect, it } from 'vitest'
import { addAlarm, clearAll, markAllRead, unreadCount } from '../atoms/alarmStore'
import type { AlarmItem } from '../types/alarm'

function makeAlarm(overrides: Partial<AlarmItem> = {}): AlarmItem {
  return {
    eventId: 'evt-1',
    lotId: 'LOT-A2948',
    changeType: 'status',
    previousStatus: 'Run',
    newStatus: 'Hold',
    newHoldComment: null,
    occurredAt: '2026-06-13T05:21:00+09:00',
    severity: 'critical',
    read: false,
    ...overrides,
  }
}

describe('addAlarm', () => {
  it('appends a new alarm to an empty list', () => {
    const result = addAlarm([], makeAlarm())

    expect(result).toHaveLength(1)
    expect(result[0].eventId).toBe('evt-1')
  })

  it('ignores a duplicate eventId (idempotent on reconnect)', () => {
    const existing = [makeAlarm({ eventId: 'evt-1' })]

    const result = addAlarm(existing, makeAlarm({ eventId: 'evt-1', read: true }))

    expect(result).toHaveLength(1)
    expect(result[0].read).toBe(false)
  })

  it('caps the list at 50, dropping the oldest', () => {
    let items: AlarmItem[] = []
    for (let i = 0; i < 55; i += 1) {
      items = addAlarm(items, makeAlarm({ eventId: `evt-${i}` }))
    }

    expect(items).toHaveLength(50)
    expect(items[0].eventId).toBe('evt-54')
    expect(items.some((a) => a.eventId === 'evt-0')).toBe(false)
  })
})

describe('unreadCount', () => {
  it('counts only unread alarms', () => {
    const items = [
      makeAlarm({ eventId: 'a', read: false }),
      makeAlarm({ eventId: 'b', read: true }),
      makeAlarm({ eventId: 'c', read: false }),
    ]

    expect(unreadCount(items)).toBe(2)
  })
})

describe('markAllRead', () => {
  it('marks every alarm read so nothing is unread', () => {
    const items = [
      makeAlarm({ eventId: 'a', read: false }),
      makeAlarm({ eventId: 'b', read: false }),
    ]

    const result = markAllRead(items)

    expect(unreadCount(result)).toBe(0)
  })
})

describe('clearAll', () => {
  it('empties the list', () => {
    expect(clearAll()).toEqual([])
  })
})
