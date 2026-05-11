import { findLink } from './db'
import { downloadPriority } from './storage/providers'

const MAX_REWRITES = 10

function mergeSearch(a: string, b: string): string {
  // a and b are either '' or start with '?'
  const pa = new URLSearchParams(a.slice(1))
  const pb = new URLSearchParams(b.slice(1))
  for (const [k, v] of pb) pa.append(k, v)
  const s = pa.toString()
  return s ? '?' + s : ''
}

function buildExternalUrl(target: string, remainder: string, search: string): string {
  const u = new URL(target)
  if (remainder) {
    u.pathname = u.pathname.replace(/\/$/, '') + remainder
  }
  const merged = mergeSearch(u.search, search)
  u.search = merged.slice(1) // URLSearchParams wants no leading '?'
  return u.toString()
}

export async function serveLink(
  request: Request<unknown, IncomingRequestCfProperties<unknown>>,
  env: Env
): Promise<Response | undefined> {
  const url = new URL(request.url)
  let currentPath = decodeURIComponent(url.pathname.slice(1))
  let currentSearch = url.search

  for (let depth = 0; depth < MAX_REWRITES; depth++) {
    const match = await findLink(env.DB, currentPath)
    if (!match) return undefined

    const { link, remainder } = match

    switch (link.type) {
      case 'redirect': {
        const target = link.url
        if (target.startsWith('/')) {
          // Internal rewrite: restart without sending an HTTP redirect
          const qIdx = target.indexOf('?', 1)
          const tPath = (qIdx === -1 ? target : target.slice(0, qIdx)).slice(1)
          const tSearch = qIdx === -1 ? '' : target.slice(qIdx)
          currentPath = tPath + remainder
          currentSearch = mergeSearch(tSearch, currentSearch)
          continue
        }
        return Response.redirect(
          buildExternalUrl(target, remainder, currentSearch),
          link.status
        )
      }

      case 'inline_file': {
        if (remainder !== '') return undefined
        const disposition = link.download ? 'attachment' : 'inline'
        return new Response(link.file, {
          headers: {
            'Content-Type': link.contentType,
            'Content-Disposition': `${disposition}; filename="${link.filename}"`,
          },
        })
      }

      case 'attachment_file': {
        if (remainder !== '') return undefined
        for (const provider of downloadPriority) {
          if (provider.has(link)) {
            try {
              console.log(`Attempting download from ${provider.name} (${provider.id})`)
              const response = await provider.download(link, request.headers)
              if (response) {
                const disposition = link.download ? 'attachment' : 'inline'
                const responseHeaders = new Headers(response.headers)
                responseHeaders.set('Content-Type', link.contentType)
                responseHeaders.set(
                  'Content-Disposition',
                  `${disposition}; filename="${link.filename}"`
                )
                return new Response(response.body, {
                  status: response.status,
                  headers: responseHeaders,
                })
              }
            } catch (error) {
              console.error(`Error downloading from ${provider.name}:`, error)
            }
          }
        }
        console.error(`All download attempts failed for path: ${currentPath}`)
        return new Response(
          'File temporarily unavailable - all storage providers failed',
          { status: 502 }
        )
      }

      default:
        return new Response('Unsupported link type', { status: 500 })
    }
  }

  return new Response('Too many redirects', { status: 508 })
}
