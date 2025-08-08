import { AbstractStorageProvider } from '../AbstractStorageProvider'
import type { LinkWithContent, AttachmentFileLink } from '../../../shared-types'
import { Base64EncodeStream } from '../../base64EncodeStream'
import { CombineStream } from '../../combineStream'

export class HcCdnStorageProvider extends AbstractStorageProvider {
  readonly id = 'hc-cdn'
  readonly name = 'Hack Club CDN'

  has(link: LinkWithContent): boolean {
    return (
      link.type === 'attachment_file' && !!(link as AttachmentFileLink).hcCdnUrl
    )
  }

  async upload(
    file: ReadableStream<Uint8Array>,
    filename: string,
    length: number,
    linkPath: string,
    db: D1Database
  ): Promise<void> {
    try {
      const prefix = '["data:application/octet-stream;base64,'
      const base64Stream = file.pipeThrough(new Base64EncodeStream())
      const suffix = `"]`

      const combinedStream = CombineStream([
        prefix,
        { stream: base64Stream, length: length },
        suffix,
      ])

      const response = await fetch('https://cdn.hackclub.com/api/v3/new', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer beans', // yep, that's the token
          'Content-Type': 'application/json',
          'User-Agent': 'jeremy46231/jer.app (https://jeremywoolley.com)',
        },
        body: combinedStream,
      })

      if (!response.ok) {
        try {
          const text = await response.text()
          throw new Error(
            `Failed to upload file: ${response.status} ${response.statusText} - ${text}`
          )
        } catch {
          throw new Error(
            `Failed to upload file: ${response.status} ${response.statusText}`
          )
        }
      }

      const data = (await response.json()) as {
        files: {
          deployedUrl: string
          file: string
          sha: string
          size: number
        }[]
        cdnBase: string
      }

      const deployedUrl = data.files[0].deployedUrl
      if (!deployedUrl) {
        throw new Error(
          'Invalid response from Hack Club CDN: missing deployedUrl'
        )
      }

      // Update the database with the Hack Club CDN URL
      await db
        .prepare('UPDATE links SET hc_cdn_url = ? WHERE path = ?')
        .bind(deployedUrl, linkPath)
        .run()
    } catch (error) {
      console.error('Hack Club CDN upload failed:', error)
      throw error
    }
  }

  async download(
    link: LinkWithContent,
    requestHeaders: Headers
  ): Promise<Response | null> {
    try {
      const attachmentLink = link as AttachmentFileLink
      const url = attachmentLink.hcCdnUrl
      if (!url) {
        return null
      }

      // HC CDN files can be downloaded directly
      const fileResponse = await fetch(url, {
        headers: requestHeaders,
      })

      if (!fileResponse.ok) {
        console.error(
          `Failed to download from Hack Club CDN: ${fileResponse.statusText}`
        )
        return null
      }

      return fileResponse
    } catch (error) {
      console.error('Hack Club CDN download failed:', error)
      return null
    }
  }
}
