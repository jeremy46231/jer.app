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
  file: Uint8Array
  filename: string
}
export type AttachmentFileLink = GenericLink & {
  type: 'attachment_file'
  contentType: string
  file: Uint8Array
  filename: string
}
export type Link = RedirectLink | InlineFileLink | AttachmentFileLink

export async function getLinks(db: D1Database): Promise<Link[]> {
  const result = await db.prepare(`
    SELECT path, type, url, file, content_type, filename
    FROM links
  `).all()

  const rows = result.results as {
    path: string
    type: string
    url?: string
    file?: ArrayBuffer
    content_type?: string
    filename?: string
  }[]

  return rows.map(row => {
    const generalAttributes = {
      path: row.path
    } satisfies GenericLink

    switch (row.type) {
      case 'redirect':
        return {
          ...generalAttributes,
          type: 'redirect',
          url: row.url!
        } satisfies RedirectLink

      case 'inline_file':
        return {
          ...generalAttributes,
          type: 'inline_file',
          contentType: row.content_type!,
          filename: row.filename!,
          file: new Uint8Array(row.file!)
        } satisfies InlineFileLink

      case 'attachment_file':
        return {
          ...generalAttributes,
          type: 'attachment_file',
          contentType: row.content_type!,
          filename: row.filename!,
          file: new Uint8Array(row.file!)
        } satisfies AttachmentFileLink

      default:
        throw new Error(`Unknown link type: ${row.type}`)
    }
  })
}

export async function createLink(db: D1Database, linkData: Link): Promise<void> {
  const { path, type } = linkData

  if (type === 'redirect') {
    const redirectData = linkData
    await db.prepare(`
      INSERT INTO links (path, type, url)
      VALUES (?, ?, ?)
    `).bind(path, type, redirectData.url).run()
  } else if (type === 'inline_file') {
    const fileData = linkData
    await db.prepare(`
      INSERT INTO links (path, type, file, content_type, filename)
      VALUES (?, ?, ?, ?, ?)
    `).bind(path, type, fileData.file, fileData.contentType, fileData.filename).run()
  } else {
    throw new Error(`Unsupported link type: ${type}`)
  }
}