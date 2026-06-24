import { describe, expect, it } from 'vitest'
import { alarmMatchesQuery } from '../utils/alarmDisplay'
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

describe('alarmMatchesQuery', () => {
  it('빈/공백 검색어는 모든 알람을 통과시킨다', () => {
    const alarm = makeAlarm()
    expect(alarmMatchesQuery(alarm, '')).toBe(true)
    expect(alarmMatchesQuery(alarm, '   ')).toBe(true)
  })

  it('lotId를 대소문자 무시 substring으로 매칭한다', () => {
    const alarm = makeAlarm({ lotId: 'LOT-A2948' })
    expect(alarmMatchesQuery(alarm, 'a2948')).toBe(true)
    expect(alarmMatchesQuery(alarm, 'LOT-')).toBe(true)
    expect(alarmMatchesQuery(alarm, 'B1175')).toBe(false)
  })

  it('describeAlarm 결과(상태 전이)도 검색 대상에 포함한다', () => {
    const alarm = makeAlarm({ changeType: 'status', previousStatus: 'Run', newStatus: 'Hold' })
    expect(alarmMatchesQuery(alarm, 'hold')).toBe(true)
    expect(alarmMatchesQuery(alarm, 'run')).toBe(true)
  })

  it('hold comment 내용도 매칭한다', () => {
    const alarm = makeAlarm({ changeType: 'comment', newHoldComment: 'Pad life 초과 의심' })
    expect(alarmMatchesQuery(alarm, 'pad life')).toBe(true)
    expect(alarmMatchesQuery(alarm, '초과')).toBe(true)
  })

  it('어디에도 없는 검색어는 거른다', () => {
    expect(alarmMatchesQuery(makeAlarm(), 'zzz없는값')).toBe(false)
  })
})
