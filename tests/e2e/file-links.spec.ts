import { readFileSync } from 'fs'
import { test, expect } from './fixtures'

const E2E_FILE = {
  name: 'e2e.txt',
  mimeType: 'text/plain',
  buffer: readFileSync('tests/e2e/fixtures/e2e.txt'), // 3 bytes: "e2e"
}
const E2E_BYTES = Buffer.from('e2e')

// ── Create via UI ─────────────────────────────────────────────────────────────

test('create inline file via UI — content served over HTTP', async ({
  authedPage: page,
  uniquePath,
  request,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'file')
  await page.locator('#file').setInputFiles(E2E_FILE)
  // inline is checked by default
  await page.click('#submit-btn')

  await expect(page.locator('tbody')).toContainText(uniquePath)
  const resp = await request.get(`/${uniquePath}`)
  expect(resp.status()).toBe(200)
  expect(await resp.text()).toBe('e2e')
})

test('create catbox file via UI — content served over HTTP', async ({
  authedPage: page,
  uniquePath,
  request,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'file')
  await page.locator('#file').setInputFiles(E2E_FILE)
  await page.locator('input[name="locations"][value="catbox"]').check()
  await page.locator('input[name="locations"][value="inline"]').uncheck()
  await page.click('#submit-btn')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await expect(row).toContainText('attachment_file')
  await expect(row).toContainText('catbox')

  const resp = await request.get(`/${uniquePath}`)
  expect(resp.status()).toBe(200)
  expect(await resp.text()).toBe('e2e')
})

test('create litterbox file via UI — content served over HTTP', async ({
  authedPage: page,
  uniquePath,
  request,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'file')
  await page.locator('#file').setInputFiles(E2E_FILE)
  await page.locator('input[name="locations"][value="litterbox"]').check()
  await page.locator('input[name="locations"][value="inline"]').uncheck()
  await page.click('#submit-btn')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await expect(row).toContainText('attachment_file')
  await expect(row).toContainText('litterbox')

  const resp = await request.get(`/${uniquePath}`)
  expect(resp.status()).toBe(200)
  expect(await resp.text()).toBe('e2e')
})

test('create file with multiple locations shows all in table', async ({
  authedPage: page,
  uniquePath,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'file')
  await page.locator('#file').setInputFiles(E2E_FILE)
  await page.locator('input[name="locations"][value="catbox"]').check()
  // inline stays checked — both selected
  await page.click('#submit-btn')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await expect(row).toContainText('catbox')
})

// ── Modal controls ────────────────────────────────────────────────────────────

test('filename override is displayed in table', async ({
  authedPage: page,
  uniquePath,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'file')
  await page.locator('#file').setInputFiles(E2E_FILE)
  await page.fill('#filename', 'custom-name.bin')
  await page.click('#submit-btn')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await expect(row).toContainText('custom-name.bin')
})

test('content-type override is served in HTTP response', async ({
  authedPage: page,
  uniquePath,
  request,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'file')
  await page.locator('#file').setInputFiles(E2E_FILE)
  await page.fill('#content-type', 'application/octet-stream')
  await page.click('#submit-btn')

  const resp = await request.get(`/${uniquePath}`)
  expect(resp.headers()['content-type']).toContain('application/octet-stream')
})

test('force download sets attachment Content-Disposition', async ({
  authedPage: page,
  uniquePath,
  request,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'file')
  await page.locator('#file').setInputFiles(E2E_FILE)
  await page.check('#download')
  await page.click('#submit-btn')

  const resp = await request.get(`/${uniquePath}`)
  expect(resp.headers()['content-disposition']).toContain('attachment')
})

test('no location selected shows error and keeps dialog open', async ({
  authedPage: page,
  uniquePath,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'file')
  await page.locator('#file').setInputFiles(E2E_FILE)
  await page.locator('input[name="locations"][value="inline"]').uncheck()
  await page.click('#submit-btn')

  await expect(page.locator('.error-message')).toBeVisible()
  await expect(page.locator('#link-dialog')).toBeVisible()
})

// ── Provider management in edit mode ─────────────────────────────────────────

test('edit: add catbox to inline-only link — server auto-uploads', async ({
  api,
  authedPage: page,
  uniquePath,
}) => {
  await api.createInlineText(uniquePath, 'e2e', 'text/plain')
  await page.goto('/dash.html')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await row.locator('.edit-btn').click()

  // inline checkbox is checked+disabled for inline_file type
  await expect(
    page.locator('input[name="locations"][value="inline"]')
  ).toBeDisabled()
  await page.locator('input[name="locations"][value="catbox"]').check()
  await page.click('#submit-btn')

  await expect(
    page.locator('tr', { has: page.getByText(uniquePath) })
  ).toContainText('catbox')
})

test('edit: add litterbox to inline-only link — server auto-uploads', async ({
  api,
  authedPage: page,
  uniquePath,
}) => {
  await api.createInlineText(uniquePath, 'e2e', 'text/plain')
  await page.goto('/dash.html')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await row.locator('.edit-btn').click()
  await page.locator('input[name="locations"][value="litterbox"]').check()
  await page.click('#submit-btn')

  await expect(
    page.locator('tr', { has: page.getByText(uniquePath) })
  ).toContainText('litterbox')
})

test('edit: remove catbox provider — link still accessible via remaining provider', async ({
  api,
  authedPage: page,
  uniquePath,
  request,
}) => {
  await api.createFileLink(uniquePath, E2E_BYTES, 'text/plain', 'e2e.txt', [
    'catbox',
    'litterbox',
  ])
  await page.goto('/dash.html')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await row.locator('.edit-btn').click()
  await page.locator('input[name="locations"][value="catbox"]').uncheck()
  await page.click('#submit-btn')

  await expect(row).not.toContainText('catbox')
  await expect(row).toContainText('litterbox')

  const resp = await request.get(`/${uniquePath}`)
  expect(resp.status()).toBe(200)
})

test('edit: removing last provider shows error', async ({
  api,
  authedPage: page,
  uniquePath,
}) => {
  await api.createFileLink(uniquePath, E2E_BYTES, 'text/plain', 'e2e.txt', [
    'catbox',
  ])
  await page.goto('/dash.html')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await row.locator('.edit-btn').click()
  await page.locator('input[name="locations"][value="catbox"]').uncheck()
  await page.click('#submit-btn')

  await expect(page.locator('.error-message')).toBeVisible()
})
