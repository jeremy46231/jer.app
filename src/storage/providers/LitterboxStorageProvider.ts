import { AbstractStorageProvider } from '../AbstractStorageProvider'
import type { LinkWithContent, AttachmentFileLink } from '../../../shared-types'
import { CombineStream } from '../../combineStream'

export class LitterboxStorageProvider extends AbstractStorageProvider {
  readonly id = 'litterbox'
  readonly name = 'Litterbox'

  has(link: LinkWithContent): boolean {
    return link.type === 'attachment_file' && !!(link as AttachmentFileLink).litterboxUrl
  }

  async upload(
    file: ReadableStream<Uint8Array>,
    filename: string,
    length: number,
    linkPath: string,
    db: D1Database
  ): Promise<void> {
    try {
      const boundary = '-'.repeat(20) + Math.random().toFixed(20).slice(2)

      const prefix = `--${boundary}
Content-Disposition: form-data; name="reqtype"

fileupload
--${boundary}
Content-Disposition: form-data; name="time"

72h
--${boundary}
Content-Disposition: form-data; name="fileToUpload"; filename="${filename}"
Content-Type: application/octet-stream

`.replaceAll(/\r?\n/g, '\r\n')
      const suffix = `\r\n--${boundary}--\r\n`

      const combinedStream = CombineStream([
        prefix,
        { stream: file, length },
        suffix,
      ])

      const request = new Request(
        'https://litterbox.catbox.moe/resources/internals/api.php',
        {
          method: 'POST',
          headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'User-Agent': 'jeremy46231/jer.app (https://jeremywoolley.com)',
          },
          body: combinedStream,
        }
      )

      console.log('Uploading to Litterbox:', request.url)
      const response = await fetch(request)
      if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.statusText}`)
      }

      const link = await response.text()
      if (!link.startsWith('https://litter.catbox.moe/')) {
        throw new Error('Invalid response from Litterbox')
      }

      // Update the database with the Litterbox URL
      await db.prepare('UPDATE links SET litterbox_url = ? WHERE path = ?')
        .bind(link, linkPath)
        .run()
    } catch (error) {
      console.error('Litterbox upload failed:', error)
      throw error
    }
  }

  async download(
    link: LinkWithContent,
    requestHeaders: Headers
  ): Promise<Response | null> {
    try {
      const attachmentLink = link as AttachmentFileLink
      const url = attachmentLink.litterboxUrl
      if (!url) {
        return null
      }

      // Litterbox files can be downloaded directly
      const fileResponse = await fetch(url, {
        headers: requestHeaders,
      })

      if (!fileResponse.ok) {
        console.error(`Failed to download from Litterbox: ${fileResponse.statusText}`)
        return null
      }

      return fileResponse
    } catch (error) {
      console.error('Litterbox download failed:', error)
      return null
    }
  }
}
