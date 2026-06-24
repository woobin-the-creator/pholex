import { test, expect } from '@playwright/test'

// VITE_DEMO_MODE e2e엔 WebSocket 알람 소스가 없다. 알람은 localStorage('pholex.alarms')에
// 영속되므로(atomWithStorage), 14건을 미리 시드해 검색·스크롤·힌트를 실제 앱에서 검증한다.
const ALARMS = Array.from({ length: 14 }, (_, i) => ({
  eventId: `evt-${i}`,
  lotId: `LOT-${String.fromCharCode(65 + i)}${1000 + i * 111}-0${i % 9}`,
  changeType: i % 2 ? 'comment' : 'status',
  previousStatus: 'Run',
  newStatus: 'Hold',
  newHoldComment: i % 2 ? 'OES 신호 이상, eng review' : null,
  occurredAt: `2026-06-13T05:${String(40 - i).padStart(2, '0')}:00+09:00`,
  severity: i % 3 === 0 ? 'critical' : i % 3 === 1 ? 'warning' : 'info',
  read: true,
}))

test.describe('알람 박스 — 검색·스크롤·스크롤 힌트', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((alarms) => {
      window.localStorage.setItem('pholex.alarms', JSON.stringify(alarms))
    }, ALARMS)
    await page.goto('/')
    await page.waitForSelector('[data-testid="dashboard-panel"]')
    await page.getByRole('button', { name: /알람 박스/ }).click()
    await page.getByRole('dialog', { name: '알람 박스' }).waitFor()
  })

  test('시드된 알람 14건이 리스트로 표시된다', async ({ page }) => {
    await expect(page.locator('.alarm-item')).toHaveCount(14)
  })

  test('검색이 알람을 필터링하고, 0건이면 전용 문구를 보여준다', async ({ page }) => {
    const dock = page.getByRole('dialog', { name: '알람 박스' })
    const search = dock.getByRole('searchbox', { name: '알람 검색' })

    // lot ID 부분 일치 → 1건으로 좁혀짐
    await search.fill('LOT-A1000')
    await expect(dock.locator('.alarm-item')).toHaveCount(1)
    await expect(dock.getByText('LOT-A1000-00')).toBeVisible()

    // 내용(describeAlarm) 매칭 — comment 알람의 'OES'
    await search.fill('OES')
    await expect(dock.locator('.alarm-item').first()).toBeVisible()
    const oesCount = await dock.locator('.alarm-item').count()
    expect(oesCount).toBeGreaterThan(0)

    // 어디에도 없는 검색어 → 전용 empty 문구
    await search.fill('존재하지않는값zzz')
    await expect(dock.locator('.alarm-item')).toHaveCount(0)
    await expect(dock.getByText('검색 결과가 없습니다.')).toBeVisible()
  })

  test('헤더와 검색창이 스크롤 중에도 고정된다', async ({ page }) => {
    const dock = page.getByRole('dialog', { name: '알람 박스' })
    await dock.locator('.alarm-dock__list').evaluate((el) => {
      el.scrollTop = 200
    })
    await expect(dock.getByRole('heading', { name: '알람 박스' })).toBeVisible()
    await expect(dock.getByRole('searchbox', { name: '알람 검색' })).toBeVisible()
  })

  test('스크롤 힌트가 위치에 따라 조건부로 표시되고, 클릭하면 스크롤한다', async ({ page }) => {
    const dock = page.getByRole('dialog', { name: '알람 박스' })
    const list = dock.locator('.alarm-dock__list')

    // 맨 위 → 아래 화살표만
    await list.evaluate((el) => {
      el.scrollTop = 0
    })
    await expect(dock.locator('.alarm-dock__scrollhint--down')).toBeVisible()
    await expect(dock.locator('.alarm-dock__scrollhint--up')).toHaveCount(0)

    // 아래 화살표 클릭 → 스크롤 내려가 위 화살표 등장
    await dock.locator('.alarm-dock__scrollhint--down').click()
    await expect(dock.locator('.alarm-dock__scrollhint--up')).toBeVisible()
  })
})
