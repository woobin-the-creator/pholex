import { test, expect } from '@playwright/test'

// 알람 토스트가 "여러 개 동시에 떠도 버벅임 없이" 렌더되는지 검증한다.
// 버벅임의 근본 원인은 backdrop-filter:blur 재합성이었으므로, 핵심 가드는
// (1) 알람 표면에 blur가 회귀하지 않았음(computed style), (2) 다발 토스트가 정상 렌더,
// (3) 다발 렌더 동안 과도한 long task(메인스레드 블로킹)가 없음.
// 토스트 트리거는 DEMO_MODE에서 노출되는 window.__demoAlarm 사용(WS 소스 없음).

type Severity = 'critical' | 'warning' | 'info'
const mkAlarm = (i: number, severity: Severity, prefix = 'alarm') => ({
  eventId: `${prefix}-${i}`,
  lotId: `LOT-P${1000 + i}-0${i % 9}`,
  changeType: i % 2 ? 'comment' : 'status',
  previousStatus: 'Run',
  newStatus: 'Hold',
  newHoldComment: i % 2 ? 'OES 신호 이상, eng review' : null,
  occurredAt: '2026-06-26T09:00:00+09:00',
  severity,
  read: false,
})

test.describe('알람 토스트 다발 — blur 회귀 가드 + 렌더 + long task', () => {
  test('여러 토스트 동시: blur 없음 + 정상 렌더 + 과도한 long task 없음', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text())
    })

    // longtask 수집기를 첫 페인트 전에 등록
    await page.addInitScript(() => {
      ;(window as unknown as { __longtasks: number[] }).__longtasks = []
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) {
            ;(window as unknown as { __longtasks: number[] }).__longtasks.push(e.duration)
          }
        }).observe({ entryTypes: ['longtask'] })
      } catch {
        // longtask API 미지원 환경은 무시(가드는 blur/렌더로 충분)
      }
    })

    // 박스에 14건 시드 — 박스/항목 표면도 blur 가드 대상에 포함시키려면 DOM에 있어야 함
    await page.addInitScript((seed) => {
      window.localStorage.setItem('pholex.alarms', JSON.stringify(seed))
    }, Array.from({ length: 14 }, (_, i) => mkAlarm(i, (['critical', 'warning', 'info'] as const)[i % 3], 'seed')))

    await page.goto('/')
    await page.waitForSelector('[data-testid="dashboard-panel"]')

    // 알람 박스를 열어 박스/항목을 렌더(박스가 열린 상태 + 토스트 다발 = 최대 부하)
    await page.getByRole('button', { name: /알람 박스/ }).click()
    await page.getByRole('dialog', { name: '알람 박스' }).waitFor()

    // 토스트 8개를 빠르게 다발로 트리거 (critical/warning 섞음)
    const items = Array.from({ length: 8 }, (_, i) => mkAlarm(i, i % 2 ? 'critical' : 'warning', 'pop'))
    await page.evaluate((batch) => {
      const fire = (window as unknown as { __demoAlarm?: (x: unknown) => void }).__demoAlarm
      if (!fire) throw new Error('__demoAlarm 미노출 — DEMO_MODE 빌드인지 확인')
      for (const it of batch) fire(it)
    }, items)

    // (2) 토스트가 실제로 렌더됨 (sonner visibleToasts 한도 내 ≥1)
    await page.locator('.alarm-pop').first().waitFor({ timeout: 5000 })
    const popCount = await page.locator('.alarm-pop').count()
    expect(popCount).toBeGreaterThan(0)

    // (1) 핵심 가드: 알람 표면에 backdrop-filter blur가 없어야 한다
    const blurReport = await page.evaluate(() => {
      const sels = ['.alarm-pop', '.alarm-dock', '.alarm-item']
      const out: Record<string, string> = {}
      for (const s of sels) {
        const el = document.querySelector(s)
        if (!el) {
          out[s] = '(not in DOM)'
          continue
        }
        const cs = getComputedStyle(el)
        out[s] =
          cs.backdropFilter ||
          (cs as unknown as { webkitBackdropFilter?: string }).webkitBackdropFilter ||
          'none'
      }
      return out
    })
    for (const [sel, val] of Object.entries(blurReport)) {
      if (val === '(not in DOM)') continue
      expect(val, `${sel} 의 backdrop-filter 가 none 이어야 함(blur 회귀)`).toBe('none')
    }

    // (3) 다발 렌더 동안 long task 측정
    await page.waitForTimeout(800)
    const longtasks = await page.evaluate(
      () => (window as unknown as { __longtasks: number[] }).__longtasks,
    )
    const totalMs = longtasks.reduce((a, b) => a + b, 0)
    const maxMs = longtasks.length ? Math.max(...longtasks) : 0
    console.log(
      `[perf] long tasks count=${longtasks.length} total=${totalMs.toFixed(1)}ms max=${maxMs.toFixed(1)}ms ` +
        `toasts=${popCount} blur=${JSON.stringify(blurReport)}`,
    )
    // 단일 long task가 과도하면 합성 폭주(블러 등)의 신호. 보수적 임계 250ms.
    expect(maxMs, '최대 long task 가 과도하지 않아야 함').toBeLessThan(250)

    // 렌더 중 콘솔 에러 없음
    expect(consoleErrors, consoleErrors.join('\n')).toHaveLength(0)
  })
})
