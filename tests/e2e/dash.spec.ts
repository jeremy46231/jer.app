import { ADMIN_PASSWORD, test, expect } from './fixtures'

// ── Existing tests ────────────────────────────────────────────────────────────

test('create and delete a redirect via UI', async ({
  authedPage: page,
  uniquePath,
}) => {
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

test('edit redirect URL via UI', async ({
  api,
  authedPage: page,
  uniquePath,
}) => {
  await api.createRedirect(uniquePath, 'https://before.example.com')
  await page.goto('/dash.html')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await row.locator('.edit-btn').click()
  await page.fill('#url', 'https://after.example.com')
  await page.click('#submit-btn')

  await expect(page.locator('tbody')).toContainText('https://after.example.com')
})

// ── Dialog behavior ───────────────────────────────────────────────────────────

test('X button closes the dialog', async ({ authedPage: page }) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await expect(page.locator('#link-dialog')).toBeVisible()
  await page.click('#close-dialog-btn')
  await expect(page.locator('#link-dialog')).not.toBeVisible()
})

test('Cancel button closes the dialog', async ({ authedPage: page }) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.click('#cancel-btn')
  await expect(page.locator('#link-dialog')).not.toBeVisible()
})

test('Escape key closes the dialog', async ({ authedPage: page }) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.keyboard.press('Escape')
  await expect(page.locator('#link-dialog')).not.toBeVisible()
})

test('create mode shows correct title and button text', async ({
  authedPage: page,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await expect(page.locator('#dialog-title')).toHaveText('Add New Link')
  await expect(page.locator('#submit-btn')).toHaveText('Create Link')
})

test('edit mode shows correct title and button text', async ({
  api,
  authedPage: page,
  uniquePath,
}) => {
  await api.createRedirect(uniquePath, 'https://example.com')
  await page.goto('/dash.html')
  await page
    .locator('tr', { has: page.getByText(uniquePath) })
    .locator('.edit-btn')
    .click()
  await expect(page.locator('#dialog-title')).toHaveText('Edit Link')
  await expect(page.locator('#submit-btn')).toHaveText('Save Changes')
})

// ── Redirect creation details ─────────────────────────────────────────────────

test('creates 301 redirect via UI — HTTP confirms 301', async ({
  authedPage: page,
  uniquePath,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'redirect')
  await page.fill('#url', 'https://example.com')
  await page.selectOption('#redirect-status', '301')
  await page.click('#submit-btn')

  const resp = await page.request.get(`/${uniquePath}`, { maxRedirects: 0 })
  expect(resp.status()).toBe(301)
})

test('relative URL hides status code field; absolute URL shows it', async ({
  authedPage: page,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.selectOption('#type', 'redirect')

  // Absolute URL → status visible
  await page.fill('#url', 'https://example.com')
  const statusGroup = page.locator('.form-group', {
    has: page.locator('#redirect-status'),
  })
  await expect(statusGroup).toBeVisible()

  // Relative URL → status hidden
  await page.fill('#url', '/internal/path')
  await expect(statusGroup).not.toBeVisible()
})

// ── Table display ─────────────────────────────────────────────────────────────

test('redirect row shows type=redirect and target URL', async ({
  api,
  authedPage: page,
  uniquePath,
}) => {
  await api.createRedirect(uniquePath, 'https://target.example.com')
  await page.goto('/dash.html')
  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await expect(row.locator('code')).toContainText('redirect')
  await expect(row).toContainText('https://target.example.com')
})

test('inline_file row shows filename and content-type', async ({
  api,
  authedPage: page,
  uniquePath,
}) => {
  await api.createInlineText(uniquePath, 'hello', 'text/plain', 'hello.txt')
  await page.goto('/dash.html')
  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await expect(row.locator('code').first()).toContainText('inline_file')
  await expect(row).toContainText('hello.txt')
  await expect(row).toContainText('text/plain')
})

// ── Edit: path rename ─────────────────────────────────────────────────────────

test('rename redirect path: old path 404s, new path redirects', async ({
  api,
  authedPage: page,
}) => {
  const oldPath = `e2e-${Date.now()}-old`
  const newPath = `e2e-${Date.now()}-new`
  await api.createRedirect(oldPath, 'https://example.com')
  await page.goto('/dash.html')

  const row = page.locator('tr', { has: page.getByText(oldPath) })
  await row.locator('.edit-btn').click()
  await page.fill('#path', newPath)
  await page.click('#submit-btn')

  const old = await page.request.get(`/${oldPath}`, { maxRedirects: 0 })
  expect(old.status()).toBe(404)
  const next = await page.request.get(`/${newPath}`, { maxRedirects: 0 })
  expect(next.status()).toBe(302)

  await api.deleteLink(newPath).catch(() => {})
  await api.deleteLink(oldPath).catch(() => {})
})

// ── Delete: cancellation ──────────────────────────────────────────────────────

test('dismissing delete confirm dialog leaves link in table', async ({
  api,
  authedPage: page,
  uniquePath,
}) => {
  await api.createRedirect(uniquePath, 'https://example.com')
  await page.goto('/dash.html')

  page.on('dialog', (dialog) => dialog.dismiss())
  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await row.locator('.delete-btn').click()
  await expect(page.locator('tbody')).toContainText(uniquePath)
})
