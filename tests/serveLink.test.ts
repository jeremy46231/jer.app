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

type CfRequest = Parameters<typeof serveLink>[0]

function get(path: string): CfRequest {
  return new Request(
    new URL(path, 'https://jer.app').toString()
  ) as unknown as CfRequest
}

async function setFileBytes(path: string, data: Uint8Array): Promise<void> {
  await env.DB.prepare('UPDATE links SET file = ? WHERE path = ?')
    .bind(data, path)
    .run()
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
      status: 302,
    })

    const res = await serveLink(get('/g'), env)
    expect(res).toBeDefined()
    expect(res!.status).toBe(302)
    expect(res!.headers.get('Location')).toBe('https://example.com/destination')
  })

  test('file link with inline bytes serves them with the right headers', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5])
    await createLink(env.DB, {
      path: 'pic',
      type: 'file',
      contentType: 'image/png',
      filename: 'cat.png',
      download: false,
      providerUrls: {},
      locations: [],
    })
    await setFileBytes('pic', data)

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

  test('file link with download=true uses attachment disposition', async () => {
    await createLink(env.DB, {
      path: 'doc',
      type: 'file',
      contentType: 'application/pdf',
      filename: 'doc.pdf',
      download: true,
      providerUrls: {},
      locations: [],
    })
    await setFileBytes('doc', new Uint8Array([0]))

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
      status: 302,
    })

    const res = await serveLink(get('/hello%20world'), env)
    expect(res!.status).toBe(302)
    expect(res!.headers.get('Location')).toBe('https://example.com/')
  })

  test('file link with no providers returns 502', async () => {
    await createLink(env.DB, {
      path: 'file',
      type: 'file',
      contentType: 'application/octet-stream',
      filename: 'a.bin',
      download: false,
      providerUrls: {},
      locations: [],
    })

    const res = await serveLink(get('/file'), env)
    expect(res!.status).toBe(502)
  })

  test('file link falls through to 502 when no real provider can serve it', async () => {
    await createLink(env.DB, {
      path: 'file',
      type: 'file',
      contentType: 'application/octet-stream',
      filename: 'a.bin',
      download: false,
      providerUrls: {},
      locations: [],
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
  async function link(
    path: string,
    url: string,
    status: 301 | 302 | 307 | 308 = 302
  ) {
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
      type: 'file',
      contentType: 'image/png',
      filename: 'img.png',
      download: false,
      providerUrls: {},
      locations: [],
    })
    await setFileBytes('real', new Uint8Array([1, 2, 3]))
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
    expect(res!.headers.get('Location')).toBe(
      'https://final.com/base/extra?q=1'
    )
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
      type: 'file',
      contentType: 'image/png',
      filename: 'img.png',
      download: false,
      providerUrls: {},
      locations: [],
    })
    await setFileBytes('img', new Uint8Array([0]))
    const res = await serveLink(get('/img/something'), env)
    expect(res).toBeUndefined()
  })
})

describe('click notifications', () => {
  /** A request carrying a User-Agent, IP and Cloudflare geo data. */
  function clickReq(path: string): CfRequest {
    const req = new Request(new URL(path, 'https://jer.app').toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'CF-Connecting-IP': '203.0.113.5',
      },
    })
    Object.defineProperty(req, 'cf', {
      value: { city: 'Austin', region: 'Texas', country: 'US' },
      configurable: true,
    })
    return req as unknown as CfRequest
  }

  /** Collects waitUntil promises so the test can await them. */
  function makeCtx() {
    const promises: Promise<unknown>[] = []
    const ctx = {
      waitUntil: (p: Promise<unknown>) => promises.push(p),
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext
    return { ctx, settled: () => Promise.all(promises) }
  }

  let originalFetch: typeof fetch
  /** @type {Array<{url: string; body: any}>} */
  let calls: { url: string; body: Record<string, unknown> }[]

  beforeEach(() => {
    env.SLACK_BOT_TOKEN = 'xoxb-test'
    env.SLACK_CHANNEL_ID = 'C123'
    env.SLACK_USER_ID = 'U999'
    calls = []
    originalFetch = globalThis.fetch
    globalThis.fetch = (async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      calls.push({
        url: String(input),
        body: init?.body ? JSON.parse(String(init.body)) : {},
      })
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  test('does not notify when the link has notify disabled', async () => {
    await createLink(env.DB, {
      path: 'q',
      type: 'redirect',
      url: 'https://example.com/',
      status: 302,
    })
    const { ctx, settled } = makeCtx()
    await serveLink(clickReq('/q'), env, ctx)
    await settled()
    expect(calls).toHaveLength(0)
  })

  test('posts a Slack message with parsed click details', async () => {
    await createLink(env.DB, {
      path: 'q',
      type: 'redirect',
      url: 'https://example.com/dest',
      status: 302,
      notify: true,
      notifyPing: true,
    })
    const { ctx, settled } = makeCtx()
    const res = await serveLink(clickReq('/q'), env, ctx)
    expect(res!.status).toBe(302)
    await settled()

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('https://slack.com/api/chat.postMessage')
    const body = calls[0].body
    expect(body.channel).toBe('C123')
    expect(String(body.text)).toContain('<@U999>') // ping prefix
    expect(String(body.text)).toContain('/q')

    const rendered = JSON.stringify(body.blocks)
    expect(rendered).toContain('203.0.113.5') // IP
    expect(rendered).toContain('Austin, Texas, US') // geo
    expect(rendered).toContain('Chrome 126.0.0.0 on Windows · Desktop') // UA
    expect(rendered).toContain('example.com/dest') // destination
  })

  test('omits the ping when notifyPing is false', async () => {
    await createLink(env.DB, {
      path: 'q',
      type: 'redirect',
      url: 'https://example.com/',
      status: 302,
      notify: true,
      notifyPing: false,
    })
    const { ctx, settled } = makeCtx()
    await serveLink(clickReq('/q'), env, ctx)
    await settled()
    expect(String(calls[0].body.text)).not.toContain('<@U999>')
  })
})
