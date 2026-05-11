import { test as base, expect } from '@playwright/test'
import { readFileSync } from 'fs'

function readDevVars(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync('.dev.vars', 'utf-8')
        .split('\n')
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => {
          const [k, ...v] = l.split('=')
          return [k.trim(), v.join('=').trim()]
        })
    )
  } catch {
    return {}
  }
}

export const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ?? readDevVars()['ADMIN_PASSWORD'] ?? ''

type Fixtures = {
  authedPage: import('@playwright/test').Page
  api: {
    createRedirect(path: string, url: string, status?: number): Promise<void>
    createInlineText(
      path: string,
      content: string,
      contentType?: string,
      filename?: string
    ): Promise<void>
    createFileLink(
      path: string,
      fileBytes: Buffer,
      contentType: string,
      filename: string,
      locations: string[]
    ): Promise<void>
    deleteLink(path: string): Promise<void>
  }
  /** Unique per-test path with auto-cleanup on teardown (pass or fail). */
  uniquePath: string
}

export const test = base.extend<Fixtures>({
  authedPage: async ({ page, context }, use) => {
    await context.addCookies([
      {
        name: 'session',
        value: ADMIN_PASSWORD,
        domain: 'localhost',
        path: '/',
      },
    ])
    await use(page)
  },

  api: async ({ request }, use) => {
    const headers = { Cookie: `session=${ADMIN_PASSWORD}` }
    await use({
      async createRedirect(path, url, status = 302) {
        const r = await request.post('/api/links', {
          data: { type: 'redirect', path, url, status },
          headers,
        })
        if (!r.ok())
          throw new Error(`createRedirect ${path}: ${await r.text()}`)
      },

      async createInlineText(
        path,
        content,
        contentType = 'text/plain',
        filename
      ) {
        const bytes = Buffer.from(content)
        const params = new URLSearchParams({
          path,
          'content-type': contentType,
          'filename': filename ?? `${path}.txt`,
          'locations': 'inline',
        })
        const r = await request.post(`/api/links/upload?${params}`, {
          data: bytes,
          headers: {
            ...headers,
            'Content-Length': String(bytes.length),
          },
        })
        if (!r.ok())
          throw new Error(`createInlineText ${path}: ${await r.text()}`)
      },

      async createFileLink(path, fileBytes, contentType, filename, locations) {
        const params = new URLSearchParams({
          path,
          'content-type': contentType,
          filename,
        })
        for (const loc of locations) params.append('locations', loc)
        const r = await request.post(`/api/links/upload?${params}`, {
          data: fileBytes,
          headers: {
            ...headers,
            'Content-Length': String(fileBytes.length),
          },
        })
        if (!r.ok())
          throw new Error(`createFileLink ${path}: ${await r.text()}`)
      },

      async deleteLink(path) {
        await request.delete(`/api/links?path=${encodeURIComponent(path)}`, {
          headers,
        })
      },
    })
  },

  uniquePath: [
    async ({ api }, use) => {
      const path = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      await use(path)
      await api.deleteLink(path).catch(() => {})
    },
    { auto: false },
  ],
})

export { expect }
