// A small, dependency-free User-Agent parser tailored for click notifications.
// It is intentionally not exhaustive; it recognises the mainstream browsers,
// operating systems, and device classes and produces a clean human-readable
// summary rather than a perfectly accurate breakdown.

export interface ParsedUserAgent {
  browser?: string
  browserVersion?: string
  os?: string
  osVersion?: string
  device: 'Desktop' | 'Mobile' | 'Tablet' | 'Bot'
  raw: string
}

// Apple (and to a lesser extent others) freeze the OS/browser version reported
// in the User-Agent string for privacy, so past a certain release the number
// stops moving. When we see one of these frozen sentinels the version tells us
// nothing useful, so we drop it and only show the platform name.
//
// The rock-solid, well-documented one is macOS: every browser on macOS 11+
// still reports "Mac OS X 10_15_7". Add more sentinels here as Apple freezes
// additional Safari/iOS versions.
const FROZEN_VERSIONS: Record<string, Set<string>> = {
  macOS: new Set(['10.15.7']),
}

function isFrozen(
  os: string | undefined,
  version: string | undefined
): boolean {
  if (!os || !version) return false
  return FROZEN_VERSIONS[os]?.has(version) ?? false
}

/** Turn an underscore/dot version like "10_15_7" or "17.4.1" into "10.15.7". */
function normalizeVersion(v: string | undefined): string | undefined {
  if (!v) return undefined
  const cleaned = v.replace(/_/g, '.').replace(/\.$/, '').trim()
  return cleaned || undefined
}

// chrome pads versions like 150.0.0.0, firefox sometimes ships 128.0
// trim the trailing zero segments, e.g. 150.0.0.0 -> 150
function dropTrailingZeros(v: string | undefined): string | undefined {
  if (!v) return v
  const parts = v.split('.')
  while (parts.length > 1 && parts[parts.length - 1] === '0') parts.pop()
  return parts.join('.')
}

function match(ua: string, re: RegExp): string | undefined {
  return dropTrailingZeros(normalizeVersion(ua.match(re)?.[1]))
}

function parseBrowser(ua: string): {
  browser?: string
  browserVersion?: string
} {
  // Order matters: many browsers masquerade as Chrome/Safari, so the more
  // specific tokens must be checked first.
  if (/\bEd(?:g|gA|giOS)\//.test(ua)) {
    return {
      browser: 'Edge',
      browserVersion: match(ua, /Edg(?:A|iOS)?\/([\d.]+)/),
    }
  }
  if (/\b(?:OPR|OPiOS)\//.test(ua) || /\bOpera\//.test(ua)) {
    return {
      browser: 'Opera',
      browserVersion: match(ua, /(?:OPR|OPiOS|Opera)\/([\d.]+)/),
    }
  }
  if (/\bSamsungBrowser\//.test(ua)) {
    return {
      browser: 'Samsung Internet',
      browserVersion: match(ua, /SamsungBrowser\/([\d.]+)/),
    }
  }
  if (/\b(?:Firefox|FxiOS)\//.test(ua)) {
    return {
      browser: 'Firefox',
      browserVersion: match(ua, /(?:Firefox|FxiOS)\/([\d.]+)/),
    }
  }
  if (/\bCriOS\//.test(ua)) {
    return { browser: 'Chrome', browserVersion: match(ua, /CriOS\/([\d.]+)/) }
  }
  if (/\bChrome\//.test(ua)) {
    return { browser: 'Chrome', browserVersion: match(ua, /Chrome\/([\d.]+)/) }
  }
  if (/\bSafari\//.test(ua) && /\bVersion\//.test(ua)) {
    return { browser: 'Safari', browserVersion: match(ua, /Version\/([\d.]+)/) }
  }
  return {}
}

function parseOS(ua: string): { os?: string; osVersion?: string } {
  if (/\bWindows NT\b/.test(ua)) {
    // Windows NT 10.0 covers both Windows 10 and 11; the UA can't distinguish.
    const nt = match(ua, /Windows NT ([\d.]+)/)
    return { os: 'Windows', osVersion: nt === '10' ? undefined : nt }
  }
  if (/\bAndroid\b/.test(ua)) {
    return { os: 'Android', osVersion: match(ua, /Android ([\d.]+)/) }
  }
  if (/\b(?:iPhone|iPad|iPod)\b/.test(ua)) {
    return { os: 'iOS', osVersion: match(ua, /OS ([\d_]+)/) }
  }
  if (/\bMac OS X\b/.test(ua)) {
    return { os: 'macOS', osVersion: match(ua, /Mac OS X ([\d_.]+)/) }
  }
  if (/\bCrOS\b/.test(ua)) {
    return { os: 'ChromeOS' }
  }
  if (/\bLinux\b/.test(ua)) {
    return { os: 'Linux' }
  }
  return {}
}

function parseDevice(ua: string): ParsedUserAgent['device'] {
  if (/\bbot\b|crawler|spider|slurp|curl\/|wget\/|python-|headless/i.test(ua)) {
    return 'Bot'
  }
  if (
    /\biPad\b|\bTablet\b/.test(ua) ||
    (/\bAndroid\b/.test(ua) && !/\bMobile\b/.test(ua))
  ) {
    return 'Tablet'
  }
  if (/\bMobile\b|\biPhone\b|\biPod\b|\bAndroid\b/.test(ua)) {
    return 'Mobile'
  }
  return 'Desktop'
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  const raw = (ua ?? '').trim()
  const { browser, browserVersion } = parseBrowser(raw)
  const { os, osVersion } = parseOS(raw)
  return {
    browser,
    browserVersion,
    os,
    osVersion,
    device: parseDevice(raw),
    raw,
  }
}

const DEVICE_EMOJI: Record<ParsedUserAgent['device'], string> = {
  Desktop: '🖥️',
  Mobile: '📱',
  Tablet: '📱',
  Bot: '🤖',
}

/**
 * A single clean line summarising the parsed User-Agent, e.g.
 * "🖥️ Chrome 126 on Windows" or "📱 Safari on iOS 17.4".
 * Frozen version numbers are omitted.
 */
export function formatUserAgent(ua: string | null | undefined): string {
  const parsed = parseUserAgent(ua)
  if (!parsed.raw) return 'Unknown device'

  const browserPart = parsed.browser
    ? [parsed.browser, parsed.browserVersion].filter(Boolean).join(' ')
    : undefined

  const showOsVersion = !isFrozen(parsed.os, parsed.osVersion)
  const osPart = parsed.os
    ? [parsed.os, showOsVersion ? parsed.osVersion : undefined]
        .filter(Boolean)
        .join(' ')
    : undefined

  const platform = [browserPart, osPart].filter(Boolean).join(' on ')
  const label = platform || 'Unknown device'
  return `${DEVICE_EMOJI[parsed.device]} ${label}`
}
