import { requireAuth } from './auth'
import { getLinks } from './db'

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/') {
      if (env.WORKER_ENV === 'development') {
        return Response.redirect(new URL('/dash', request.url), 303)
      }
      return Response.redirect('https://jeremywoolley.com', 308)
    }
    if (url.pathname.startsWith('/api/')) {
      const authResponse = requireAuth(request)
      if (authResponse !== true) {
        return authResponse
      }

      switch (url.pathname) {
        case '/api/links':
          if (request.method !== 'GET') {
            return new Response('Method Not Allowed', { status: 405 })
          }
          try {
            const links = await getLinks(env.DB)
            return new Response(JSON.stringify(links), {
              headers: { 'Content-Type': 'application/json' },
            })
          } catch (error) {
            console.error('Error fetching links:', error)
            return new Response('Internal Server Error', { status: 500 })
          }
      }
    }
    return new Response('Not Found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
