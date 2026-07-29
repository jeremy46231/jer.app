import type { LinkWithContent } from '../shared-types'
import { formatUserAgent } from './userAgent'

// Sends a Slack message whenever a link with notifications enabled is clicked.
//
// Configuration (all read from `env`, set them as Cloudflare secrets or in
// `.dev.vars` for local dev):
//   SLACK_BOT_TOKEN: the bot token, starts with "xoxb-"
//   SLACK_CHANNEL_ID: the channel to post in, e.g. "C0123456789"
//   SLACK_USER_ID: your own user id, e.g. "U0123456789" (used for @-pings)

interface SlackEnv {
  SLACK_BOT_TOKEN?: string
  SLACK_CHANNEL_ID?: string
  SLACK_USER_ID?: string
}

/** Escape the three characters that are special in Slack mrkdwn text. */
function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Turn a 2-letter ISO country code into its flag emoji. */
function flagEmoji(cc: string | undefined): string {
  if (!cc || cc.length !== 2 || !/^[a-z]{2}$/i.test(cc)) return ''
  const base = 0x1f1e6
  return String.fromCodePoint(
    ...[...cc.toUpperCase()].map((c) => base + c.charCodeAt(0) - 65)
  )
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function locationLine(cf: IncomingRequestCfProperties | undefined): string {
  if (!cf) return 'Unknown'
  const parts = [cf.city, cf.region, cf.country].filter(
    (p): p is string => typeof p === 'string' && p.length > 0
  )
  const flag = flagEmoji(
    typeof cf.country === 'string' ? cf.country : undefined
  )
  const place = parts.length > 0 ? parts.join(', ') : 'Unknown'
  const withTimezone = str(cf.timezone) ? `${place} (${cf.timezone})` : place
  return flag ? `${flag} ${withTimezone}` : withTimezone
}

// slack mrkdwn link syntax is <url|text>, not markdown's [text](url)
function mapLink(
  cf: IncomingRequestCfProperties | undefined
): string | undefined {
  const lat = str(cf?.latitude)
  const lon = str(cf?.longitude)
  if (!lat || !lon) return undefined
  return `<https://www.google.com/maps?q=${lat},${lon}|📍 Open in Maps>`
}

function networkLine(
  cf: IncomingRequestCfProperties | undefined
): string | undefined {
  const org = str(cf?.asOrganization)
  const asn =
    typeof cf?.asn === 'number' && cf.asn > 0 ? `AS${cf.asn}` : undefined
  if (org && asn) return `${org} (${asn})`
  return org ?? asn
}

function connectionLine(
  cf: IncomingRequestCfProperties | undefined
): string | undefined {
  const protocol = str(cf?.httpProtocol)
  const tls = str(cf?.tlsVersion)?.replace(/^TLSv/, 'TLS ')
  const parts = [protocol, tls].filter((p): p is string => p !== undefined)
  return parts.length > 0 ? parts.join(', ') : undefined
}

// cloudflare's bot score: 1 means certainly a bot, 99 means certainly human
// only populated with bot fight mode / bot management enabled on the zone,
// so it's frequently absent on the free plan
function botLine(
  cf: IncomingRequestCfProperties | undefined
): string | undefined {
  const score = cf?.botManagement?.score
  if (typeof score !== 'number') return undefined
  const verified = cf?.botManagement?.verifiedBot
    ? ' (verified bot)'
    : score <= 30
      ? ' 🤖'
      : ''
  return `${score}/99${verified}`
}

interface SlackField {
  type: 'mrkdwn'
  text: string
}

function field(label: string, value: string): SlackField {
  return { type: 'mrkdwn', text: `*${label}*\n${value}` }
}

/**
 * Build and send the Slack notification for a click. Never throws: failures
 * are logged so they can't break the redirect/download the user is waiting on.
 * Intended to be run via `ctx.waitUntil`.
 */
export async function sendClickNotification(
  env: SlackEnv,
  request: Request<unknown, IncomingRequestCfProperties<unknown>>,
  link: LinkWithContent
): Promise<void> {
  const token = env.SLACK_BOT_TOKEN
  const channel = env.SLACK_CHANNEL_ID
  if (!token || !channel) {
    console.warn(
      'Link notification requested but SLACK_BOT_TOKEN / SLACK_CHANNEL_ID are not configured; skipping.'
    )
    return
  }

  const url = new URL(request.url)
  const clickedPath = decodeURIComponent(url.pathname)
  const cf = request.cf
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    'Unknown'

  const destination =
    link.type === 'redirect'
      ? `-> ${esc(link.url)}`
      : `📄 ${esc(link.filename)} (${esc(link.contentType)})`

  const referer = request.headers.get('Referer')
  const acceptLanguage = request.headers.get('Accept-Language')
  const network = networkLine(cf)
  const connection = connectionLine(cf)
  const bot = botLine(cf)
  const map = mapLink(cf)
  const rawUserAgent = request.headers.get('User-Agent')

  const fields: SlackField[] = [
    field('Destination', destination),
    field('Location', locationLine(cf)),
    field('IP address', `\`${esc(ip)}\``),
    field('Device', esc(formatUserAgent(rawUserAgent))),
  ]
  if (map) fields.push(field('Map', map))
  if (network) fields.push(field('Network', esc(network)))
  if (acceptLanguage) fields.push(field('Language', esc(acceptLanguage)))
  if (connection) fields.push(field('Connection', esc(connection)))
  if (bot) fields.push(field('Bot score', esc(bot)))
  if (referer) fields.push(field('Referrer', esc(referer)))
  if (rawUserAgent) fields.push(field('User-Agent', `\`${esc(rawUserAgent)}\``))

  const nowSeconds = Math.floor(Date.now() / 1000)

  const ping =
    link.notifyPing && env.SLACK_USER_ID ? `<@${env.SLACK_USER_ID}> ` : ''
  const fallbackText = `${ping}🔗 Link clicked: ${clickedPath}`

  const blocks: unknown[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${ping}🔗 *Link clicked:* \`${esc(clickedPath)}\``,
      },
    },
    { type: 'section', fields },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `<!date^${nowSeconds}^{date_short_pretty} at {time}|just now>`,
        },
      ],
    },
  ]

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel,
        text: fallbackText,
        blocks,
        unfurl_links: false,
        unfurl_media: false,
      }),
    })
    const body = (await res.json()) as { ok: boolean; error?: string }
    if (!body.ok) {
      console.error(
        `Slack notification failed: ${body.error ?? 'unknown error'}`
      )
    }
  } catch (error) {
    console.error('Error sending Slack notification:', error)
  }
}
