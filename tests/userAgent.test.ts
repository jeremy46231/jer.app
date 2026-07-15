import { describe, expect, test } from 'bun:test'
import { parseUserAgent, formatUserAgent } from '../src/userAgent'

describe('parseUserAgent', () => {
  test('Chrome on Windows desktop', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    const p = parseUserAgent(ua)
    expect(p.browser).toBe('Chrome')
    expect(p.browserVersion).toBe('126.0.0.0')
    expect(p.os).toBe('Windows')
    expect(p.osVersion).toBeUndefined() // NT 10.0 is ambiguous (Win 10/11)
    expect(p.device).toBe('Desktop')
  })

  test('Safari on macOS reports the frozen 10.15.7 version', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15'
    const p = parseUserAgent(ua)
    expect(p.browser).toBe('Safari')
    expect(p.browserVersion).toBe('17.4.1')
    expect(p.os).toBe('macOS')
    expect(p.osVersion).toBe('10.15.7')
    expect(p.device).toBe('Desktop')
  })

  test('Safari on iPhone', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
    const p = parseUserAgent(ua)
    expect(p.browser).toBe('Safari')
    expect(p.os).toBe('iOS')
    expect(p.osVersion).toBe('17.4')
    expect(p.device).toBe('Mobile')
  })

  test('Chrome on Android phone', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
    const p = parseUserAgent(ua)
    expect(p.browser).toBe('Chrome')
    expect(p.os).toBe('Android')
    expect(p.osVersion).toBe('14')
    expect(p.device).toBe('Mobile')
  })

  test('Android tablet (no Mobile token)', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(parseUserAgent(ua).device).toBe('Tablet')
  })

  test('Edge is detected before Chrome', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0'
    expect(parseUserAgent(ua).browser).toBe('Edge')
  })

  test('Firefox on Linux', () => {
    const ua =
      'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0'
    const p = parseUserAgent(ua)
    expect(p.browser).toBe('Firefox')
    expect(p.browserVersion).toBe('127.0')
    expect(p.os).toBe('Linux')
  })

  test('curl is classified as a bot', () => {
    expect(parseUserAgent('curl/8.4.0').device).toBe('Bot')
  })
})

describe('formatUserAgent', () => {
  test('omits the frozen macOS version', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15'
    expect(formatUserAgent(ua)).toBe('Safari 17.4.1 on macOS · Desktop')
  })

  test('shows a real OS version', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
    expect(formatUserAgent(ua)).toBe('Safari 17.4 on iOS 17.4 · Mobile')
  })

  test('handles an empty user agent', () => {
    expect(formatUserAgent('')).toBe('Unknown device')
    expect(formatUserAgent(null)).toBe('Unknown device')
  })
})
