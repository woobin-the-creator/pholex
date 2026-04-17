import { expect, test } from '@playwright/test'

test.describe('Pholex MVP slot [1] smoke', () => {
  test('bootstraps auth, renders slot [1], refreshes, and logs out', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()

    const dashboard = page.locator('main.dashboard-grid')
    await expect(dashboard).toBeVisible()

    const slot = page.getByRole('region', { name: '내 lot hold' })
    await expect(slot).toBeVisible()
    await expect(page.getByText('내 lot hold')).toBeVisible()

    const placeholders = page.locator('.dashboard-placeholder')
    await expect(placeholders).toHaveCount(5)

    const slotRows = slot.locator('tbody tr')
    await expect(slotRows).toHaveCount(3)

    const lastUpdated = slot.locator('.table-slot__meta')
    const firstTimestamp = await lastUpdated.textContent()
    await slot.getByRole('button', { name: '새로고침' }).click()
    await expect(lastUpdated).not.toHaveText(firstTimestamp ?? '')

    const logoutResponse = page.waitForResponse((response) =>
      response.url().includes('/api/auth/logout') && response.status() === 200
    )
    const ssoInitResponse = page.waitForResponse((response) =>
      response.url().includes('/api/auth/sso/init') && response.status() === 302
    )

    await page.getByRole('button', { name: '로그아웃' }).click()
    await logoutResponse
    await ssoInitResponse
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: '대시보드' })).toBeVisible()
  })
})
