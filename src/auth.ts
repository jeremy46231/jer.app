const encoder = new TextEncoder()

function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)
  if (aBytes.byteLength !== bBytes.byteLength) return false
  return crypto.subtle.timingSafeEqual(aBytes, bBytes)
}

function getSessionCookie(request: Request): string | null {
  const cookie = request.headers.get('Cookie') ?? ''
  const match = cookie.match(/(?:^|;\s*)session=([^;]+)/)
  return match?.[1] ?? null
}

export function sessionCookie(password: string, request: Request): string {
  const secure = new URL(request.url).protocol === 'https:'
  return `session=${password}; HttpOnly; ${secure ? 'Secure; ' : ''}SameSite=Strict; Max-Age=31536000; Path=/`
}

export function clearSessionCookie(): string {
  return `session=; HttpOnly; SameSite=Strict; Max-Age=0; Path=/`
}

export function requireAuth(request: Request, env: Env): Response | true {
  if (!env.ADMIN_PASSWORD) {
    console.warn('No ADMIN_PASSWORD set. Skipping authentication.')
    return true
  }

  const token = getSessionCookie(request)
  if (!token || !timingSafeEqual(token, env.ADMIN_PASSWORD)) {
    return new Response('Unauthorized', { status: 401 })
  }
  return true
}

export function checkPassword(candidate: string, env: Env): boolean {
  if (!env.ADMIN_PASSWORD) return false
  return timingSafeEqual(candidate, env.ADMIN_PASSWORD)
}
