import { handleAPI } from './api'
import { serveLink } from './serveLink'

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      const url = new URL(request.url)
      if (url.pathname === '/') {
        if (env.REDIRECT_URL) {
          return Response.redirect(env.REDIRECT_URL, 308)
        }
        return Response.redirect(new URL('/dash', request.url).href, 303)
      }

      if (url.pathname.startsWith('/api/')) {
        return await handleAPI(request, env)
      }

      const linkResponse = await serveLink(request, env)
      if (linkResponse) {
        return linkResponse
      }

      return new Response('Not Found', { status: 404 })
    } catch (error) {
      console.error('Error in fetch handler:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  },
} satisfies ExportedHandler<Env>
