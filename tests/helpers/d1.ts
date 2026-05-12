import {
  Database,
  type Statement as BunStatement,
  type SQLQueryBindings,
} from 'bun:sqlite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS_DIR = join(import.meta.dir, '..', '..', 'migrations')

/**
 * A minimal D1Database adapter on top of `bun:sqlite`.
 *
 * It implements the subset of the D1 API used by the application:
 *   - `prepare(sql).bind(...).run()`
 *   - `prepare(sql).bind(...).all()`
 *   - `prepare(sql).bind(...).first()`
 *   - `exec(sql)`
 *
 * Behaviour we replicate from D1:
 *   - `Uint8Array` parameters are bound as BLOBs.
 *   - `BLOB` columns are returned as `ArrayBuffer` (D1 returns `ArrayBuffer`,
 *     while `bun:sqlite` returns `Uint8Array`).
 *   - Boolean parameters are coerced to 0/1 ints (D1 does this implicitly).
 *   - `INTEGER` columns are returned as numbers (we coerce BigInts).
 *   - `ON DELETE CASCADE` works because we enable foreign keys.
 */
export function createTestD1(): D1Database {
  const db = new Database(':memory:')
  db.exec('PRAGMA foreign_keys = ON;')
  applyMigrations(db)
  return new MockD1Database(db) as unknown as D1Database
}

export function applyMigrations(db: Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf-8')
    db.exec(sql)
  }
}

class MockD1Database {
  constructor(private readonly db: Database) {}

  prepare(sql: string): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this.db, sql, [])
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    const start = performance.now()
    this.db.exec(sql)
    return { count: 0, duration: performance.now() - start }
  }

  async batch<T = unknown>(
    statements: MockD1PreparedStatement[]
  ): Promise<T[]> {
    const out: T[] = []
    for (const s of statements) out.push((await s.run()) as unknown as T)
    return out
  }

  async dump(): Promise<ArrayBuffer> {
    throw new Error('dump() not implemented in test adapter')
  }

  withSession(): unknown {
    throw new Error('withSession() not implemented in test adapter')
  }

  /** Test-only: close the underlying SQLite handle. */
  close(): void {
    this.db.close()
  }
}

class MockD1PreparedStatement {
  constructor(
    private readonly db: Database,
    private readonly sql: string,
    private readonly params: unknown[]
  ) {}

  bind(...values: unknown[]): MockD1PreparedStatement {
    return new MockD1PreparedStatement(this.db, this.sql, values)
  }

  async run(): Promise<{
    success: true
    meta: { changes: number; last_row_id: number; duration: number }
    results: never[]
  }> {
    const stmt = this.db.prepare(this.sql)
    const start = performance.now()
    const res = stmt.run(...this.normalizeParams())
    return {
      success: true,
      meta: {
        changes: res.changes,
        last_row_id:
          typeof res.lastInsertRowid === 'bigint'
            ? Number(res.lastInsertRowid)
            : res.lastInsertRowid,
        duration: performance.now() - start,
      },
      results: [],
    }
  }

  async all<T = Record<string, unknown>>(): Promise<{
    success: true
    results: T[]
    meta: { duration: number }
  }> {
    const stmt = this.db.prepare(this.sql)
    const start = performance.now()
    const rows = stmt.all(...this.normalizeParams()) as Record<
      string,
      unknown
    >[]
    return {
      success: true,
      results: rows.map(normalizeRow) as T[],
      meta: { duration: performance.now() - start },
    }
  }

  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const stmt = this.db.prepare(this.sql)
    const row = stmt.get(...this.normalizeParams()) as
      | Record<string, unknown>
      | null
      | undefined
    if (!row) return null
    const norm = normalizeRow(row)
    if (column !== undefined) return (norm[column] ?? null) as T
    return norm as T
  }

  async raw<T extends unknown[] = unknown[]>(): Promise<T[]> {
    const stmt = this.db.prepare(this.sql) as BunStatement<unknown>
    const rows = stmt.values(...this.normalizeParams()) as unknown[][]
    return rows.map((r) => r.map(normalizeValue)) as T[]
  }

  private normalizeParams(): SQLQueryBindings[] {
    return this.params.map((p): SQLQueryBindings => {
      if (p === undefined) return null
      if (typeof p === 'boolean') return p ? 1 : 0
      if (p instanceof Uint8Array) return p
      return p as SQLQueryBindings
    })
  }
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(row)) {
    out[key] = normalizeValue(row[key])
  }
  return out
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    // D1 returns numbers for INTEGER unless they overflow.
    return Number.isSafeInteger(Number(value)) ? Number(value) : value
  }
  if (value instanceof Uint8Array) {
    // D1 returns BLOBs as ArrayBuffer.
    return value.buffer.slice(
      value.byteOffset,
      value.byteOffset + value.byteLength
    ) as ArrayBuffer
  }
  return value
}
