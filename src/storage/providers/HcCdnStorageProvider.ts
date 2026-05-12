import { AbstractStorageProvider } from '../AbstractStorageProvider'
import type { FileLink, LinkWithContent } from '../../../shared-types'
import { CombineStream } from '../../combineStream'

export class HcCdnStorageProvider extends AbstractStorageProvider {
  readonly id = 'hc-cdn'
  readonly name = 'Hack Club CDN'

  constructor(private readonly apiKey: string) {
    super()
  }

  has(link: LinkWithContent): boolean {
    return !!this.getUrl(link)
  }

  // Stored value is either a plain URL (old entries) or "{id}|{url}" (new entries).
  override getUrl(link: LinkWithContent): string | undefined {
    const stored = super.getUrl(link)
    if (!stored) return undefined
    const pipe = stored.indexOf('|')
    return pipe === -1 ? stored : stored.slice(pipe + 1)
  }

  async upload(
    file: ReadableStream<Uint8Array>,
    filename: string,
    length: number,
    linkPath: string,
    db: D1Database
  ): Promise<void> {
    const boundary = '-'.repeat(20) + Math.random().toFixed(20).slice(2)
    const prefix =
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`.replaceAll(
        /\r?\n/g,
        '\r\n'
      )
    const suffix = `\r\n--${boundary}--\r\n`

    const body = CombineStream([prefix, { stream: file, length }, suffix])

    const response = await fetch('https://cdn.hackclub.com/api/v4/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body,
    })

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      throw new Error(
        `Hack Club CDN upload failed (${response.status}): ${text}`
      )
    }

    const data = (await response.json()) as { id: string; url: string }
    if (!data.id || !data.url) {
      throw new Error('Hack Club CDN upload: missing id or url in response')
    }

    await db
      .prepare(
        'INSERT INTO link_providers (path, provider_id, url) VALUES (?, ?, ?) ON CONFLICT (path, provider_id) DO UPDATE SET url = excluded.url'
      )
      .bind(linkPath, this.id, `${data.id}|${data.url}`)
      .run()
  }

  async delete(link: LinkWithContent): Promise<void> {
    if (link.type !== 'file') return
    const stored = (link as FileLink).providerUrls[this.id]
    if (!stored) return
    const pipe = stored.indexOf('|')
    if (pipe === -1) return // old plain-URL entry, no ID available
    const id = stored.slice(0, pipe)
    try {
      await fetch(`https://cdn.hackclub.com/api/v4/upload/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })
    } catch (error) {
      console.error(`Hack Club CDN delete failed for id ${id}:`, error)
    }
  }

  async download(
    link: LinkWithContent,
    requestHeaders: Headers
  ): Promise<Response | null> {
    const url = this.getUrl(link)
    if (!url) return null
    const response = await fetch(url, { headers: requestHeaders })
    if (!response.ok) {
      console.error(
        `Hack Club CDN download failed (${response.status}): ${url}`
      )
      return null
    }
    return response
  }
}
