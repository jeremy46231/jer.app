import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { createLink } from '../../src/db'
import type { AbstractStorageProvider } from '../../src/storage/AbstractStorageProvider'
import { CatboxStorageProvider } from '../../src/storage/providers/CatboxStorageProvider'
import { GofileStorageProvider } from '../../src/storage/providers/GofileStorageProvider'
import { HcCdnStorageProvider } from '../../src/storage/providers/HcCdnStorageProvider'
import { LitterboxStorageProvider } from '../../src/storage/providers/LitterboxStorageProvider'
import type { AttachmentFileLink, LinkWithContent } from '../../shared-types'
import { createTestEnv, type TestEnv } from '../helpers/env'
import {
  networkEnabled,
  readStream,
  SMALL_PAYLOAD,
  streamFromBuffer,
} from '../helpers/network'

/**
 * These tests hit live third-party APIs (Catbox, Litterbox, Gofile, Hack Club
 * CDN). They are gated behind the `TEST_NETWORK=1` env var so the default
 * `bun test` run stays hermetic and offline-friendly.
 *
 * Use `bun run test:all` (or `TEST_NETWORK=1 bun test`) to enable them.
 */

let env: TestEnv

beforeEach(() => {
  env = createTestEnv()
})

afterEach(() => {
  env.__close()
})

async function loadProviderUrls(path: string): Promise<Record<string, string>> {
  const result = await env.DB.prepare(
    'SELECT provider_id, url FROM link_providers WHERE path = ?'
  )
    .bind(path)
    .all<{ provider_id: string; url: string }>()
  const out: Record<string, string> = {}
  for (const row of result.results) out[row.provider_id] = row.url
  return out
}

interface ProviderCase {
  name: string
  provider: AbstractStorageProvider
  /** A regex the upload result URL must match. */
  urlPattern: RegExp
  /** Skip the round-trip download check (useful when the public download is
   *  paywalled / redirect-only). */
  skipDownloadCheck?: boolean
  /** Skip uploads (useful for providers whose upload endpoint is broken). */
  skipUpload?: boolean
}

const cases: ProviderCase[] = [
  {
    name: 'Catbox',
    provider: new CatboxStorageProvider(),
    urlPattern: /^https:\/\/files\.catbox\.moe\//,
  },
  {
    name: 'Litterbox',
    provider: new LitterboxStorageProvider(),
    urlPattern: /^https:\/\/litter\.catbox\.moe\//,
  },
  {
    name: 'Gofile',
    provider: new GofileStorageProvider(),
    urlPattern: /^https?:\/\/(?:[^/]+\.)?gofile\.io\//,
    skipDownloadCheck: true, // requires premium / public download is a redirect
  },
  {
    name: 'Hack Club CDN',
    provider: new HcCdnStorageProvider(),
    urlPattern: /^https:\/\/hc-cdn\.hel1\.your-objectstorage\.com\//,
    skipUpload: true, // upload endpoint marked broken in providers.ts
  },
]

for (const tc of cases) {
  describe.skipIf(!networkEnabled)(`${tc.name} round trip (network)`, () => {
    test.skipIf(!!tc.skipUpload)(
      'uploads a small file and records a URL',
      async () => {
        const path = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        await createLink(env.DB, {
          path,
          type: 'attachment_file',
          contentType: 'application/octet-stream',
          filename: 'jer-app-test.txt',
          download: false,
          providerUrls: {},
        })

        await tc.provider.upload(
          streamFromBuffer(SMALL_PAYLOAD),
          'jer-app-test.txt',
          SMALL_PAYLOAD.byteLength,
          path,
          env.DB
        )

        const urls = await loadProviderUrls(path)
        expect(urls[tc.provider.id]).toBeDefined()
        expect(urls[tc.provider.id]!).toMatch(tc.urlPattern)
      },
      60_000
    )

    test.skipIf(!!tc.skipUpload || !!tc.skipDownloadCheck)(
      'downloads return the same bytes that were uploaded',
      async () => {
        const path = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        await createLink(env.DB, {
          path,
          type: 'attachment_file',
          contentType: 'application/octet-stream',
          filename: 'jer-app-test.txt',
          download: false,
          providerUrls: {},
        })

        await tc.provider.upload(
          streamFromBuffer(SMALL_PAYLOAD),
          'jer-app-test.txt',
          SMALL_PAYLOAD.byteLength,
          path,
          env.DB
        )

        const urls = await loadProviderUrls(path)
        const link: LinkWithContent = {
          path,
          type: 'attachment_file',
          contentType: 'application/octet-stream',
          filename: 'jer-app-test.txt',
          download: false,
          providerUrls: urls,
        } satisfies AttachmentFileLink

        const res = await tc.provider.download(link, new Headers())
        expect(res).not.toBeNull()
        expect(res!.ok).toBe(true)
        const body = await readStream(res!.body as ReadableStream<Uint8Array>)
        expect(Array.from(body)).toEqual(Array.from(SMALL_PAYLOAD))
      },
      60_000
    )
  })
}
