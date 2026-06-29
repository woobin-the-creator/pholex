import { useAtomValue, useSetAtom } from 'jotai'
import { useCallback } from 'react'
import { toast } from 'sonner'
import {
  alarmsAtom,
  clearAlarmsAtom,
  markAllReadAtom,
  pushAlarmAtom,
  removeAlarmAtom,
  unreadCountAtom,
} from '../atoms/alarmAtoms'
import { CriticalToast } from '../components/alarms/CriticalToast'
import type { AlarmItem } from '../types/alarm'

const POP_DURATION_MS = 10_000

/**
 * 알람 적립 + critical 순간 팝을 묶는 훅.
 * - info 변경: 팝 없이 dock으로 직행
 * - warning/critical: ~10초 팝(sonner) + dock 적립. 팝 "이동"은 onFocusLot 호출
 * eventId 중복(재연결 재전송)은 적립·팝 모두 건너뛴다.
 */
export function useAlarms(onFocusLot: (lotId: string) => void) {
  const alarms = useAtomValue(alarmsAtom)
  const unread = useAtomValue(unreadCountAtom)
  const push = useSetAtom(pushAlarmAtom)
  const markAllRead = useSetAtom(markAllReadAtom)
  const clearAlarms = useSetAtom(clearAlarmsAtom)
  const removeAlarm = useSetAtom(removeAlarmAtom)

  const handleAlarm = useCallback(
    (item: AlarmItem) => {
      const added = push(item)
      if (!added || item.severity === 'info') {
        return
      }
      toast.custom(
        (id) => (
          <CriticalToast
            item={item}
            onJump={() => {
              onFocusLot(item.lotId)
              toast.dismiss(id)
            }}
            onDismiss={() => toast.dismiss(id)}
          />
        ),
        { duration: POP_DURATION_MS },
      )
    },
    [push, onFocusLot],
  )

  return { alarms, unread, handleAlarm, markAllRead, clearAlarms, removeAlarm }
}
