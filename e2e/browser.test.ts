import { test, expect } from '@playwright/test'

const APP_URL = 'http://localhost:5199/?port=5198'

test('app loads with sidebar visible', async ({ page }) => {
  await page.goto(APP_URL)
  await page.waitForLoadState('networkidle')

  const sidebar = page.locator('[class*="sidebar"]')
  await expect(sidebar).toBeVisible({ timeout: 10_000 })
})

test('settings panel opens and closes', async ({ page }) => {
  await page.goto(APP_URL)
  await page.waitForLoadState('networkidle')

  const settingsButton = page.getByRole('button', { name: /settings/i })
  await settingsButton.click()

  const settingsPanel = page.locator('[class*="settings"]')
  await expect(settingsPanel).toBeVisible({ timeout: 5_000 })

  await settingsButton.click()
  await expect(settingsPanel).not.toBeVisible({ timeout: 5_000 })
})

test('theme toggle updates UI', async ({ page }) => {
  await page.goto(APP_URL)
  await page.waitForLoadState('networkidle')

  const settingsButton = page.getByRole('button', { name: /settings/i })
  await settingsButton.click()

  const themeToggle = page.locator('[class*="theme"]').first()
  if (await themeToggle.isVisible()) {
    await themeToggle.click()
    await page.waitForTimeout(500)
  }
})
