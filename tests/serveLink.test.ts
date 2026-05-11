import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createLink } from '../src/db'
import { serveLink } from '../src/serveLink'
import { createTestEnv, type TestEnv } from './helpers/env'

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})

afterEach(() => {
  env.__close()
})

function get(path: string): Request {
  return new Request(new URL(path, 'https://jer.app').toString())
}

describe('serveLink', () => {
  test('returns undefined when no link matches', async () => {
    const res = await serveLink(get('/missing'), env)
    expect(res).toBeUndefined()
  })

  test('redirect link returns a 302 to the target URL', async () => {
    await createLink(env.DB, {
      path: 'g',
      type: 'redirect',
      url: 'https://example.com/destination',
    })

    const res = await serveLink(get('/g'), env)
    expect(res).toBeDefined()
    expect(res!.status).toBe(302)
    expect(res!.headers.get('Location')).toBe('https://example.com/destination')
  })

  test('inline file link serves bytes with the right headers', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5])
    await createLink(env.DB, {
      path: 'pic',
      type: 'inline_file',
      contentType: 'image/png',
      filename: 'cat.png',
      download: false,
      file: data,
    })

    const res = await serveLink(get('/pic'), env)
    expect(res).toBeDefined()
    expect(res!.status).toBe(200)
    expect(res!.headers.get('Content-Type')).toBe('image/png')
    expect(res!.headers.get('Content-Disposition')).toBe(
      'inline; filename="cat.png"'
    )
    const body = new Uint8Array(await res!.arrayBuffer())
    expect(Array.from(body)).toEqual([1, 2, 3, 4, 5])
  })

  test('inline file with download=true uses attachment disposition', async () => {
    await createLink(env.DB, {
      path: 'doc',
      type: 'inline_file',
      contentType: 'application/pdf',
      filename: 'doc.pdf',
      download: true,
      file: new Uint8Array([0]),
    })

    const res = await serveLink(get('/doc'), env)
    expect(res!.headers.get('Content-Disposition')).toBe(
      'attachment; filename="doc.pdf"'
    )
  })

  test('decodes percent-encoded paths', async () => {
    await createLink(env.DB, {
      path: 'hello world',
      type: 'redirect',
      url: 'https://example.com/',
    })

    const res = await serveLink(get('/hello%20world'), env)
    expect(res!.status).toBe(302)
    expect(res!.headers.get('Location')).toBe('https://example.com/')
  })

  // See db.test.ts for the underlying SQL bug. With it in place,
  // `getLinkWithContent` throws inside `serveLink` for an attachment_file row
  // that has no provider rows, so we never even reach the 502 fallthrough.
  test.todo(
    'attachment_file with no providers returns 502 — depends on SQL fix',
    async () => {
      await createLink(env.DB, {
        path: 'file',
        type: 'attachment_file',
        contentType: 'application/octet-stream',
        filename: 'a.bin',
        download: false,
        providerUrls: {},
      })

      const res = await serveLink(get('/file'), env)
      expect(res!.status).toBe(502)
    }
  )

  test('attachment_file falls through to 502 when no provider can serve it', async () => {
    // Insert a provider row for an unknown id so getLinkWithContent doesn't
    // hit the json_group_object empty-set bug, but still no real provider can
    // satisfy the request.
    await createLink(env.DB, {
      path: 'file',
      type: 'attachment_file',
      contentType: 'application/octet-stream',
      filename: 'a.bin',
      download: false,
      providerUrls: {},
    })
    await env.DB.prepare(
      'INSERT INTO link_providers (path, provider_id, url) VALUES (?, ?, ?)'
    )
      .bind('file', 'nonexistent-provider', 'https://nope.invalid/x')
      .run()

    const res = await serveLink(get('/file'), env)
    expect(res!.status).toBe(502)
  })
})
