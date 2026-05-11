import { createTestD1 } from './d1'

export type TestEnv = Env & {
  /** Test-only helper that releases the in-memory SQLite handle. */
  __close: () => void
}

export interface CreateTestEnvOptions {
  username?: string
  password?: string
  redirectUrl?: string
}

/**
 * Build a fresh `Env` for a test, backed by an in-memory SQLite that mimics D1.
 *
 * By default no credentials are configured, so `requireAuth` short-circuits
 * (matching the behaviour the production code logs as "skipping authentication"
 * when no creds are set). Pass `username`/`password` to enable auth.
 */
export function createTestEnv(opts: CreateTestEnvOptions = {}): TestEnv {
  const db = createTestD1()
  return {
    DB: db,
    ADMIN_USERNAME: opts.username ?? '',
    ADMIN_PASSWORD: opts.password ?? '',
    REDIRECT_URL: opts.redirectUrl ?? '',
    __close: () => (db as unknown as { close: () => void }).close(),
  } as TestEnv
}

/**
 * Convenience: build a `Basic` Authorization header value for the given
 * credentials.
 */
export function basicAuth(username: string, password: string): string {
  return 'Basic ' + btoa(`${username}:${password}`)
}
