import { createTestD1 } from './d1'

export type TestEnv = Env & {
  /** Test-only helper that releases the in-memory SQLite handle. */
  __close: () => void
}

export interface CreateTestEnvOptions {
  password?: string
  redirectUrl?: string
}

/**
 * Build a fresh `Env` for a test, backed by an in-memory SQLite that mimics D1.
 *
 * By default no password is configured, so `requireAuth` short-circuits
 * (matching the behaviour the production code logs as "skipping authentication"
 * when no password is set). Pass `password` to enable auth.
 */
export function createTestEnv(opts: CreateTestEnvOptions = {}): TestEnv {
  const db = createTestD1()
  return {
    DB: db,
    ADMIN_USERNAME: '',
    ADMIN_PASSWORD: opts.password ?? '',
    REDIRECT_URL: opts.redirectUrl ?? '',
    __close: () => (db as unknown as { close: () => void }).close(),
  } as TestEnv
}

/** Build a session cookie header value for the given password. */
export function sessionCookieHeader(password: string): string {
  return `session=${password}`
}
