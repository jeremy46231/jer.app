import { handleAPI } from './api'
import {
  requireAuth,
  checkPassword,
  sessionCookie,
  clearSessionCookie,
} from './auth'
import { serveLink } from './serveLink'

export default {
  async fetch(request, env, ctx): Promise<Response> {
    try {
      const url = new URL(request.url)

      if (url.pathname === '/logout') {
        return new Response(null, {
          status: 303,
          headers: {
            'Location': '/login.html',
            'Set-Cookie': clearSessionCookie(),
          },
        })
      }

      if (url.pathname === '/api/login' && request.method === 'POST') {
        const form = await request.formData()
        const password = form.get('password')
        if (typeof password === 'string' && checkPassword(password, env)) {
          return new Response(null, {
            status: 303,
            headers: {
              'Location': '/dash',
              'Set-Cookie': sessionCookie(env.ADMIN_PASSWORD, request),
            },
          })
        }
        return new Response(null, {
          status: 303,
          headers: { Location: '/login.html?error=1' },
        })
      }

      if (url.pathname === '/dash') {
        const authResult = requireAuth(request, env)
        if (authResult !== true) {
          return Response.redirect(new URL('/login', request.url).href, 303)
        }
      }

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

      return env.ASSETS
        ? env.ASSETS.fetch(request)
        : new Response('Not Found', { status: 404 })
    } catch (error) {
      console.error('Error in fetch handler:', error)
      return new Response('Internal Server Error', { status: 500 })
    }
  },
} satisfies ExportedHandler<Env>
