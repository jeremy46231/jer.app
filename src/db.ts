import type {
  Link,
  LinkWithContent,
  RedirectLink,
  InlineFileLink,
  InlineFileLinkWithContent,
  AttachmentFileLink,
} from '../shared-types'

type GenericLink = {
  path: string
}

export async function getLinks(db: D1Database): Promise<Link[]> {
  const result = await db
    .prepare(
      `
        SELECT path, type, redirect_url, gofile_url, catbox_url, litterbox_url, hc_cdn_url, content_type, filename, download
        FROM links
      `
    )
    .all()

  const rows = result.results as {
    path: string
    type: string
    redirect_url?: string
    gofile_url?: string
    catbox_url?: string
    litterbox_url?: string
    hc_cdn_url?: string
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
          url: row.redirect_url!,
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
        // Determine which locations have files
        const locations: string[] = []
        if (row.gofile_url) locations.push('gofile')
        if (row.catbox_url) locations.push('catbox')
        if (row.litterbox_url) locations.push('litterbox')
        if (row.hc_cdn_url) locations.push('hc-cdn')

        return {
          ...generalAttributes,
          type: 'attachment_file',
          gofileUrl: row.gofile_url,
          catboxUrl: row.catbox_url,
          litterboxUrl: row.litterbox_url,
          hcCdnUrl: row.hc_cdn_url,
          locations,
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
        SELECT path, type, redirect_url, gofile_url, catbox_url, litterbox_url, hc_cdn_url, file, content_type, filename, download
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
    redirect_url?: string
    gofile_url?: string
    catbox_url?: string
    litterbox_url?: string
    hc_cdn_url?: string
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
        url: row.redirect_url!,
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
        gofileUrl: row.gofile_url,
        catboxUrl: row.catbox_url,
        litterboxUrl: row.litterbox_url,
        hcCdnUrl: row.hc_cdn_url,
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
          INSERT INTO links (path, type, redirect_url)
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
          INSERT INTO links (path, type, content_type, filename, download)
          VALUES (?, ?, ?, ?, ?)
        `
      )
      .bind(
        path,
        type,
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
