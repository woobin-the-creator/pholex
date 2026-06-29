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

  // 회귀 가드(코멧 행-가림 버그): 코멧이 lot-id 셀에서만 돌지 않고 행 전체를 감싸야 한다.
  //  코멧 SVG(첫 td 자식, position:absolute)는 행(tr) 기준으로 행 전체 너비에 그려지고
  //  z-index:3으로 모든 td 위에 떠야 한다. 만약 .is-focused td에 position:relative가 끼면
  //  SVG 기준이 첫 셀로 바뀌고 형제 td들이 코멧 오른쪽을 덮어 "lot-id 셀에서만 도는" 버그가 된다.
  //  → 코멧 경로(reduce 아님)에선 모든 td가 static이어야 하고, SVG 폭 == 행 폭이어야 한다.
  test('PRIMARY: 코멧이 행 전체를 감싼다 (lot-id 셀 가림 회귀 방지)', async ({ page }) => {
    await seedAndJump(page)
    const probe = await page
      .locator('.lot-table tbody tr.is-focused')
      .evaluate((row) => {
        const svg = row.querySelector('.lot-trace-svg') as SVGElement
        const tds = [...row.children] as HTMLElement[]
        return {
          tdPositions: tds.map((td) => getComputedStyle(td).position),
          parentTdStatic: getComputedStyle(svg.parentElement as HTMLElement).position === 'static',
          rowW: Math.round(row.getBoundingClientRect().width),
          svgW: Math.round(svg.getBoundingClientRect().width),
        }
      })
    // 모든 td가 static (position:relative가 끼면 형제 td가 코멧을 덮음)
    expect(probe.tdPositions.every((p) => p === 'static')).toBe(true)
    expect(probe.parentTdStatic).toBe(true)
    // SVG가 행 전체 너비로 그려진다 (첫 셀 폭으로 잘리지 않음)
    expect(probe.svgW).toBe(probe.rowW)
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
