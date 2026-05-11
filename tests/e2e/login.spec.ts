import { ADMIN_PASSWORD, test, expect } from './fixtures'

test('wrong password shows error message', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#password', 'definitely-wrong-password')
  await page.click('button[type="submit"]')
  await expect(page.locator('#err')).toBeVisible()
  await expect(page.locator('#err')).toContainText('Wrong password')
})

test('correct password logs in and reaches dashboard', async ({ page }) => {
  await page.goto('/login')
  await page.fill('#password', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL(/dash/)
  await expect(page.locator('h1')).toContainText('dashboard')
})
