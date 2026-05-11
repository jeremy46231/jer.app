import { test, expect } from './fixtures'

test('unauthenticated dashboard request redirects to login', async ({
  page,
}) => {
  await page.goto('/dash.html')
  expect(page.url()).toMatch(/login/)
})

test('authenticated request reaches dashboard', async ({
  authedPage: page,
}) => {
  await page.goto('/dash.html')
  await expect(page.locator('h1')).toContainText('dashboard')
})
