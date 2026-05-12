import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createLink, deleteLink, getLinkWithContent, getLinks } from '../src/db'
import type {
  FileLink,
  FileLinkWithContent,
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

async function setFileBytes(path: string, data: Uint8Array): Promise<void> {
  await env.DB.prepare('UPDATE links SET file = ? WHERE path = ?')
    .bind(data, path)
    .run()
}

describe('createLink + getLinkWithContent', () => {
  test('round-trips a redirect link', async () => {
    await createLink(env.DB, {
      path: 'g',
      type: 'redirect',
      url: 'https://example.com/',
      status: 302,
    })

    const link = (await getLinkWithContent(env.DB, 'g')) as RedirectLink
    expect(link).toEqual({
      path: 'g',
      type: 'redirect',
      url: 'https://example.com/',
      status: 302,
    })
  })

  test('round-trips a file link with inline binary content', async () => {
    const file = new Uint8Array([0, 1, 2, 3, 4, 255, 254])
    await createLink(env.DB, {
      path: 'pic.png',
      type: 'file',
      contentType: 'image/png',
      filename: 'pic.png',
      download: false,
      providerUrls: {},
      locations: [],
    })
    await setFileBytes('pic.png', file)

    const link = (await getLinkWithContent(
      env.DB,
      'pic.png'
    )) as FileLinkWithContent
    expect(link.type).toBe('file')
    expect(link.contentType).toBe('image/png')
    expect(link.filename).toBe('pic.png')
    expect(Boolean(link.download)).toBe(false)
    expect(link.file).toBeInstanceOf(Uint8Array)
    expect(Array.from(link.file!)).toEqual(Array.from(file))
    expect(link.locations).toContain('inline')
  })

  test('returns null for a missing path', async () => {
    expect(await getLinkWithContent(env.DB, 'nope')).toBeNull()
  })

  test('round-trips a file link with no providers yet', async () => {
    await createLink(env.DB, {
      path: 'doc',
      type: 'file',
      contentType: 'application/pdf',
      filename: 'doc.pdf',
      download: true,
      providerUrls: {},
      locations: [],
    })

    const link = (await getLinkWithContent(
      env.DB,
      'doc'
    )) as FileLinkWithContent
    expect(link.type).toBe('file')
    expect(link.providerUrls).toEqual({})
    expect(link.locations).toEqual([])
    expect(link.download).toBe(true)
  })

  test('file link aggregates provider urls', async () => {
    await createLink(env.DB, {
      path: 'doc',
      type: 'file',
      contentType: 'application/pdf',
      filename: 'doc.pdf',
      download: false,
      providerUrls: {},
      locations: [],
    })
    await insertProvider('doc', 'catbox', 'https://files.catbox.moe/x.pdf')
    await insertProvider('doc', 'gofile', 'https://gofile.io/d/abc')

    const link = (await getLinkWithContent(
      env.DB,
      'doc'
    )) as FileLinkWithContent
    expect(link.providerUrls).toEqual({
      catbox: 'https://files.catbox.moe/x.pdf',
      gofile: 'https://gofile.io/d/abc',
    })
    expect(link.locations).toEqual(expect.arrayContaining(['catbox', 'gofile']))
  })

  test('file link with both inline bytes and external providers includes inline in locations', async () => {
    await createLink(env.DB, {
      path: 'both',
      type: 'file',
      contentType: 'text/plain',
      filename: 'both.txt',
      download: false,
      providerUrls: {},
      locations: [],
    })
    await setFileBytes('both', new Uint8Array([1, 2, 3]))
    await insertProvider('both', 'catbox', 'https://files.catbox.moe/b.txt')

    const link = (await getLinkWithContent(
      env.DB,
      'both'
    )) as FileLinkWithContent
    expect(link.locations).toEqual(expect.arrayContaining(['inline', 'catbox']))
    expect(link.file).toBeInstanceOf(Uint8Array)
    expect(link.providerUrls).toEqual({
      catbox: 'https://files.catbox.moe/b.txt',
    })
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
      status: 302,
    })
    await createLink(env.DB, {
      path: 'i',
      type: 'file',
      contentType: 'text/plain',
      filename: 'hi.txt',
      download: false,
      providerUrls: {},
      locations: [],
    })
    await setFileBytes('i', new Uint8Array([104, 105]))
    await createLink(env.DB, {
      path: 'a',
      type: 'file',
      contentType: 'application/octet-stream',
      filename: 'a.bin',
      download: true,
      providerUrls: {},
      locations: [],
    })
    await insertProvider('a', 'catbox', 'https://files.catbox.moe/y.bin')

    const links = await getLinks(env.DB)
    expect(links).toHaveLength(3)
    const byPath = Object.fromEntries(links.map((l) => [l.path, l]))
    expect(byPath.r!.type).toBe('redirect')
    expect(byPath.i!.type).toBe('file')
    expect(byPath.a!.type).toBe('file')
    expect((byPath.a as FileLink).providerUrls).toEqual({
      catbox: 'https://files.catbox.moe/y.bin',
    })
  })

  test('does not expose inline file blobs in the listing but does include inline in locations', async () => {
    await createLink(env.DB, {
      path: 'i',
      type: 'file',
      contentType: 'text/plain',
      filename: 'hi.txt',
      download: false,
      providerUrls: {},
      locations: [],
    })
    await setFileBytes('i', new Uint8Array([1, 2, 3]))

    const [link] = await getLinks(env.DB)
    expect(link).toBeDefined()
    expect(link!.type).toBe('file')
    expect((link as { file?: unknown }).file).toBeUndefined()
    expect((link as FileLink).locations).toContain('inline')
  })
})

describe('deleteLink', () => {
  test('removes a link', async () => {
    await createLink(env.DB, {
      path: 'g',
      type: 'redirect',
      url: 'https://example.com/',
      status: 302,
    })
    await deleteLink(env.DB, 'g')
    expect(await getLinkWithContent(env.DB, 'g')).toBeNull()
  })

  test('cascades to link_providers via foreign key', async () => {
    await createLink(env.DB, {
      path: 'a',
      type: 'file',
      contentType: 'application/octet-stream',
      filename: 'a.bin',
      download: false,
      providerUrls: {},
      locations: [],
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
