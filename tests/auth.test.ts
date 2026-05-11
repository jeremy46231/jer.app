import { describe, expect, test } from 'bun:test'
import { requireAuth } from '../src/auth'
import { createTestEnv, sessionCookieHeader } from './helpers/env'

function makeRequest(cookie?: string): Request {
  return new Request('https://jer.app/api/links', {
    headers: cookie ? { Cookie: cookie } : {},
  })
}

describe('requireAuth', () => {
  test('returns true when no password is configured', () => {
    const env = createTestEnv()
    expect(requireAuth(makeRequest(), env)).toBe(true)
  })

  test('returns 401 when no session cookie is present', () => {
    const env = createTestEnv({ password: 'hunter2' })
    const result = requireAuth(makeRequest(), env)
    expect(result).toBeInstanceOf(Response)
    expect((result as Response).status).toBe(401)
  })

  test('returns 401 for wrong session cookie value', () => {
    const env = createTestEnv({ password: 'hunter2' })
    const result = requireAuth(makeRequest(sessionCookieHeader('wrong')), env)
    expect((result as Response).status).toBe(401)
  })

  test('returns 401 when cookie value differs in length', () => {
    const env = createTestEnv({ password: 'hunter2' })
    const result = requireAuth(makeRequest(sessionCookieHeader('hunter')), env)
    expect((result as Response).status).toBe(401)
  })

  test('returns true for a matching session cookie', () => {
    const env = createTestEnv({ password: 'hunter2' })
    const result = requireAuth(makeRequest(sessionCookieHeader('hunter2')), env)
    expect(result).toBe(true)
  })

  test('ignores unrelated cookies and still rejects', () => {
    const env = createTestEnv({ password: 'hunter2' })
    const result = requireAuth(makeRequest('foo=bar; baz=qux'), env)
    expect((result as Response).status).toBe(401)
  })

  test('accepts session cookie alongside other cookies', () => {
    const env = createTestEnv({ password: 'hunter2' })
    const result = requireAuth(
      makeRequest(`foo=bar; ${sessionCookieHeader('hunter2')}; baz=qux`),
      env
    )
    expect(result).toBe(true)
  })
})
