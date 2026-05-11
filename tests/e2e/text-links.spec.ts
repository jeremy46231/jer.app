import { test, expect } from './fixtures'

test('create text link via UI and serve content over HTTP', async ({
  authedPage: page,
  uniquePath,
  request,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'text')
  await page.fill('#text', 'hello from e2e')
  await page.click('#submit-btn')

  await expect(page.locator('tbody')).toContainText(uniquePath)
  const resp = await request.get(`/${uniquePath}`)
  expect(resp.status()).toBe(200)
  expect(await resp.text()).toBe('hello from e2e')
})

test('text link with custom content-type returns correct header', async ({
  authedPage: page,
  uniquePath,
  request,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'text')
  await page.fill('#text', '{"ok":true}')
  await page.fill('#content-type', 'application/json')
  await page.click('#submit-btn')

  const resp = await request.get(`/${uniquePath}`)
  expect(resp.headers()['content-type']).toContain('application/json')
})

test('text link with custom filename shows in table', async ({
  authedPage: page,
  uniquePath,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'text')
  await page.fill('#text', 'content')
  await page.fill('#filename', 'custom.txt')
  await page.click('#submit-btn')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await expect(row).toContainText('custom.txt')
})

test('text link force download sets attachment disposition', async ({
  authedPage: page,
  uniquePath,
  request,
}) => {
  await page.goto('/dash.html')
  await page.click('#open-dialog-btn')
  await page.fill('#path', uniquePath)
  await page.selectOption('#type', 'text')
  await page.fill('#text', 'download me')
  await page.check('#download')
  await page.click('#submit-btn')

  const resp = await request.get(`/${uniquePath}`)
  expect(resp.headers()['content-disposition']).toContain('attachment')
})

test('API-created text link appears in table with correct type', async ({
  api,
  authedPage: page,
  uniquePath,
}) => {
  await api.createInlineText(
    uniquePath,
    'test content',
    'text/plain',
    'myfile.txt'
  )
  await page.goto('/dash.html')
  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await expect(row.locator('code').first()).toContainText('inline_file')
  await expect(row).toContainText('myfile.txt')
  await expect(row).toContainText('text/plain')
})

test('edit mode: switching to text type auto-fetches current content', async ({
  api,
  authedPage: page,
  uniquePath,
}) => {
  await api.createInlineText(uniquePath, 'original content', 'text/plain')
  await page.goto('/dash.html')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await row.locator('.edit-btn').click()

  // Dialog opens in 'file' mode — switching to 'text' triggers auto-fetch
  await page.selectOption('#type', 'text')
  await expect(page.locator('#text')).not.toBeDisabled()
  await expect(page.locator('#text')).toHaveValue('original content')
})

test('edit text link: updating content is served on next request', async ({
  api,
  authedPage: page,
  uniquePath,
  request,
}) => {
  await api.createInlineText(uniquePath, 'old content', 'text/plain')
  await page.goto('/dash.html')

  const row = page.locator('tr', { has: page.getByText(uniquePath) })
  await row.locator('.edit-btn').click()
  await page.selectOption('#type', 'text')
  await expect(page.locator('#text')).toHaveValue('old content')
  await page.fill('#text', 'new content')
  await page.click('#submit-btn')
  await expect(page.locator('#link-dialog')).not.toBeVisible()

  const resp = await request.get(`/${uniquePath}`)
  expect(await resp.text()).toBe('new content')
})
