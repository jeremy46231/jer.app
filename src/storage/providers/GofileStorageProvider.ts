import { AbstractStorageProvider } from '../AbstractStorageProvider'
import type { LinkWithContent, AttachmentFileLink } from '../../../shared-types'
import { CombineStream } from '../../combineStream'

export class GofileStorageProvider extends AbstractStorageProvider {
  readonly id = 'gofile'
  readonly name = 'Gofile'

  has(link: LinkWithContent): boolean {
    return link.type === 'attachment_file' && !!(link as AttachmentFileLink).gofileUrl
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
Content-Disposition: form-data; name="file"; filename="${filename}"
Content-Type: application/octet-stream

`.replaceAll(/\r?\n/g, '\r\n')
      const suffix = `\r\n--${boundary}--\r\n`

      const combinedStream = CombineStream([
        prefix,
        { stream: file, length },
        suffix,
      ])

      const request = new Request('https://upload.gofile.io/uploadFile', {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: combinedStream,
      })

      console.log('Uploading to Gofile:', request.url)
      const response = await fetch(request)
      if (!response.ok) {
        throw new Error(`Failed to upload file: ${response.statusText}`)
      }

      const json = (await response.json()) as any
      const downloadPage = json?.data?.downloadPage
      if (typeof downloadPage !== 'string') {
        throw new Error('Invalid response from Gofile: missing downloadPage')
      }

      // Update the database with the Gofile URL
      await db.prepare('UPDATE links SET gofile_url = ? WHERE path = ?')
        .bind(downloadPage, linkPath)
        .run()
    } catch (error) {
      console.error('Gofile upload failed:', error)
      throw error
    }
  }

  async download(
    link: LinkWithContent,
    requestHeaders: Headers
  ): Promise<Response | null> {
    try {
      const attachmentLink = link as AttachmentFileLink
      const url = attachmentLink.gofileUrl
      if (!url) {
        return null
      }

      // We must obtain a guest token from the accounts endpoint,
      // then use that token and the webToken from the global.js script
      // to access the contents route. Accessing the contents route
      // with a token also authorizes that token to download the file
      // from the direct link.

      const folderCode = url.replace('https://gofile.io/d/', '')

      const accountsResponse = await fetch('https://api.gofile.io/accounts', {
        method: 'POST',
      })
      if (!accountsResponse.ok) {
        console.error(`Failed to get Gofile account token: ${accountsResponse.statusText}`)
        return null
      }
      const accountsJson = (await accountsResponse.json()) as any
      const token = accountsJson?.data?.token
      if (typeof token !== 'string') {
        console.error('Invalid response from Gofile: missing token')
        return null
      }

      const script = await (
        await fetch('https://gofile.io/dist/js/global.js')
      ).text()
      const webToken = script.match(/appdata\.wt = "([^\n"]+)"/)?.[1]
      if (!webToken) {
        console.error('Failed to extract web token from Gofile script')
        return null
      }

      const contentsURL = `https://api.gofile.io/contents/${folderCode}?wt=${webToken}`
      const contentsResult = await fetch(contentsURL, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!contentsResult.ok) {
        console.error(`Failed to get Gofile contents: ${contentsResult.statusText}`)
        return null
      }

      const contentsJson = (await contentsResult.json()) as any
      const files = contentsJson?.data?.children
      if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
        console.error('No files found in Gofile contents')
        return null
      }
      const firstFile = Object.values(files)[0] as any
      if (!firstFile || !firstFile.link) {
        console.error('No valid file link found in Gofile contents')
        return null
      }
      const downloadUrl = firstFile.link as string

      const downloadHeaders = new Headers(requestHeaders)
      downloadHeaders.set('Cookie', `accountToken=${token}`)
      const fileResponse = await fetch(downloadUrl, {
        headers: downloadHeaders,
      })

      return fileResponse
    } catch (error) {
      console.error('Gofile download failed:', error)
      return null
    }
  }
}
