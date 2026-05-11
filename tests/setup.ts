/**
 * Global preload for the Bun test runner.
 *
 * The production code targets the Cloudflare Workers runtime which exposes a
 * couple of non-standard globals. Bun (and Node) do not have them, so we
 * polyfill the surface that the codebase actually uses.
 */

// ---------------------------------------------------------------------------
// FixedLengthStream
// ---------------------------------------------------------------------------
//
// In Workers, `new FixedLengthStream(n)` returns an object that behaves like a
// `TransformStream<Uint8Array>` but additionally signals the runtime to set a
// `Content-Length` header when the stream is used as a request/response body.
// We don't need that side-effect for unit tests; a plain `TransformStream`
// suffices.
declare global {
  // eslint-disable-next-line no-var
  var FixedLengthStream:
    | (new (length: number | bigint) => TransformStream<Uint8Array, Uint8Array>)
    | undefined
}

if (typeof (globalThis as any).FixedLengthStream === 'undefined') {
  ;(globalThis as any).FixedLengthStream = class FixedLengthStream<
    I = Uint8Array,
    O = Uint8Array,
  > extends TransformStream<I, O> {
    constructor(_length: number | bigint) {
      super()
    }
  }
}

// ---------------------------------------------------------------------------
// crypto.subtle.timingSafeEqual
// ---------------------------------------------------------------------------
//
// Workers exposes a synchronous, constant-time equality check on
// `crypto.subtle`. The standard WebCrypto API doesn't define one, so we add a
// drop-in replacement.
const subtle = (globalThis.crypto as unknown as { subtle: any }).subtle
if (subtle && typeof subtle.timingSafeEqual !== 'function') {
  subtle.timingSafeEqual = (
    a: ArrayBuffer | ArrayBufferView,
    b: ArrayBuffer | ArrayBufferView
  ): boolean => {
    const aBytes = toUint8(a)
    const bBytes = toUint8(b)
    if (aBytes.byteLength !== bBytes.byteLength) return false
    let diff = 0
    for (let i = 0; i < aBytes.byteLength; i++) {
      diff |= aBytes[i]! ^ bBytes[i]!
    }
    return diff === 0
  }
}

function toUint8(input: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (input instanceof Uint8Array) return input
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength)
  }
  return new Uint8Array(input)
}

export {}
