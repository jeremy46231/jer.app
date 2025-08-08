import { getLinkWithContent } from './db'
import { downloadPriority } from './storage/providers'

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
      // Try downloading from each provider in priority order
      for (const provider of downloadPriority) {
        if (provider.has(link)) {
          try {
            console.log(
              `Attempting download from ${provider.name} (${provider.id})`
            )
            const response = await provider.download(link, request.headers)
            if (response) {
              // Update response headers to match our link metadata
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
            // Continue to next provider
          }
        }
      }

      // If all providers failed, return 502 Bad Gateway
      console.error(`All download attempts failed for path: ${path}`)
      return new Response(
        'File temporarily unavailable - all storage providers failed',
        {
          status: 502,
        }
      )
    }
    default: {
      return new Response('Unsupported link type', { status: 500 })
    }
  }
}
