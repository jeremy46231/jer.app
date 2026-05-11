/**
 * Network-dependent tests are opt-in. Set `TEST_NETWORK=1` to enable them.
 *
 * Use with `describe.skipIf(!networkEnabled)(...)` or
 * `test.skipIf(!networkEnabled)(...)` from `bun:test`.
 */
export const networkEnabled = !!process.env.TEST_NETWORK

/** A small (~12 byte) deterministic payload used by network round-trip tests. */
export const SMALL_PAYLOAD = new TextEncoder().encode('hello, jer.app\n')

/** Build a fresh ReadableStream<Uint8Array> from a Uint8Array buffer. */
export function streamFromBuffer(
  bytes: Uint8Array
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

/** Read a ReadableStream into a single concatenated Uint8Array. */
export async function readStream(
  stream: ReadableStream<Uint8Array>
): Promise<Uint8Array> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.length
  }
  return out
}
