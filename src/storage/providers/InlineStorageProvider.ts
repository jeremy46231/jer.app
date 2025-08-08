import { AbstractStorageProvider } from '../AbstractStorageProvider'
import type {
  LinkWithContent,
  InlineFileLinkWithContent,
} from '../../../shared-types'

export class InlineStorageProvider extends AbstractStorageProvider {
  readonly id = 'inline'
  readonly name = 'Database (Inline)'

  has(link: LinkWithContent): boolean {
    return (
      link.type === 'inline_file' && !!(link as InlineFileLinkWithContent).file
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
      // Read the stream into a Uint8Array
      const reader = file.getReader()
      const chunks: Uint8Array[] = []
      let totalLength = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        totalLength += value.length
      }

      // Combine all chunks into a single Uint8Array
      const fileData = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        fileData.set(chunk, offset)
        offset += chunk.length
      }

      // Update the database with the file data
      await db
        .prepare('UPDATE links SET file = ? WHERE path = ?')
        .bind(fileData, linkPath)
        .run()
    } catch (error) {
      console.error('Inline storage upload failed:', error)
      throw error
    }
  }

  // TODO: Obey request headers for partial content, etc.
  async download(
    link: LinkWithContent,
    requestHeaders: Headers
  ): Promise<Response | null> {
    try {
      if (link.type !== 'inline_file') {
        return null
      }

      const inlineLink = link as InlineFileLinkWithContent
      if (!inlineLink.file || inlineLink.file.length === 0) {
        return null
      }

      // Create a response with the file data
      const headers = new Headers()
      headers.set('Content-Type', inlineLink.contentType)
      headers.set('Content-Length', inlineLink.file.length.toString())

      if (inlineLink.download) {
        headers.set(
          'Content-Disposition',
          `attachment; filename="${inlineLink.filename}"`
        )
      } else {
        headers.set(
          'Content-Disposition',
          `inline; filename="${inlineLink.filename}"`
        )
      }

      return new Response(inlineLink.file, {
        status: 200,
        headers,
      })
    } catch (error) {
      console.error('Inline storage download failed:', error)
      return null
    }
  }
}
