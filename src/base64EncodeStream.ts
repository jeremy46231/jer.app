const latin1Decoder = new TextDecoder('latin1')
const utf8Encoder = new TextEncoder()

export class Base64EncodeStream {
  private leftover = new Uint8Array(0) // mmm leftovers
  public readonly transform: TransformStream<Uint8Array, Uint8Array>

  constructor() {
    this.transform = new TransformStream<Uint8Array, Uint8Array>({
      transform: (chunk, controller) => {
        // prepend leftover from last chunk
        const input = new Uint8Array(this.leftover.length + chunk.length)
        input.set(this.leftover, 0)
        input.set(chunk, this.leftover.length)

        // only encode full 3-byte groups; leave up to 2 bytes as new leftover
        const completeLen = input.length - (input.length % 3)
        const toEncode = input.subarray(0, completeLen)
        this.leftover = input.subarray(completeLen)

        // decode raw bytes as latin-1, then btoa -> UTF-8
        const latin1str = latin1Decoder.decode(toEncode)
        const b64 = btoa(latin1str)
        controller.enqueue(utf8Encoder.encode(b64))
      },

      flush: (controller) => {
        if (this.leftover.length > 0) {
          const latin1str = latin1Decoder.decode(this.leftover)
          const b64 = btoa(latin1str) // this will correctly handle padding
          controller.enqueue(utf8Encoder.encode(b64))
        }
      },
    })
  }

  // so you can do `stream.pipeThrough()`
  get readable() {
    return this.transform.readable
  }

  get writable() {
    return this.transform.writable
  }
}
