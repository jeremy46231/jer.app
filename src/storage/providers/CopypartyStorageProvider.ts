import { AbstractStorageProvider } from '../AbstractStorageProvider'
import type { LinkWithContent } from '../../../shared-types'

export interface CopypartyBackendConfig {
  id: string
  name: string
  baseUrl: string
  username: string
  password: string
}

export class CopypartyStorageProvider extends AbstractStorageProvider {
  readonly id: string
  readonly name: string
  private readonly config: CopypartyBackendConfig

  constructor(config: CopypartyBackendConfig) {
    super()
    this.id = config.id
    this.name = config.name
    this.config = config
  }

  has(link: LinkWithContent): boolean {
    return !!this.getUrl(link)
  }

  async upload(
    file: ReadableStream<Uint8Array>,
    filename: string,
    length: number,
    linkPath: string,
    db: D1Database
  ): Promise<void> {
    const dateFilename = `${new Date().toISOString()}-${filename}`
    const uploadUrl = `${this.config.baseUrl}${encodeURIComponent(dateFilename)}?j&replace=1`
    const auth = btoa(`${this.config.username}:${this.config.password}`)

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(length),
      },
      body: file,
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Copyparty upload failed (${response.status}): ${body}`)
    }

    const storedUrl = `${this.config.baseUrl}${encodeURIComponent(dateFilename)}`
    await db
      .prepare(
        'INSERT INTO link_providers (path, provider_id, url) VALUES (?, ?, ?) ON CONFLICT (path, provider_id) DO UPDATE SET url = excluded.url'
      )
      .bind(linkPath, this.id, storedUrl)
      .run()
  }

  async delete(link: LinkWithContent): Promise<void> {
    const url = this.getUrl(link)
    if (!url) return
    const auth = btoa(`${this.config.username}:${this.config.password}`)
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: { Authorization: `Basic ${auth}` },
      })
      if (!response.ok) {
        console.error(`Copyparty delete failed (${response.status}): ${url}`)
      }
    } catch (error) {
      console.error(`Copyparty delete failed for ${url}:`, error)
    }
  }

  async download(
    link: LinkWithContent,
    requestHeaders: Headers
  ): Promise<Response | null> {
    const url = this.getUrl(link)
    if (!url) return null

    const auth = btoa(`${this.config.username}:${this.config.password}`)
    const headers = new Headers(requestHeaders)
    headers.set('Authorization', `Basic ${auth}`)

    const response = await fetch(url, { headers })
    if (!response.ok) {
      console.error(`Copyparty download failed (${response.status}): ${url}`)
      return null
    }
    return response
  }
}
