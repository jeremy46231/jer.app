import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createLink } from '../../src/db'
import { InlineStorageProvider } from '../../src/storage/providers/InlineStorageProvider'
import type { InlineFileLinkWithContent } from '../../shared-types'
import { createTestEnv, type TestEnv } from '../helpers/env'
import { streamFromBuffer } from '../helpers/network'

let env: TestEnv
const provider = new InlineStorageProvider()

beforeEach(() => {
  env = createTestEnv()
})

afterEach(() => {
  env.__close()
})

async function loadInlineLink(
  path: string
): Promise<InlineFileLinkWithContent> {
  const row = (await env.DB.prepare(
    'SELECT path, type, file, content_type AS contentType, filename, download FROM links WHERE path = ?'
  )
    .bind(path)
    .first()) as {
    path: string
    type: string
    file: ArrayBuffer | null
    contentType: string
    filename: string
    download: number
  } | null
  if (!row) throw new Error(`No link at ${path}`)
  return {
    path: row.path,
    type: 'inline_file',
    contentType: row.contentType,
    filename: row.filename,
    download: !!row.download,
    file: row.file ? new Uint8Array(row.file) : new Uint8Array(),
  }
}

describe('InlineStorageProvider.has', () => {
  test('is true when an inline_file has a non-empty file', () => {
    expect(
      provider.has({
        path: 'p',
        type: 'inline_file',
        contentType: 'text/plain',
        filename: 'a.txt',
        download: false,
        file: new Uint8Array([1]),
      })
    ).toBe(true)
  })

  test('is false for a redirect or attachment', () => {
    expect(
      provider.has({ path: 'p', type: 'redirect', url: 'https://x' })
    ).toBe(false)
    expect(
      provider.has({
        path: 'p',
        type: 'attachment_file',
        contentType: 'text/plain',
        filename: 'a.txt',
        download: false,
        providerUrls: { catbox: 'https://files.catbox.moe/x' },
      })
    ).toBe(false)
  })
})

describe('InlineStorageProvider.upload', () => {
  test('reads the stream and writes the bytes back to the row', async () => {
    // Pre-create the row so the UPDATE in upload has something to mutate.
    await createLink(env.DB, {
      path: 'note',
      type: 'inline_file',
      contentType: 'text/plain',
      filename: 'note.txt',
      download: false,
      file: new Uint8Array(),
    })

    const payload = new TextEncoder().encode('hello stream')
    await provider.upload(
      streamFromBuffer(payload),
      'note.txt',
      payload.byteLength,
      'note',
      env.DB
    )

    const link = await loadInlineLink('note')
    expect(new TextDecoder().decode(link.file)).toBe('hello stream')
  })
})

describe('InlineStorageProvider.download', () => {
  test('returns null for non-inline links', async () => {
    const res = await provider.download(
      { path: 'p', type: 'redirect', url: 'https://x' },
      new Headers()
    )
    expect(res).toBeNull()
  })

  test('returns null for empty files', async () => {
    const res = await provider.download(
      {
        path: 'p',
        type: 'inline_file',
        contentType: 'text/plain',
        filename: 'p.txt',
        download: false,
        file: new Uint8Array(),
      },
      new Headers()
    )
    expect(res).toBeNull()
  })

  test('serves bytes with inline disposition by default', async () => {
    const res = await provider.download(
      {
        path: 'p',
        type: 'inline_file',
        contentType: 'text/plain',
        filename: 'p.txt',
        download: false,
        file: new TextEncoder().encode('body'),
      },
      new Headers()
    )
    expect(res!.status).toBe(200)
    expect(res!.headers.get('Content-Type')).toBe('text/plain')
    expect(res!.headers.get('Content-Length')).toBe('4')
    expect(res!.headers.get('Content-Disposition')).toBe(
      'inline; filename="p.txt"'
    )
    expect(await res!.text()).toBe('body')
  })

  test('uses attachment disposition when download=true', async () => {
    const res = await provider.download(
      {
        path: 'p',
        type: 'inline_file',
        contentType: 'text/plain',
        filename: 'p.txt',
        download: true,
        file: new TextEncoder().encode('body'),
      },
      new Headers()
    )
    expect(res!.headers.get('Content-Disposition')).toBe(
      'attachment; filename="p.txt"'
    )
  })
})
