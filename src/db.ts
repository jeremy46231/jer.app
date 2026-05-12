import type {
  Link,
  LinkWithContent,
  RedirectLink,
  FileLink,
  FileLinkWithContent,
} from '../shared-types'

type GenericLink = {
  path: string
}

export async function getLinks(db: D1Database): Promise<Link[]> {
  const result = await db
    .prepare(
      `
        SELECT l.path, l.type, l.redirect_url, l.redirect_status, l.content_type, l.filename, l.download,
               CASE WHEN l.file IS NOT NULL AND length(l.file) > 0 THEN 1 ELSE 0 END AS has_inline,
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
    has_inline: number
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

      case 'file': {
        const providerUrls: Record<string, string> = row.provider_urls
          ? JSON.parse(row.provider_urls)
          : {}
        const externalKeys = Object.keys(providerUrls)
        const locations = row.has_inline
          ? ['inline', ...externalKeys]
          : externalKeys
        return {
          ...generalAttributes,
          type: 'file',
          providerUrls,
          locations,
          contentType: row.content_type!,
          filename: row.filename!,
          download: !!row.download,
        } satisfies FileLink
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
               CASE WHEN l.file IS NOT NULL AND length(l.file) > 0 THEN 1 ELSE 0 END AS has_inline,
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
    has_inline: number
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

    case 'file': {
      const providerUrls: Record<string, string> = row.provider_urls
        ? JSON.parse(row.provider_urls)
        : {}
      const externalKeys = Object.keys(providerUrls)
      const locations = row.has_inline
        ? ['inline', ...externalKeys]
        : externalKeys
      const file =
        row.has_inline && row.file ? new Uint8Array(row.file) : undefined
      return {
        ...generalAttributes,
        type: 'file',
        providerUrls,
        locations,
        contentType: row.content_type!,
        filename: row.filename!,
        download: !!row.download,
        file,
      } satisfies FileLinkWithContent
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
               CASE WHEN l.file IS NOT NULL AND length(l.file) > 0 THEN 1 ELSE 0 END AS has_inline,
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
    has_inline: number
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
    case 'file': {
      const providerUrls: Record<string, string> = row.provider_urls
        ? JSON.parse(row.provider_urls)
        : {}
      const externalKeys = Object.keys(providerUrls)
      const locations = row.has_inline
        ? ['inline', ...externalKeys]
        : externalKeys
      const file =
        row.has_inline && row.file ? new Uint8Array(row.file) : undefined
      link = {
        ...generalAttributes,
        type: 'file',
        providerUrls,
        locations,
        contentType: row.content_type!,
        filename: row.filename!,
        download: !!row.download,
        file,
      } satisfies FileLinkWithContent
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
  } else if (type === 'file') {
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

export async function updateLink(
  db: D1Database,
  oldPath: string,
  data: Link
): Promise<void> {
  const newPath = data.path

  if (data.type === 'redirect') {
    await db
      .prepare(
        'UPDATE links SET path = ?, redirect_url = ?, redirect_status = ? WHERE path = ?'
      )
      .bind(newPath, data.url, data.status ?? 302, oldPath)
      .run()
  } else {
    await db
      .prepare(
        'UPDATE links SET path = ?, type = ?, content_type = ?, filename = ?, download = ? WHERE path = ?'
      )
      .bind(
        newPath,
        data.type,
        data.contentType,
        data.filename,
        data.download,
        oldPath
      )
      .run()
  }
}

export async function deleteLink(db: D1Database, path: string): Promise<void> {
  await db.prepare('DELETE FROM links WHERE path = ?').bind(path).run()
}
