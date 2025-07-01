import type {
  Link,
  LinkWithContent,
  RedirectLink,
  InlineFileLink,
  InlineFileLinkWithContent,
  AttachmentFileLink
} from '../shared-types'

type GenericLink = {
  path: string
}

export async function getLinks(db: D1Database): Promise<Link[]> {
  const result = await db
    .prepare(
      `
    SELECT path, type, url, content_type, filename, download
    FROM links
  `
    )
    .all()

  const rows = result.results as {
    path: string
    type: string
    url?: string
    content_type?: string
    filename?: string
    download?: boolean
  }[]

  return rows.map((row) => {
    const generalAttributes = {
      path: row.path,
    } satisfies GenericLink

    switch (row.type) {
      case 'redirect':
        return {
          ...generalAttributes,
          type: 'redirect',
          url: row.url!,
        } satisfies RedirectLink

      case 'inline_file':
        return {
          ...generalAttributes,
          type: 'inline_file',
          contentType: row.content_type!,
          filename: row.filename!,
          download: row.download!,
        } satisfies InlineFileLink

      case 'attachment_file':
        return {
          ...generalAttributes,
          type: 'attachment_file',
          url: row.url!,
          contentType: row.content_type!,
          filename: row.filename!,
          download: row.download!,
        } satisfies AttachmentFileLink

      default:
        throw new Error(`Unknown link type: ${row.type}`)
    }
  })
}

export async function getLinkWithContent(
  db: D1Database,
  path: string
): Promise<LinkWithContent | null> {
  const result = await db
    .prepare(
      `
    SELECT path, type, url, file, content_type, filename, download
    FROM links
    WHERE path = ?
  `
    )
    .bind(path)
    .first()

  if (!result) return null

  const row = result as {
    path: string
    type: string
    url?: string
    file?: ArrayBuffer
    content_type?: string
    filename?: string
    download?: boolean
  }

  const generalAttributes = {
    path: row.path,
  } satisfies GenericLink

  switch (row.type) {
    case 'redirect':
      return {
        ...generalAttributes,
        type: 'redirect',
        url: row.url!,
      } satisfies RedirectLink

    case 'inline_file':
      return {
        ...generalAttributes,
        type: 'inline_file',
        contentType: row.content_type!,
        filename: row.filename!,
        file: row.file ? new Uint8Array(row.file) : new Uint8Array(),
        download: row.download!,
      } satisfies InlineFileLinkWithContent

    case 'attachment_file':
      return {
        ...generalAttributes,
        type: 'attachment_file',
        url: row.url!,
        contentType: row.content_type!,
        filename: row.filename!,
        download: row.download!,
      } satisfies AttachmentFileLink

    default:
      throw new Error(`Unknown link type: ${row.type}`)
  }
}

export async function createLink(
  db: D1Database,
  linkData: LinkWithContent
): Promise<void> {
  const { path, type } = linkData

  if (type === 'redirect') {
    await db
      .prepare(
        `
          INSERT INTO links (path, type, url)
          VALUES (?, ?, ?)
        `
      )
      .bind(path, type, linkData.url)
      .run()
  } else if (type === 'inline_file') {
    await db
      .prepare(
        `
          INSERT INTO links (path, type, file, content_type, filename, download)
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        path,
        type,
        linkData.file,
        linkData.contentType,
        linkData.filename,
        linkData.download
      )
      .run()
  } else if (type === 'attachment_file') {
    await db
      .prepare(
        `
          INSERT INTO links (path, type, url, content_type, filename, download)
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .bind(
        path,
        type,
        linkData.url,
        linkData.contentType,
        linkData.filename,
        linkData.download
      )
      .run()
  } else {
    throw new Error(`Unsupported link type: ${type}`)
  }
}

export async function deleteLink(db: D1Database, path: string): Promise<void> {
  await db.prepare('DELETE FROM links WHERE path = ?').bind(path).run()
}
