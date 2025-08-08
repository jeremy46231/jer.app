import type { LinkWithContent } from '../../shared-types'

export abstract class AbstractStorageProvider {
  /** A unique identifier for the provider (e.g., 'gofile', 'inline'). */
  abstract readonly id: string

  /** A user-friendly name for the provider. */
  abstract readonly name: string

  /**
   * Checks if the given link record has a file stored with this provider.
   * @param link The link object from the database.
   */
  abstract has(link: LinkWithContent): boolean

  /**
   * Uploads a file and updates the corresponding database record with the result.
   * @param file A stream of the file content.
   * @param filename The name of the file.
   * @param length The total size of the file in bytes.
   * @param linkPath The unique path identifier for the link.
   * @param db A D1Database instance for database operations.
   */
  abstract upload(
    file: ReadableStream<Uint8Array>,
    filename: string,
    length: number,
    linkPath: string,
    db: D1Database
  ): Promise<void>

  /**
   * Retrieves the file and returns a complete Response object.
   * @param link The link object from the database.
   * @param requestHeaders The headers from the original incoming request.
   * @returns A Response object on success, or null on failure.
   */
  abstract download(
    link: LinkWithContent,
    requestHeaders: Headers
  ): Promise<Response | null>
}
