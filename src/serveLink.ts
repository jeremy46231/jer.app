import { getLinkWithContent } from './db'
import { getGofileContents } from './gofile'

export async function serveLink(
  request: Request<unknown, IncomingRequestCfProperties<unknown>>,
  env: Env
): Promise<Response | undefined> {
  const url = new URL(request.url)
  const path = url.pathname.slice(1)
  const link = await getLinkWithContent(env.DB, path)
  if (!link) return

  switch (link.type) {
    case 'redirect':
      return Response.redirect(link.url, 302)

    case 'inline_file':
      const disposition = link.download ? 'attachment' : 'inline'
      return new Response(link.file, {
        headers: {
          'Content-Type': link.contentType,
          'Content-Disposition': `${disposition}; filename="${link.filename}"`,
        },
      })

    case 'attachment_file':
      try {
        if (link.url.startsWith('https://gofile.io/d/')) {
          const fileStream = await getGofileContents(link.url)
          const disposition = link.download ? 'attachment' : 'inline'
          return new Response(fileStream, {
            headers: {
              'Content-Type': link.contentType,
              'Content-Disposition': `${disposition}; filename="${link.filename}"`,
            },
          })
        }
      } catch (error) {
        console.error('Error fetching Gofile contents:', error)
      }

      // If there's no special handling for the URL, just redirect
      return Response.redirect(link.url, 307)

    default:
      return new Response('Unsupported link type', { status: 500 })
  }
}
