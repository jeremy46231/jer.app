import { describe, expect, test } from 'bun:test'
import { GofileStorageProvider } from '../../src/storage/providers/GofileStorageProvider'

describe('GofileStorageProvider', () => {
  const provider = new GofileStorageProvider()

  test('has() is true only when a file link has a stored gofile URL', () => {
    expect(
      provider.has({
        path: 'p',
        type: 'file',
        contentType: 'application/octet-stream',
        filename: 'x',
        download: false,
        providerUrls: { gofile: 'https://gofile.io/d/abc' },
        locations: ['gofile'],
      })
    ).toBe(true)

    expect(
      provider.has({
        path: 'p',
        type: 'file',
        contentType: 'application/octet-stream',
        filename: 'x',
        download: false,
        providerUrls: { catbox: 'https://files.catbox.moe/x' },
        locations: ['catbox'],
      })
    ).toBe(false)

    expect(
      provider.has({
        path: 'p',
        type: 'redirect',
        url: 'https://x',
        status: 302,
      })
    ).toBe(false)
  })

  test('download() returns null when there is no stored URL', async () => {
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

  test('download() returns a 302 redirect to the stored Gofile page', async () => {
    const url = 'https://gofile.io/d/example'
    const res = await provider.download(
      {
        path: 'p',
        type: 'file',
        contentType: 'application/octet-stream',
        filename: 'x',
        download: false,
        providerUrls: { gofile: url },
        locations: ['gofile'],
      },
      new Headers()
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(302)
    expect(res!.headers.get('Location')).toBe(url)
  })
})
