import { getLinkWithContent } from './db'
import { downloadGofile } from './storage/gofile'

export async function serveLink(
  request: Request<unknown, IncomingRequestCfProperties<unknown>>,
  env: Env
): Promise<Response | undefined> {
  const url = new URL(request.url)
  const path = decodeURIComponent(url.pathname.slice(1))
  const link = await getLinkWithContent(env.DB, path)
  if (!link) return

  switch (link.type) {
    case 'redirect': {
      return Response.redirect(link.url, 302)
    }
    case 'inline_file': {
      const disposition = link.download ? 'attachment' : 'inline'
      return new Response(link.file, {
        headers: {
          'Content-Type': link.contentType,
          'Content-Disposition': `${disposition}; filename="${link.filename}"`,
        },
      })
    }
    case 'attachment_file': {
      const disposition = link.download ? 'attachment' : 'inline'
      if (link.url.startsWith('https://gofile.io/d/')) {
        try {
          const fileResponse = await downloadGofile(link.url, request.headers)

          const responseHeaders = new Headers(fileResponse.headers)
          responseHeaders.set('Content-Type', link.contentType)
          responseHeaders.set(
            'Content-Disposition',
            `${disposition}; filename="${link.filename}"`
          )
          return new Response(fileResponse.body, {
            headers: responseHeaders,
          })
        } catch (error) {
          console.error('Error fetching Gofile contents:', error)
        }
      }

      const proxiedPrefixes = [
        'https://hc-cdn.hel1.your-objectstorage.com/',
        'https://files.catbox.moe',
        'https://litter.catbox.moe',
      ]
      if (proxiedPrefixes.some((prefix) => link.url.startsWith(prefix))) {
        try {
          const response = await fetch(link.url, {
            headers: request.headers,
          })

          const responseHeaders = new Headers(response.headers)
          responseHeaders.set('Content-Type', link.contentType)
          responseHeaders.set(
            'Content-Disposition',
            `${disposition}; filename="${link.filename}"`
          )
          return new Response(response.body, {
            headers: responseHeaders,
          })
        } catch (error) {
          console.error('Error fetching upstream contents:', error)
        }
      }

      // If there's no special handling for the URL, just redirect
      return Response.redirect(link.url, 307)
    }
    default: {
      return new Response('Unsupported link type', { status: 500 })
    }
  }
}
