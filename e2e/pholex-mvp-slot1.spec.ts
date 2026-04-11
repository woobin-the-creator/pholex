import { expect, test } from '@playwright/test'

test.describe('Pholex MVP slot [1] smoke', () => {
  test('bootstraps auth, renders slot [1], refreshes, and logs out', async ({ page }) => {
    await page.goto('/')

    await expect(page).toHaveURL(/\/($|api\/auth\/sso\/init)/)

    const dashboard = page.getByTestId('dashboard-grid')
    await expect(dashboard).toBeVisible()

    await expect(page.getByTestId('table-slot-1')).toBeVisible()
    await expect(page.getByText('내 lot hold')).toBeVisible()

    const placeholders = page.locator('[data-testid^="table-slot-placeholder-"]')
    await expect(placeholders).toHaveCount(5)

    const slotRows = page.locator('[data-testid="table-slot-1"] tbody tr')
    await expect(slotRows).toHaveCount(3)

    const firstTimestamp = await page.getByTestId('table-slot-1-last-updated').textContent()
    await page.getByTestId('table-slot-1-refresh').click()
    await expect(page.getByTestId('table-slot-1-last-updated')).not.toHaveText(firstTimestamp ?? '')

    await page.getByTestId('logout-button').click()
    await expect(page).toHaveURL(/\/($|api\/auth\/sso\/init)/)
  })
})
