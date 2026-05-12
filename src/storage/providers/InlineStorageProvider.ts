import { AbstractStorageProvider } from '../AbstractStorageProvider'
import type {
  LinkWithContent,
  FileLinkWithContent,
} from '../../../shared-types'

export class InlineStorageProvider extends AbstractStorageProvider {
  readonly id = 'inline'
  readonly name = 'Database (Inline)'

  has(link: LinkWithContent): boolean {
    return link.type === 'file' && !!(link as FileLinkWithContent).file?.length
  }

  async upload(
    file: ReadableStream<Uint8Array>,
    filename: string,
    length: number,
    linkPath: string,
    db: D1Database
  ): Promise<void> {
    try {
      const reader = file.getReader()
      const chunks: Uint8Array[] = []
      let totalLength = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        totalLength += value.length
      }

      const fileData = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        fileData.set(chunk, offset)
        offset += chunk.length
      }

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
      if (link.type !== 'file') return null

      const fileLink = link as FileLinkWithContent
      if (!fileLink.file?.length) return null

      const headers = new Headers()
      headers.set('Content-Type', fileLink.contentType)
      headers.set('Content-Length', fileLink.file.length.toString())
      headers.set(
        'Content-Disposition',
        `${fileLink.download ? 'attachment' : 'inline'}; filename="${fileLink.filename}"`
      )

      return new Response(fileLink.file, { status: 200, headers })
    } catch (error) {
      console.error('Inline storage download failed:', error)
      return null
    }
  }
}
