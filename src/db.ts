type GenericLink = {
  path: string
}
export type RedirectLink = GenericLink & {
  type: 'redirect'
  url: string
}
export type InlineFileLink = GenericLink & {
  type: 'inline_file'
  contentType: string
  filename: string
}
export type AttachmentFileLink = GenericLink & {
  type: 'attachment_file'
  contentType: string
  filename: string
}
export type Link = RedirectLink | InlineFileLink | AttachmentFileLink

// Full link types with file content - used only when storing/retrieving complete file data
export type InlineFileLinkWithContent = InlineFileLink & {
  file: Uint8Array
}
export type AttachmentFileLinkWithContent = AttachmentFileLink & {
  file: Uint8Array
}
export type LinkWithContent =
  | RedirectLink
  | InlineFileLinkWithContent
  | AttachmentFileLinkWithContent

export async function getLinks(db: D1Database): Promise<Link[]> {
  const result = await db
    .prepare(
      `
    SELECT path, type, url, content_type, filename
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
        } satisfies InlineFileLink

      case 'attachment_file':
        return {
          ...generalAttributes,
          type: 'attachment_file',
          contentType: row.content_type!,
          filename: row.filename!,
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
    SELECT path, type, url, file, content_type, filename
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
      } satisfies InlineFileLinkWithContent

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
    const redirectData = linkData
    await db
      .prepare(
        `
        INSERT INTO links (path, type, url)
        VALUES (?, ?, ?)
      `
      )
      .bind(path, type, redirectData.url)
      .run()
  } else if (type === 'inline_file' || type === 'attachment_file') {
    const fileData = linkData as
      | InlineFileLinkWithContent
      | AttachmentFileLinkWithContent
    await db
      .prepare(
        `
        INSERT INTO links (path, type, file, content_type, filename)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .bind(path, type, fileData.file, fileData.contentType, fileData.filename)
      .run()
  } else {
    throw new Error(`Unsupported link type: ${type}`)
  }
}
