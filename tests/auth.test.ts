import { describe, expect, test } from 'bun:test'
import { requireAuth } from '../src/auth'
import { basicAuth, createTestEnv } from './helpers/env'

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request('https://jer.app/api/links', { headers })
}

describe('requireAuth', () => {
  test('returns true when no credentials are configured', () => {
    const env = createTestEnv()
    expect(requireAuth(makeRequest(), env)).toBe(true)
  })

  test('throws when only one of username/password is set', () => {
    const env = createTestEnv({ username: 'admin' })
    // password is empty -> only username is "set" -> throws
    expect(() => requireAuth(makeRequest(), env)).toThrow(
      /Both ADMIN_USERNAME and ADMIN_PASSWORD/
    )
  })

  test('returns 401 with WWW-Authenticate when no auth header is present', () => {
    const env = createTestEnv({ username: 'admin', password: 'pw' })
    const result = requireAuth(makeRequest(), env)
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
    expect((result as Response).headers.get('WWW-Authenticate')).toBe(
      'Basic realm="Restricted Area"'
    )
  })

  test('returns 401 for non-Basic schemes', async () => {
    const env = createTestEnv({ username: 'admin', password: 'pw' })
    const result = requireAuth(
      makeRequest({ Authorization: 'Bearer abc' }),
      env
    )
    expect(result).toBeInstanceOf(Response)
    const res = result as Response
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('Invalid Authorization Scheme')
  })

  test('returns 401 for malformed credentials (no colon)', async () => {
    const env = createTestEnv({ username: 'admin', password: 'pw' })
    const encoded = btoa('admin-only')
    const result = requireAuth(
      makeRequest({ Authorization: `Basic ${encoded}` }),
      env
    )
    const res = result as Response
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('Invalid Credentials Format')
  })

  test('returns 401 for wrong username', async () => {
    const env = createTestEnv({ username: 'admin', password: 'pw' })
    const result = requireAuth(
      makeRequest({ Authorization: basicAuth('nobody', 'pw') }),
      env
    )
    const res = result as Response
    expect(res.status).toBe(401)
    expect(await res.text()).toBe('Invalid Username or Password')
  })

  test('returns 401 for wrong password', async () => {
    const env = createTestEnv({ username: 'admin', password: 'pw' })
    const result = requireAuth(
      makeRequest({ Authorization: basicAuth('admin', 'nope') }),
      env
    )
    expect((result as Response).status).toBe(401)
  })

  test('returns true for matching credentials', () => {
    const env = createTestEnv({ username: 'admin', password: 'pw' })
    const result = requireAuth(
      makeRequest({ Authorization: basicAuth('admin', 'pw') }),
      env
    )
    expect(result).toBe(true)
  })

  test('handles passwords with colons correctly', () => {
    const env = createTestEnv({
      username: 'admin',
      password: 'a:b:c',
    })
    const result = requireAuth(
      makeRequest({ Authorization: basicAuth('admin', 'a:b:c') }),
      env
    )
    expect(result).toBe(true)
  })

  test('does not allow length mismatch (timing-safe equal short-circuit)', () => {
    const env = createTestEnv({ username: 'admin', password: 'pw' })
    const result = requireAuth(
      makeRequest({ Authorization: basicAuth('a', 'pw') }),
      env
    )
    expect((result as Response).status).toBe(401)
  })
})
