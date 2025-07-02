type StreamInput =
  | string
  | Blob
  | Uint8Array
  | { stream: ReadableStream<Uint8Array>; length: number }

const textEncoder = new TextEncoder()

/**
 * Combines multiple string/Blob/Uint8Array/stream inputs into a single
 * fixed-length ReadableStream, so that Cloudflare Workers will automatically
 * set a Content-Length header.
 */
export function CombineStream(
  inputs: StreamInput[]
): ReadableStream<Uint8Array> {
  let totalLength = 0
  const processed: (Uint8Array | ReadableStream<Uint8Array>)[] = []

  for (const input of inputs) {
    if (typeof input === 'string') {
      const buf = textEncoder.encode(input)
      processed.push(buf)
      totalLength += buf.byteLength
    } else if (input instanceof Uint8Array) {
      processed.push(input)
      totalLength += input.byteLength
    } else if (input instanceof Blob) {
      processed.push(input.stream())
      totalLength += input.size
    } else {
      // { stream, length }
      processed.push(input.stream)
      totalLength += input.length
    }
  }

  const { writable, readable } = new FixedLengthStream(totalLength)

  ;(async () => {
    const writer = writable.getWriter()
    try {
      for (const chunkOrStream of processed) {
        if (chunkOrStream instanceof Uint8Array) {
          await writer.write(chunkOrStream)
        } else {
          const reader = chunkOrStream.getReader()
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            await writer.write(value)
          }
        }
      }
    } finally {
      await writer.close()
    }
  })()

  const stream = readable as ReadableStream<Uint8Array>
  return stream
}
