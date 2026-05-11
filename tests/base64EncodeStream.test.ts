import { describe, expect, test } from 'bun:test'
import { Base64EncodeStream } from '../src/base64EncodeStream'

const td = new TextDecoder()

async function encodeViaStream(
  ...chunks: (Uint8Array | string)[]
): Promise<string> {
  const encoder = new TextEncoder()
  const inputStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      for (const c of chunks) {
        controller.enqueue(typeof c === 'string' ? encoder.encode(c) : c)
      }
      controller.close()
    },
  })

  const out = inputStream.pipeThrough(new Base64EncodeStream())

  const reader = out.getReader()
  const parts: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
  }
  const total = parts.reduce((n, p) => n + p.length, 0)
  const merged = new Uint8Array(total)
  let off = 0
  for (const p of parts) {
    merged.set(p, off)
    off += p.length
  }
  return td.decode(merged)
}

function btoaUtf8(s: string): string {
  const bytes = new TextEncoder().encode(s)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

describe('Base64EncodeStream', () => {
  test('encodes the empty stream to the empty string', async () => {
    expect(await encodeViaStream()).toBe('')
  })

  test('matches btoa() for ASCII input', async () => {
    const input = 'hello, world!'
    expect(await encodeViaStream(input)).toBe(btoa(input))
  })

  test('matches btoa() across many chunk boundaries', async () => {
    const input = 'The quick brown fox jumps over the lazy dog.'
    const bytes = new TextEncoder().encode(input)

    const expected = btoa(input)

    // Split into 1-byte chunks to stress the leftover machinery.
    const oneByte = await encodeViaStream(
      ...Array.from(bytes, (b) => new Uint8Array([b]))
    )
    expect(oneByte).toBe(expected)

    // Split into 2-byte chunks (also exercises 1- and 2-byte leftovers).
    const twoByte: Uint8Array[] = []
    for (let i = 0; i < bytes.length; i += 2) {
      twoByte.push(bytes.subarray(i, i + 2))
    }
    expect(await encodeViaStream(...twoByte)).toBe(expected)
  })

  test('handles arbitrary ASCII bytes (0..127)', async () => {
    const bytes = new Uint8Array(128)
    for (let i = 0; i < 128; i++) bytes[i] = i

    let bin = ''
    for (const b of bytes) bin += String.fromCharCode(b)
    const expected = btoa(bin)

    expect(await encodeViaStream(bytes)).toBe(expected)
  })

  test('handles arbitrary binary bytes (0..255)', async () => {
      const bytes = new Uint8Array(256)
      for (let i = 0; i < 256; i++) bytes[i] = i

      let bin = ''
      for (const b of bytes) bin += String.fromCharCode(b)
      const expected = btoa(bin)

      expect(await encodeViaStream(bytes)).toBe(expected)
  })

  test('produces correct padding for inputs of length % 3 == 1', async () => {
    // 'A' encodes to 'QQ==' (1 byte -> 2 chars + 2 padding)
    expect(await encodeViaStream('A')).toBe('QQ==')
  })

  test('produces correct padding for inputs of length % 3 == 2', async () => {
    // 'AB' encodes to 'QUI=' (2 bytes -> 3 chars + 1 padding)
    expect(await encodeViaStream('AB')).toBe('QUI=')
  })

  test('produces no padding for inputs of length % 3 == 0', async () => {
    expect(await encodeViaStream('ABC')).toBe('QUJD')
  })

  test('matches btoa() for UTF-8-encoded multibyte text', async () => {
    const text = '🐈‍⬛ jer.app'
    expect(await encodeViaStream(text)).toBe(btoaUtf8(text))
  })
})
