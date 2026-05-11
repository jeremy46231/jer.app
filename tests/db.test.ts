import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createLink, deleteLink, getLinkWithContent, getLinks } from '../src/db'
import type {
  AttachmentFileLink,
  InlineFileLinkWithContent,
  RedirectLink,
} from '../shared-types'
import { createTestEnv, type TestEnv } from './helpers/env'

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})

afterEach(() => {
  env.__close()
})

async function insertProvider(
  path: string,
  providerId: string,
  url: string
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO link_providers (path, provider_id, url) VALUES (?, ?, ?)'
  )
    .bind(path, providerId, url)
    .run()
}

describe('createLink + getLinkWithContent', () => {
  test('round-trips a redirect link', async () => {
    await createLink(env.DB, {
      path: 'g',
      type: 'redirect',
      url: 'https://example.com/',
    })

    const link = (await getLinkWithContent(env.DB, 'g')) as RedirectLink
    expect(link).toEqual({
      path: 'g',
      type: 'redirect',
      url: 'https://example.com/',
    })
  })

  test('round-trips an inline file link with binary content', async () => {
    const file = new Uint8Array([0, 1, 2, 3, 4, 255, 254])
    await createLink(env.DB, {
      path: 'pic.png',
      type: 'inline_file',
      contentType: 'image/png',
      filename: 'pic.png',
      download: false,
      file,
    })

    const link = (await getLinkWithContent(
      env.DB,
      'pic.png'
    )) as InlineFileLinkWithContent
    expect(link.type).toBe('inline_file')
    expect(link.contentType).toBe('image/png')
    expect(link.filename).toBe('pic.png')
    // SQLite stores BOOLEAN as 0/1 so the raw value is 0 here.
    expect(Boolean(link.download)).toBe(false)
    expect(link.file).toBeInstanceOf(Uint8Array)
    expect(Array.from(link.file)).toEqual(Array.from(file))
  })

  test('returns null for a missing path', async () => {
    expect(await getLinkWithContent(env.DB, 'nope')).toBeNull()
  })

  test('round-trips an attachment_file link with no providers yet', async () => {
      await createLink(env.DB, {
        path: 'doc',
        type: 'attachment_file',
        contentType: 'application/pdf',
        filename: 'doc.pdf',
        download: true,
        providerUrls: {},
      })

      const link = (await getLinkWithContent(
        env.DB,
        'doc'
      )) as AttachmentFileLink
      expect(link.type).toBe('attachment_file')
      expect(link.providerUrls).toEqual({})
      expect(link.locations).toEqual([])
      expect(link.download).toBe(true)
  })

  test('attachment_file aggregates provider urls', async () => {
    await createLink(env.DB, {
      path: 'doc',
      type: 'attachment_file',
      contentType: 'application/pdf',
      filename: 'doc.pdf',
      download: false,
      providerUrls: {},
    })
    await insertProvider('doc', 'catbox', 'https://files.catbox.moe/x.pdf')
    await insertProvider('doc', 'gofile', 'https://gofile.io/d/abc')

    const link = (await getLinkWithContent(env.DB, 'doc')) as AttachmentFileLink
    expect(link.providerUrls).toEqual({
      catbox: 'https://files.catbox.moe/x.pdf',
      gofile: 'https://gofile.io/d/abc',
    })
    expect(link.locations).toEqual(expect.arrayContaining(['catbox', 'gofile']))
  })

  test('rejects unsupported link types', async () => {
    await expect(
      // @ts-expect-error invalid type on purpose
      createLink(env.DB, { path: 'x', type: 'wat' })
    ).rejects.toThrow(/Unsupported link type/)
  })
})

describe('getLinks', () => {
  test('returns an empty list when there are no links', async () => {
    expect(await getLinks(env.DB)).toEqual([])
  })

  test('returns all link kinds aggregated', async () => {
    await createLink(env.DB, {
      path: 'r',
      type: 'redirect',
      url: 'https://example.com',
    })
    await createLink(env.DB, {
      path: 'i',
      type: 'inline_file',
      contentType: 'text/plain',
      filename: 'hi.txt',
      download: false,
      file: new Uint8Array([104, 105]),
    })
    await createLink(env.DB, {
      path: 'a',
      type: 'attachment_file',
      contentType: 'application/octet-stream',
      filename: 'a.bin',
      download: true,
      providerUrls: {},
    })
    await insertProvider('a', 'catbox', 'https://files.catbox.moe/y.bin')

    const links = await getLinks(env.DB)
    expect(links).toHaveLength(3)
    const byPath = Object.fromEntries(links.map((l) => [l.path, l]))
    expect(byPath.r!.type).toBe('redirect')
    expect(byPath.i!.type).toBe('inline_file')
    expect(byPath.a!.type).toBe('attachment_file')
    expect((byPath.a as AttachmentFileLink).providerUrls).toEqual({
      catbox: 'https://files.catbox.moe/y.bin',
    })
  })

  test('does not expose inline file blobs in the listing', async () => {
    await createLink(env.DB, {
      path: 'i',
      type: 'inline_file',
      contentType: 'text/plain',
      filename: 'hi.txt',
      download: false,
      file: new Uint8Array([1, 2, 3]),
    })

    const [link] = await getLinks(env.DB)
    expect(link).toBeDefined()
    expect(link!.type).toBe('inline_file')
    expect((link as { file?: unknown }).file).toBeUndefined()
  })
})

describe('deleteLink', () => {
  test('removes a link', async () => {
    await createLink(env.DB, {
      path: 'g',
      type: 'redirect',
      url: 'https://example.com/',
    })
    await deleteLink(env.DB, 'g')
    expect(await getLinkWithContent(env.DB, 'g')).toBeNull()
  })

  test('cascades to link_providers via foreign key', async () => {
    await createLink(env.DB, {
      path: 'a',
      type: 'attachment_file',
      contentType: 'application/octet-stream',
      filename: 'a.bin',
      download: false,
      providerUrls: {},
    })
    await insertProvider('a', 'catbox', 'https://files.catbox.moe/x')

    await deleteLink(env.DB, 'a')

    const remaining = await env.DB.prepare(
      'SELECT * FROM link_providers WHERE path = ?'
    )
      .bind('a')
      .all()
    expect(remaining.results).toEqual([])
  })

  test('deleting a non-existent path is a no-op', async () => {
    await expect(deleteLink(env.DB, 'nope')).resolves.toBeUndefined()
  })
})
