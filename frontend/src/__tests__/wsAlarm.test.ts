import { describe, expect, it } from 'vitest'
import { parseAlarmMessage } from '../services/ws'

describe('parseAlarmMessage', () => {
  it('parses a change message into an unread info alarm', () => {
    const alarm = parseAlarmMessage({
      type: 'change',
      payload: {
        lotId: 'LOT-B1175',
        changeType: 'comment',
        previousStatus: null,
        newStatus: null,
        newHoldComment: 'updated',
        occurredAt: '2026-06-13T05:18:00+09:00',
        eventId: 'evt-9',
      },
    })

    expect(alarm).not.toBeNull()
    expect(alarm).toMatchObject({
      eventId: 'evt-9',
      lotId: 'LOT-B1175',
      changeType: 'comment',
      newHoldComment: 'updated',
      occurredAt: '2026-06-13T05:18:00+09:00',
      severity: 'info',
      read: false,
    })
  })

  it('parses an alert message preserving its severity', () => {
    const alarm = parseAlarmMessage({
      type: 'alert',
      payload: {
        lotId: 'LOT-A2948',
        severity: 'critical',
        changeType: 'status',
        previousStatus: 'Run',
        newStatus: 'Hold',
        eventId: 'evt-1',
        occurredAt: '2026-06-13T05:21:00+09:00',
        message: 'LOT-A2948: Run → Hold',
      },
    })

    expect(alarm).toMatchObject({
      eventId: 'evt-1',
      lotId: 'LOT-A2948',
      severity: 'critical',
      newStatus: 'Hold',
    })
  })

  it('returns null for non-alarm or malformed messages', () => {
    expect(parseAlarmMessage({ type: 'table_update', payload: { rows: [] } })).toBeNull()
    expect(parseAlarmMessage({ type: 'change' })).toBeNull()
    expect(parseAlarmMessage(null)).toBeNull()
    expect(parseAlarmMessage('nope')).toBeNull()
  })
})
