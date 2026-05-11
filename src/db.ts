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
        SELECT l.path, l.type, l.redirect_url, l.redirect_status, l.content_type, l.filename, l.download,
               json_group_object(lp.provider_id, lp.url) FILTER (WHERE lp.provider_id IS NOT NULL) AS provider_urls
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
    redirect_status?: number
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
          status: (row.redirect_status ?? 302) as RedirectLink['status'],
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
        SELECT l.path, l.type, l.redirect_url, l.redirect_status, l.file, l.content_type, l.filename, l.download,
               json_group_object(lp.provider_id, lp.url) FILTER (WHERE lp.provider_id IS NOT NULL) AS provider_urls
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
    redirect_status?: number
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
        status: (row.redirect_status ?? 302) as RedirectLink['status'],
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

export type FoundLink = { link: LinkWithContent; remainder: string }

export async function findLink(
  db: D1Database,
  requestPath: string
): Promise<FoundLink | null> {
  const result = await db
    .prepare(
      `
        SELECT l.path, l.type, l.redirect_url, l.redirect_status, l.file, l.content_type, l.filename, l.download,
               json_group_object(lp.provider_id, lp.url) FILTER (WHERE lp.provider_id IS NOT NULL) AS provider_urls
        FROM links l
        LEFT JOIN link_providers lp ON lp.path = l.path
        WHERE ?1 = l.path OR (?1 GLOB l.path || '/*' AND l.type = 'redirect')
        GROUP BY l.path
        ORDER BY length(l.path) DESC
        LIMIT 1
      `
    )
    .bind(requestPath)
    .first()

  if (!result) return null

  const row = result as {
    path: string
    type: string
    redirect_url?: string
    redirect_status?: number
    file?: ArrayBuffer
    content_type?: string
    filename?: string
    download?: boolean
    provider_urls: string | null
  }

  const remainder = requestPath.slice(row.path.length)

  const generalAttributes = { path: row.path } satisfies GenericLink

  let link: LinkWithContent
  switch (row.type) {
    case 'redirect':
      link = {
        ...generalAttributes,
        type: 'redirect',
        url: row.redirect_url!,
        status: (row.redirect_status ?? 302) as RedirectLink['status'],
      } satisfies RedirectLink
      break
    case 'inline_file':
      link = {
        ...generalAttributes,
        type: 'inline_file',
        contentType: row.content_type!,
        filename: row.filename!,
        file: row.file ? new Uint8Array(row.file) : new Uint8Array(),
        download: row.download!,
      } satisfies InlineFileLinkWithContent
      break
    case 'attachment_file': {
      const providerUrls: Record<string, string> = row.provider_urls
        ? JSON.parse(row.provider_urls)
        : {}
      link = {
        ...generalAttributes,
        type: 'attachment_file',
        providerUrls,
        locations: Object.keys(providerUrls),
        contentType: row.content_type!,
        filename: row.filename!,
        download: !!row.download,
      } satisfies AttachmentFileLink
      break
    }
    default:
      throw new Error(`Unknown link type: ${row.type}`)
  }

  return { link, remainder }
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
          INSERT INTO links (path, type, redirect_url, redirect_status)
          VALUES (?, ?, ?, ?)
        `
      )
      .bind(path, type, linkData.url, linkData.status ?? 302)
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
