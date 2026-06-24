import { test, expect } from '@playwright/test'

// 시연 전 미구현 목업 UI 영구 삭제(PR #55)에 대한 e2e 회귀 가드.
// 실제 앱을 VITE_DEMO_MODE로 띄워(데모 데이터) end-to-end로 검증한다.
test.describe('대시보드 — 목업 제거 후', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="dashboard-panel"]')
  })

  test('실제 동작 패널 2개만 렌더된다', async ({ page }) => {
    await expect(page.getByTestId('dashboard-panel')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: '내 lot hold' })).toBeVisible()
    await expect(page.getByRole('heading', { name: '키워드 Hold' })).toBeVisible()
  })

  test('삭제된 목업 UI가 화면에 없다', async ({ page }) => {
    for (const label of ['전체 홀드', '수율 계측', '인폼 lot hold', '간단 hold', '준비 중']) {
      await expect(page.getByText(label, { exact: false })).toHaveCount(0)
    }
    const topnav = page.getByRole('navigation', { name: 'Primary' })
    for (const tab of ['Lots', 'Equipment', 'Yield']) {
      await expect(topnav.getByRole('button', { name: tab })).toHaveCount(0)
    }
    const sidenav = page.getByRole('complementary', { name: 'Workspace navigation' })
    for (const item of ['Equipment', 'Yield analytics', 'Reports']) {
      await expect(sidenav.getByRole('button', { name: item })).toHaveCount(0)
    }
  })

  test('남겨둔 컨트롤과 lot 데이터는 정상', async ({ page }) => {
    // declutter(PR #60)로 Overview 탭·Dashboard 항목 등 죽은 장식은 제거됨 —
    // 살아있는 컨트롤만 확인한다.
    const topnav = page.getByRole('navigation', { name: 'Primary' })
    await expect(topnav.getByRole('button', { name: 'Toggle theme' })).toBeVisible()
    const sidenav = page.getByRole('complementary', { name: 'Workspace navigation' })
    await expect(sidenav.getByRole('button', { name: /알람 박스/ })).toBeVisible()
    await expect(sidenav.getByRole('button', { name: 'Sign out' })).toBeVisible()
    // demo source → 테이블 행이 실제로 렌더되는지(end-to-end 데이터 경로)
    await expect(page.locator('.lot-table__lot-id').first()).toBeVisible()
  })

  test('대시보드 로드 시 콘솔 에러가 없다', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto('/')
    await page.waitForSelector('[data-testid="dashboard-panel"]')
    await page.waitForTimeout(500)
    expect(errors).toEqual([])
  })
})
