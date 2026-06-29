import { test, expect } from '@playwright/test'

// 알람 클릭 → 행 점프 하이라이트의 "이중 경로" 회귀 가드.
//  - PRIMARY (기본 / GPU 있음): 코멧 SVG(.lot-trace-svg)가 보인다.
//  - FALLBACK (prefers-reduced-motion: reduce / 사내 GPU 없는 VM): 코멧 SVG는 숨고,
//    td::after Rounded Ring(box-shadow)이 그려진다.
// LOT-A2948은 데모 테이블(useMyHoldTable)에 실재하는 행이라, 이 lot 알람을 클릭하면 점프+하이라이트가 발동한다.
const ALARM = [
  {
    eventId: 'evt-focus',
    lotId: 'LOT-A2948',
    changeType: 'status',
    previousStatus: 'Run',
    newStatus: 'Hold',
    newHoldComment: null,
    occurredAt: '2026-06-13T05:40:00+09:00',
    severity: 'critical',
    read: true,
  },
]

async function seedAndJump(page: import('@playwright/test').Page) {
  await page.addInitScript((alarms) => {
    window.localStorage.setItem('pholex.alarms', JSON.stringify(alarms))
  }, ALARM)
  await page.goto('/')
  await page.waitForSelector('[data-testid="dashboard-panel"]')
  await page.getByRole('button', { name: /알람 박스/ }).click()
  await page.getByRole('dialog', { name: '알람 박스' }).waitFor()
  await page.locator('.alarm-item').first().click()
  // 클릭 → focusLot → is-focused. 하이라이트는 3초간 유지된다.
  await expect(page.locator('.lot-table tbody tr.is-focused')).toBeVisible()
}

test.describe('알람 클릭 → 행 점프 하이라이트 이중 경로', () => {
  test('PRIMARY: 기본 환경에선 코멧 SVG가 보인다', async ({ page }) => {
    await seedAndJump(page)
    await expect(page.locator('.lot-trace-svg')).toBeVisible()
    await expect(page.locator('.lot-trace-comet--head')).toHaveCount(1)
  })

  test('FALLBACK: reduce-motion에선 코멧이 숨고 Rounded Ring(box-shadow)이 그려진다', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await seedAndJump(page)

    // 코멧 SVG는 display:none으로 숨겨진다(요소는 DOM에 남아있어도 렌더되지 않음).
    await expect(page.locator('.lot-trace-svg')).toBeHidden()

    // td::after Rounded Ring이 box-shadow로 그려진다.
    const ringShadow = await page
      .locator('.lot-table tbody tr.is-focused td')
      .first()
      .evaluate((el) => getComputedStyle(el, '::after').boxShadow)
    expect(ringShadow).not.toBe('none')
    expect(ringShadow).toContain('inset')
  })
})
