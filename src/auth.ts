const encoder = new TextEncoder()

declare global {
  interface SubtleCrypto {
    timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean
  }
}
function timingSafeEqual(a: string, b: string): boolean {
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

export function requireAuth(request: Request, env: Env): Response | true {
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
