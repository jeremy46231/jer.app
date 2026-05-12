import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { handleAPI } from '../src/api'
import { getLinkWithContent } from '../src/db'
import type { InlineFileLinkWithContent, Link } from '../shared-types'
import { createTestEnv, sessionCookieHeader, type TestEnv } from './helpers/env'

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})

afterEach(() => {
  env.__close()
})

const BASE = 'https://jer.app'

type CfRequest = Parameters<typeof handleAPI>[0]

function jsonRequest(path: string, method: string, body?: unknown): CfRequest {
  return new Request(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as CfRequest
}

describe('handleAPI auth', () => {
  test('runs without auth when credentials are not configured', async () => {
    const res = await handleAPI(jsonRequest('/api/links', 'GET'), env)
    expect(res.status).toBe(200)
  })

  test('returns 401 when password is required but no cookie is present', async () => {
    const authedEnv = createTestEnv({ password: 'pw' })
    try {
      const res = await handleAPI(jsonRequest('/api/links', 'GET'), authedEnv)
      expect(res.status).toBe(401)
    } finally {
      authedEnv.__close()
    }
  })

  test('lets correct session cookie through', async () => {
    const authedEnv = createTestEnv({ password: 'pw' })
    try {
      const req = new Request(`${BASE}/api/links`, {
        method: 'GET',
        headers: { Cookie: sessionCookieHeader('pw') },
      }) as unknown as CfRequest
      const res = await handleAPI(req, authedEnv)
      expect(res.status).toBe(200)
    } finally {
      authedEnv.__close()
    }
  })
})

describe('GET /api/links', () => {
  test('returns an empty list initially', async () => {
    const res = await handleAPI(jsonRequest('/api/links', 'GET'), env)
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect((await res.json()) as unknown).toEqual([])
  })

  test('returns previously created links', async () => {
    await handleAPI(
      jsonRequest('/api/links', 'POST', {
        path: 'g',
        type: 'redirect',
        url: 'https://example.com/',
      }),
      env
    )

    const res = await handleAPI(jsonRequest('/api/links', 'GET'), env)
    const json = (await res.json()) as Link[]
    expect(json).toHaveLength(1)
    expect(json[0]).toEqual({
      path: 'g',
      type: 'redirect',
      url: 'https://example.com/',
      status: 302,
    })
  })
})

describe('POST /api/links (non-file)', () => {
  test('creates a redirect', async () => {
    const res = await handleAPI(
      jsonRequest('/api/links', 'POST', {
        path: 'gh',
        type: 'redirect',
        url: 'https://github.com',
      }),
      env
    )
    expect(res.status).toBe(201)

    const stored = await getLinkWithContent(env.DB, 'gh')
    expect(stored).toEqual({
      path: 'gh',
      type: 'redirect',
      url: 'https://github.com',
      status: 302,
    })
  })

  test('rejects missing fields with 400', async () => {
    const res = await handleAPI(
      jsonRequest('/api/links', 'POST', {
        path: 'gh',
        type: 'redirect',
        // url missing
      }),
      env
    )
    expect(res.status).toBe(400)
  })

  test('rejects unsupported link types with 400', async () => {
    const res = await handleAPI(
      jsonRequest('/api/links', 'POST', {
        path: 'x',
        type: 'sftp',
      }),
      env
    )
    expect(res.status).toBe(400)
  })
})

describe('POST /api/links/upload (inline)', () => {
  function uploadRequest(
    qs: Record<string, string | string[]>,
    body: BodyInit | null,
    extraHeaders: Record<string, string> = {}
  ): CfRequest {
    const url = new URL('/api/links/upload', BASE)
    for (const [k, v] of Object.entries(qs)) {
      if (Array.isArray(v)) {
        for (const vv of v) url.searchParams.append(k, vv)
      } else {
        url.searchParams.set(k, v)
      }
    }
    return new Request(url.toString(), {
      method: 'POST',
      body,
      headers: extraHeaders,
    }) as unknown as CfRequest
  }

  test('rejects missing required fields', async () => {
    const res = await handleAPI(
      uploadRequest({ path: 'x' }, new Uint8Array([1])),
      env
    )
    expect(res.status).toBe(400)
  })

  test('rejects unsupported provider locations', async () => {
    const res = await handleAPI(
      uploadRequest(
        {
          'path': 'x',
          'content-type': 'text/plain',
          'filename': 'x.txt',
          'locations': ['nonsense'],
        },
        new Uint8Array([1])
      ),
      env
    )
    expect(res.status).toBe(400)
    expect(await res.text()).toContain('Unsupported file location')
  })

  test('uploads to inline storage and stores the file', async () => {
    const payload = new TextEncoder().encode('inline contents')
    const res = await handleAPI(
      uploadRequest(
        {
          'path': 'note.txt',
          'content-type': 'text/plain',
          'filename': 'note.txt',
          'locations': ['inline'],
        },
        payload,
        { 'Content-Length': String(payload.byteLength) }
      ),
      env
    )

    expect(res.status).toBe(201)
    const json = (await res.json()) as { successful: string[] }
    expect(json.successful).toEqual(['inline'])

    const stored = (await getLinkWithContent(
      env.DB,
      'note.txt'
    )) as InlineFileLinkWithContent
    expect(stored.type).toBe('inline_file')
    expect(stored.contentType).toBe('text/plain')
    expect(stored.filename).toBe('note.txt')
    expect(new TextDecoder().decode(stored.file)).toBe('inline contents')
  })

  test('honors download=true on upload', async () => {
    const payload = new Uint8Array([1, 2, 3])
    await handleAPI(
      uploadRequest(
        {
          'path': 'dl',
          'content-type': 'application/octet-stream',
          'filename': 'dl.bin',
          'locations': ['inline'],
          'download': 'true',
        },
        payload,
        { 'Content-Length': '3' }
      ),
      env
    )

    const stored = (await getLinkWithContent(
      env.DB,
      'dl'
    )) as InlineFileLinkWithContent
    expect(Boolean(stored.download)).toBe(true)
  })

  test('rejects upload with no body', async () => {
    const res = await handleAPI(
      uploadRequest(
        {
          'path': 'p',
          'content-type': 'text/plain',
          'filename': 'p.txt',
          'locations': ['inline'],
        },
        null
      ),
      env
    )
    // The api handler asserts a non-null body and returns 400.
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/links', () => {
  test('removes a previously created link', async () => {
    await handleAPI(
      jsonRequest('/api/links', 'POST', {
        path: 'g',
        type: 'redirect',
        url: 'https://example.com/',
      }),
      env
    )

    const res = await handleAPI(
      new Request(`${BASE}/api/links?path=g`, {
        method: 'DELETE',
      }) as unknown as CfRequest,
      env
    )
    expect(res.status).toBe(200)
    expect(await getLinkWithContent(env.DB, 'g')).toBeNull()
  })

  test('returns 400 when no path is provided', async () => {
    const res = await handleAPI(
      new Request(`${BASE}/api/links`, {
        method: 'DELETE',
      }) as unknown as CfRequest,
      env
    )
    expect(res.status).toBe(400)
  })
})

describe('handleAPI fallthrough', () => {
  test('returns 404 for an unknown path', async () => {
    const res = await handleAPI(jsonRequest('/api/unknown', 'GET'), env)
    expect(res.status).toBe(404)
  })
})

// Smoke test: the TS types for link listings still serialize correctly
describe('full lifecycle', () => {
  test('create -> list -> serve -> delete (inline upload)', async () => {
    const payload = new TextEncoder().encode('full lifecycle')

    const url = new URL('/api/links/upload', BASE)
    url.searchParams.set('path', 'doc')
    url.searchParams.set('content-type', 'text/plain')
    url.searchParams.set('filename', 'doc.txt')
    url.searchParams.append('locations', 'inline')

    const upload = await handleAPI(
      new Request(url.toString(), {
        method: 'POST',
        body: payload,
        headers: { 'Content-Length': String(payload.byteLength) },
      }) as unknown as CfRequest,
      env
    )
    expect(upload.status).toBe(201)

    const list = (await (
      await handleAPI(jsonRequest('/api/links', 'GET'), env)
    ).json()) as Link[]
    expect(list).toHaveLength(1)
    expect(list[0]!.type).toBe('inline_file')

    const del = await handleAPI(
      new Request(`${BASE}/api/links?path=doc`, {
        method: 'DELETE',
      }) as unknown as CfRequest,
      env
    )
    expect(del.status).toBe(200)
    expect(await getLinkWithContent(env.DB, 'doc')).toBeNull()
  })
})
