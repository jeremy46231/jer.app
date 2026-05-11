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
        SELECT l.path, l.type, l.redirect_url, l.content_type, l.filename, l.download,
               json_group_object(lp.provider_id, lp.url) AS provider_urls
        FROM links l
        LEFT JOIN link_providers lp ON lp.path = l.path
        GROUP BY l.path
      `
    )
    .all()

  const rows = result.results as {
    path: string
    type: string
    redirect_url?: string
    content_type?: string
    filename?: string
    download?: boolean
    provider_urls: string | null
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

      case 'attachment_file': {
        const providerUrls: Record<string, string> = row.provider_urls
          ? JSON.parse(row.provider_urls)
          : {}
        return {
          ...generalAttributes,
          type: 'attachment_file',
          providerUrls,
          locations: Object.keys(providerUrls),
          contentType: row.content_type!,
          filename: row.filename!,
          download: !!row.download,
        } satisfies AttachmentFileLink
      }

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
        SELECT l.path, l.type, l.redirect_url, l.file, l.content_type, l.filename, l.download,
               json_group_object(lp.provider_id, lp.url) AS provider_urls
        FROM links l
        LEFT JOIN link_providers lp ON lp.path = l.path
        WHERE l.path = ?
        GROUP BY l.path
      `
    )
    .bind(path)
    .first()

  if (!result) return null

  const row = result as {
    path: string
    type: string
    redirect_url?: string
    file?: ArrayBuffer
    content_type?: string
    filename?: string
    download?: boolean
    provider_urls: string | null
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

    case 'attachment_file': {
      const providerUrls: Record<string, string> = row.provider_urls
        ? JSON.parse(row.provider_urls)
        : {}
      return {
        ...generalAttributes,
        type: 'attachment_file',
        providerUrls,
        locations: Object.keys(providerUrls),
        contentType: row.content_type!,
        filename: row.filename!,
        download: !!row.download,
      } satisfies AttachmentFileLink
    }

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
