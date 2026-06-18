import type { DumpMeta } from '../types/lot'

export type Freshness = 'fresh' | 'aging' | 'stale'

/**
 * dump 메타와 현재 시각(ms epoch)으로 신선도를 계산한다.
 *
 * - lastRunAt null → 'stale'
 * - elapsedMin <= freshMaxMinutes → 'fresh'
 * - elapsedMin <= staleMinMinutes → 'aging'
 * - else → 'stale'
 */
export function computeFreshness(
  lastRunAt: string | null,
  nowMs: number,
  dumpMeta: Pick<DumpMeta, 'freshMaxMinutes' | 'staleMinMinutes'>,
): Freshness {
  if (!lastRunAt) return 'stale'

  const runMs = new Date(lastRunAt).getTime()
  if (Number.isNaN(runMs)) return 'stale'

  const elapsedMin = (nowMs - runMs) / 60_000

  if (elapsedMin <= dumpMeta.freshMaxMinutes) return 'fresh'
  if (elapsedMin <= dumpMeta.staleMinMinutes) return 'aging'
  return 'stale'
}

/**
 * lastRunAt과 현재 시각(ms epoch)으로 경과 시간을 "MM:SS" 형식으로 반환한다.
 *
 * - lastRunAt null 또는 파싱 실패 → "—"
 * - 60분 이상 경과 → "60:00+" (클램프)
 */
export function formatElapsed(lastRunAt: string | null, nowMs: number): string {
  if (!lastRunAt) return '—'

  const runMs = new Date(lastRunAt).getTime()
  if (Number.isNaN(runMs)) return '—'

  const totalSeconds = Math.max(0, Math.floor((nowMs - runMs) / 1000))
  const clampSeconds = 60 * 60 // 3600초 = 60분

  if (totalSeconds >= clampSeconds) return '60:00+'

  const mm = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const ss = (totalSeconds % 60).toString().padStart(2, '0')
  return `${mm}:${ss}`
}
