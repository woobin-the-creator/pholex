import { describe, it, expect } from 'vitest'
import { computeFreshness, formatElapsed } from '../utils/freshness'

const META = { freshMaxMinutes: 30, staleMinMinutes: 60 }

// 기준 시각: 2026-06-17T06:00:00Z
const BASE_NOW = new Date('2026-06-17T06:00:00Z').getTime()

function minsAgo(minutes: number): string {
  return new Date(BASE_NOW - minutes * 60_000).toISOString()
}

describe('computeFreshness', () => {
  it('lastRunAt null → stale', () => {
    expect(computeFreshness(null, BASE_NOW, META)).toBe('stale')
  })

  it('잘못된 날짜 문자열 → stale', () => {
    expect(computeFreshness('not-a-date', BASE_NOW, META)).toBe('stale')
  })

  it('0분 경과 → fresh', () => {
    expect(computeFreshness(minsAgo(0), BASE_NOW, META)).toBe('fresh')
  })

  it('29분 경과 → fresh', () => {
    expect(computeFreshness(minsAgo(29), BASE_NOW, META)).toBe('fresh')
  })

  it('정확히 30분 경과 → fresh (경계 포함)', () => {
    expect(computeFreshness(minsAgo(30), BASE_NOW, META)).toBe('fresh')
  })

  it('30분 1초 초과 → aging', () => {
    const lastRunAt = new Date(BASE_NOW - 30 * 60_000 - 1000).toISOString()
    expect(computeFreshness(lastRunAt, BASE_NOW, META)).toBe('aging')
  })

  it('45분 경과 → aging', () => {
    expect(computeFreshness(minsAgo(45), BASE_NOW, META)).toBe('aging')
  })

  it('정확히 60분 경과 → aging (경계 포함)', () => {
    expect(computeFreshness(minsAgo(60), BASE_NOW, META)).toBe('aging')
  })

  it('60분 1초 초과 → stale', () => {
    const lastRunAt = new Date(BASE_NOW - 60 * 60_000 - 1000).toISOString()
    expect(computeFreshness(lastRunAt, BASE_NOW, META)).toBe('stale')
  })

  it('90분 경과 → stale', () => {
    expect(computeFreshness(minsAgo(90), BASE_NOW, META)).toBe('stale')
  })
})

describe('formatElapsed', () => {
  it('lastRunAt null → "—"', () => {
    expect(formatElapsed(null, BASE_NOW)).toBe('—')
  })

  it('잘못된 날짜 문자열 → "—"', () => {
    expect(formatElapsed('bad-date', BASE_NOW)).toBe('—')
  })

  it('0초 경과 → "00:00"', () => {
    expect(formatElapsed(new Date(BASE_NOW).toISOString(), BASE_NOW)).toBe('00:00')
  })

  it('9분 24초 경과 → "09:24"', () => {
    const lastRunAt = new Date(BASE_NOW - (9 * 60 + 24) * 1000).toISOString()
    expect(formatElapsed(lastRunAt, BASE_NOW)).toBe('09:24')
  })

  it('59분 59초 경과 → "59:59"', () => {
    const lastRunAt = new Date(BASE_NOW - (59 * 60 + 59) * 1000).toISOString()
    expect(formatElapsed(lastRunAt, BASE_NOW)).toBe('59:59')
  })

  it('정확히 60분(3600초) 경과 → "60:00+"', () => {
    const lastRunAt = new Date(BASE_NOW - 3600 * 1000).toISOString()
    expect(formatElapsed(lastRunAt, BASE_NOW)).toBe('60:00+')
  })

  it('90분 경과 → "60:00+" (클램프)', () => {
    const lastRunAt = new Date(BASE_NOW - 90 * 60 * 1000).toISOString()
    expect(formatElapsed(lastRunAt, BASE_NOW)).toBe('60:00+')
  })
})
