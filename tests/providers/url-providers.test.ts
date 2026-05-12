import { describe, expect, test } from 'bun:test'
import type { AbstractStorageProvider } from '../../src/storage/AbstractStorageProvider'
import { CatboxStorageProvider } from '../../src/storage/providers/CatboxStorageProvider'
import { HcCdnStorageProvider } from '../../src/storage/providers/HcCdnStorageProvider'
import { LitterboxStorageProvider } from '../../src/storage/providers/LitterboxStorageProvider'

/**
 * Unit tests that don't hit the network for the URL-backed providers
 * (Catbox / Litterbox / HC CDN). The actual upload + download paths are
 * exercised in `network.test.ts` under the `TEST_NETWORK=1` flag.
 */

const providers: { name: string; provider: AbstractStorageProvider }[] = [
  { name: 'CatboxStorageProvider', provider: new CatboxStorageProvider() },
  {
    name: 'LitterboxStorageProvider',
    provider: new LitterboxStorageProvider(),
  },
  { name: 'HcCdnStorageProvider', provider: new HcCdnStorageProvider() },
]

for (const { name, provider } of providers) {
  describe(name, () => {
    test('exposes id and human-readable name', () => {
      expect(provider.id).toBeTruthy()
      expect(provider.name).toBeTruthy()
    })

    test('has() is true when its provider URL is stored', () => {
      expect(
        provider.has({
          path: 'p',
          type: 'file',
          contentType: 'application/octet-stream',
          filename: 'x',
          download: false,
          providerUrls: { [provider.id]: 'https://example.com/file' },
          locations: [provider.id],
        })
      ).toBe(true)
    })

    test('has() is false when no provider URL is stored', () => {
      expect(
        provider.has({
          path: 'p',
          type: 'file',
          contentType: 'application/octet-stream',
          filename: 'x',
          download: false,
          providerUrls: {},
          locations: [],
        })
      ).toBe(false)
    })

    test('has() is false for non-file links', () => {
      expect(
        provider.has({
          path: 'p',
          type: 'redirect',
          url: 'https://x',
          status: 302,
        })
      ).toBe(false)
    })

    test('download() returns null when no provider URL is stored', async () => {
      const res = await provider.download(
        {
          path: 'p',
          type: 'file',
          contentType: 'application/octet-stream',
          filename: 'x',
          download: false,
          providerUrls: {},
          locations: [],
        },
        new Headers()
      )
      expect(res).toBeNull()
    })
  })
}
