const encoder = new TextEncoder()
function timingSafeEqual(a: string, b: string) {
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)

  if (aBytes.byteLength !== bBytes.byteLength) {
    return false
  }

  return crypto.subtle.timingSafeEqual(aBytes, bBytes)
}

function unauthorized(text = 'Unauthorized'): Response {
  return new Response(text, {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Restricted Area"',
    },
  })
}

function requireAuth(request: Request): Response | true {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader) {
    return unauthorized()
  }
  const [scheme, encoded] = authHeader.split(' ')
  if (scheme !== 'Basic' || !encoded) {
    return unauthorized('Invalid Authorization Scheme')
  }
  const decoded = atob(encoded)
  const colonIndex = decoded.indexOf(':')
  if (colonIndex === -1) {
    return unauthorized('Invalid Credentials Format')
  }
  const username = decoded.slice(0, colonIndex)
  const password = decoded.slice(colonIndex + 1)
  if (
    !timingSafeEqual(username, 'jeremy') ||
    !timingSafeEqual(password, '123')
  ) {
    return unauthorized('Invalid Username or Password')
  }
  return true
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/') {
      return Response.redirect('https://jeremywoolley.com', 308)
    }
    if (url.pathname.startsWith('/api/')) {
      const authResponse = requireAuth(request)
      if (authResponse !== true) {
        return authResponse
      }

      switch (url.pathname.replace('/api/', '')) {
        case 'hello':
          return new Response(JSON.stringify({ message: 'Hello, World!' }), {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            },
          })
      }
    }
    return new Response('Not Found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
