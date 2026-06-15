export type AlarmSeverity = 'info' | 'warning' | 'critical'

export type AlarmChangeType = 'status' | 'hold' | 'comment' | 'created' | 'removed'

export interface AlarmItem {
  eventId: string
  lotId: string
  changeType: AlarmChangeType
  previousStatus: string | null
  newStatus: string | null
  newHoldComment: string | null
  occurredAt: string
  severity: AlarmSeverity
  read: boolean
}
