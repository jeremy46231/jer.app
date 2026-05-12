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

function buildExternalUrl(
  target: string,
  remainder: string,
  search: string
): string {
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

      case 'file': {
        if (remainder !== '') return undefined
        if (link.locations.length === 0) {
          console.error(
            `No storage providers registered for path: ${currentPath}`
          )
          return new Response(
            'File unavailable - no storage providers registered for this link',
            { status: 502 }
          )
        }
        console.log(
          `Serving file ${currentPath}; locations: [${link.locations.join(', ') || '(none)'}]`
        )
        const attempts: string[] = []
        for (const provider of downloadPriority) {
          if (!provider.has(link)) continue
          attempts.push(provider.id)
          try {
            console.log(
              `Attempting download from ${provider.name} (${provider.id}) url=${provider.getUrl(link) ?? '(inline)'}`
            )
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
            console.error(
              `Provider ${provider.name} (${provider.id}) returned null for ${currentPath}`
            )
          } catch (error) {
            console.error(`Error downloading from ${provider.name}:`, error)
          }
        }
        console.error(
          `All download attempts failed for path: ${currentPath}; tried: [${attempts.join(', ')}]; locations: [${link.locations.join(', ')}]`
        )
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
