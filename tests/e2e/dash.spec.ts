import { test, expect } from './fixtures'

test('create and delete a redirect via UI', async ({ authedPage: page, uniquePath }) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'redirect')
  await page.fill('#url', 'https://example.com')
  await page.click('#submit-btn')

  await expect(page.locator('tbody')).toContainText(uniquePath)

  page.on('dialog', (dialog) => dialog.accept())
  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await row.locator('.delete-btn').click()
  await expect(page.locator('tbody')).not.toContainText(uniquePath)
})

test('edit redirect URL via UI', async ({ api, authedPage: page, uniquePath }) => {
  await api.createRedirect(uniquePath, 'https://before.example.com')
  await page.goto('/dash.html')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await row.locator('.edit-btn').click()
  await page.fill('#url', 'https://after.example.com')
  await page.click('#submit-btn')

  await expect(page.locator('tbody')).toContainText('https://after.example.com')
})
