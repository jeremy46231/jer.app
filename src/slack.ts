import type { LinkWithContent } from '../shared-types'
import { formatUserAgent } from './userAgent'

// Sends a Slack message whenever a link with notifications enabled is clicked.
//
// Configuration (all read from `env`, set them as Cloudflare secrets or in
// `.dev.vars` for local dev):
//   SLACK_BOT_TOKEN  — the bot token, starts with "xoxb-"
//   SLACK_CHANNEL_ID — the channel to post in, e.g. "C0123456789"
//   SLACK_USER_ID    — your own user id, e.g. "U0123456789" (used for @-pings)

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

function locationLine(cf: IncomingRequestCfProperties | undefined): string {
  if (!cf) return 'Unknown'
  const parts = [cf.city, cf.region, cf.country].filter(
    (p): p is string => typeof p === 'string' && p.length > 0
  )
  const flag = flagEmoji(
    typeof cf.country === 'string' ? cf.country : undefined
  )
  const place = parts.length > 0 ? parts.join(', ') : 'Unknown'
  return flag ? `${flag} ${place}` : place
}

interface SlackField {
  type: 'mrkdwn'
  text: string
}

function field(label: string, value: string): SlackField {
  return { type: 'mrkdwn', text: `*${label}*\n${value}` }
}

/**
 * Build and send the Slack notification for a click. Never throws — failures
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
      ? `→ ${esc(link.url)}`
      : `📄 ${esc(link.filename)} (${esc(link.contentType)})`

  const referer = request.headers.get('Referer')
  const network =
    cf && typeof cf.asOrganization === 'string' ? cf.asOrganization : undefined

  const fields: SlackField[] = [
    field('Destination', destination),
    field('Location', locationLine(cf)),
    field('IP address', `\`${esc(ip)}\``),
    field('Device', esc(formatUserAgent(request.headers.get('User-Agent')))),
  ]
  if (network) fields.push(field('Network', esc(network)))
  if (referer) fields.push(field('Referrer', esc(referer)))

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
