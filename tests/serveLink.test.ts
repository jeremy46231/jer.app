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

  test('attachment_file with no providers returns 502', async () => {
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
  })

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

describe('redirect routing', () => {
  async function link(path: string, url: string, status: 301 | 302 | 307 | 308 = 302) {
    await createLink(env.DB, { path, type: 'redirect', url, status })
  }

  test('forwards query string to external target', async () => {
    await link('a', 'https://example.com/')
    const res = await serveLink(get('/a?foo=bar'), env)
    expect(res!.status).toBe(302)
    expect(res!.headers.get('Location')).toBe('https://example.com/?foo=bar')
  })

  test('appends sub-path to external target', async () => {
    await link('a', 'https://example.com/base')
    const res = await serveLink(get('/a/c/d'), env)
    expect(res!.headers.get('Location')).toBe('https://example.com/base/c/d')
  })

  test('appends sub-path and query string together', async () => {
    await link('a', 'https://example.com/base')
    const res = await serveLink(get('/a/c?x=1'), env)
    expect(res!.headers.get('Location')).toBe('https://example.com/base/c?x=1')
  })

  test('merges target query string with request query string', async () => {
    await link('a', 'https://example.com/?utm=x')
    const res = await serveLink(get('/a?ref=y'), env)
    const loc = new URL(res!.headers.get('Location')!)
    expect(loc.searchParams.get('utm')).toBe('x')
    expect(loc.searchParams.get('ref')).toBe('y')
  })

  test('longer stored path wins over shorter prefix', async () => {
    await link('a/b', 'https://exact.com/')
    await link('a', 'https://prefix.com/')
    const res = await serveLink(get('/a/b'), env)
    expect(res!.headers.get('Location')).toBe('https://exact.com/')
  })

  test('shorter prefix handles unmatched sub-path', async () => {
    await link('a/b', 'https://exact.com/')
    await link('a', 'https://prefix.com/')
    const res = await serveLink(get('/a/c'), env)
    expect(res!.headers.get('Location')).toBe('https://prefix.com/c')
  })

  test('internal redirect serves the target file directly', async () => {
    await createLink(env.DB, {
      path: 'alias',
      type: 'redirect',
      url: '/real',
      status: 302,
    })
    await createLink(env.DB, {
      path: 'real',
      type: 'inline_file',
      contentType: 'image/png',
      filename: 'img.png',
      download: false,
      file: new Uint8Array([1, 2, 3]),
    })
    const res = await serveLink(get('/alias'), env)
    expect(res!.status).toBe(200)
    expect(res!.headers.get('Content-Type')).toBe('image/png')
  })

  test('internal redirect chain resolves to external', async () => {
    await link('a', '/b')
    await link('b', '/c')
    await link('c', 'https://final.com/')
    const res = await serveLink(get('/a'), env)
    expect(res!.status).toBe(302)
    expect(res!.headers.get('Location')).toBe('https://final.com/')
  })

  test('internal redirect preserves sub-path across hops', async () => {
    await link('a', '/b')
    await link('b', 'https://final.com/base')
    const res = await serveLink(get('/a/extra?q=1'), env)
    expect(res!.headers.get('Location')).toBe('https://final.com/base/extra?q=1')
  })

  test('internal redirect cycle returns 508', async () => {
    await link('x', '/y')
    await link('y', '/x')
    const res = await serveLink(get('/x'), env)
    expect(res!.status).toBe(508)
  })

  test('sub-path request does not match a file link via prefix', async () => {
    await createLink(env.DB, {
      path: 'img',
      type: 'inline_file',
      contentType: 'image/png',
      filename: 'img.png',
      download: false,
      file: new Uint8Array([0]),
    })
    const res = await serveLink(get('/img/something'), env)
    expect(res).toBeUndefined()
  })
})
