import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import worker from '../src/index'
import { createLink } from '../src/db'
import { createTestEnv, type TestEnv } from './helpers/env'

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})

afterEach(() => {
  env.__close()
})

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext

function fetchWith(path: string, init?: RequestInit): Promise<Response> {
  const req = new Request(new URL(path, 'https://jer.app').toString(), init)
  return worker.fetch!(req as Parameters<typeof worker.fetch>[0], env, ctx)
}

describe('worker entry (fetch handler)', () => {
  test('redirects "/" to /dash by default (303)', async () => {
    const res = await fetchWith('/')
    expect(res.status).toBe(303)
    expect(res.headers.get('Location')).toBe('https://jer.app/dash')
  })

  test('redirects "/" to REDIRECT_URL (308) when configured', async () => {
    const customEnv = createTestEnv({ redirectUrl: 'https://example.com/' })
    try {
      const req = new Request('https://jer.app/')
      const res = await worker.fetch!(
        req as Parameters<typeof worker.fetch>[0],
        customEnv,
        ctx
      )
      expect(res.status).toBe(308)
      expect(res.headers.get('Location')).toBe('https://example.com/')
    } finally {
      customEnv.__close()
    }
  })

  test('routes /api/* to the API handler', async () => {
    const res = await fetchWith('/api/links')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  test('serves a link when one matches', async () => {
    await createLink(env.DB, {
      path: 'g',
      type: 'redirect',
      url: 'https://example.com/x',
      status: 302,
    })

    const res = await fetchWith('/g')
    expect(res.status).toBe(302)
    expect(res.headers.get('Location')).toBe('https://example.com/x')
  })

  test('returns 404 for unknown paths with no matching link', async () => {
    const res = await fetchWith('/no-such-path')
    expect(res.status).toBe(404)
  })

  test('returns 500 when the env is missing the DB binding', async () => {
    const brokenEnv = {
      ADMIN_USERNAME: '',
      ADMIN_PASSWORD: '',
      REDIRECT_URL: '',
    } as unknown as Env
    const res = await worker.fetch!(
      new Request('https://jer.app/anything') as Parameters<
        typeof worker.fetch
      >[0],
      brokenEnv,
      ctx
    )
    expect(res.status).toBe(500)
  })
})
