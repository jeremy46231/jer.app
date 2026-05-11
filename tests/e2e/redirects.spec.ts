import { test, expect } from './fixtures'

test('302 redirect returns correct status and Location', async ({ api, request, uniquePath }) => {
  await api.createRedirect(uniquePath, 'https://example.com', 302)
  const resp = await request.get(`/${uniquePath}`, { maxRedirects: 0 })
  expect(resp.status()).toBe(302)
  expect(resp.headers()['location']).toContain('example.com')
})

test('301 redirect returns permanent status', async ({ api, request, uniquePath }) => {
  await api.createRedirect(uniquePath, 'https://example.com', 301)
  const resp = await request.get(`/${uniquePath}`, { maxRedirects: 0 })
  expect(resp.status()).toBe(301)
})

test('unknown path returns 404', async ({ request }) => {
  const resp = await request.get('/no-such-path-e2e-99999')
  expect(resp.status()).toBe(404)
})
