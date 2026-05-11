import { describe, expect, test } from 'bun:test'
import { CombineStream } from '../src/combineStream'
import { readStream, streamFromBuffer } from './helpers/network'

const td = new TextDecoder()
const te = new TextEncoder()

describe('CombineStream', () => {
  test('returns an empty stream for an empty input list', async () => {
    const out = await readStream(CombineStream([]))
    expect(out.length).toBe(0)
  })

  test('joins string chunks in order', async () => {
    const out = await readStream(CombineStream(['hello, ', 'world', '!']))
    expect(td.decode(out)).toBe('hello, world!')
  })

  test('joins Uint8Array chunks', async () => {
    const out = await readStream(
      CombineStream([new Uint8Array([1, 2]), new Uint8Array([3, 4, 5])])
    )
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5])
  })

  test('joins Blob chunks', async () => {
    const out = await readStream(
      CombineStream([new Blob(['abc']), new Blob(['def'])])
    )
    expect(td.decode(out)).toBe('abcdef')
  })

  test('joins {stream, length} chunks', async () => {
    const payload = te.encode('streamed bytes')
    const out = await readStream(
      CombineStream([
        '<<',
        { stream: streamFromBuffer(payload), length: payload.length },
        '>>',
      ])
    )
    expect(td.decode(out)).toBe('<<streamed bytes>>')
  })

  test('mixes all input flavours together preserving order', async () => {
    const middle = te.encode('MIDDLE')
    const out = await readStream(
      CombineStream([
        'A:',
        new Uint8Array([0x42]), // 'B'
        ':',
        new Blob(['C']),
        ':',
        { stream: streamFromBuffer(middle), length: middle.length },
        ':END',
      ])
    )
    expect(td.decode(out)).toBe('A:B:C:MIDDLE:END')
  })

  test('handles a multi-chunk inner stream', async () => {
    const innerStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(te.encode('one '))
        controller.enqueue(te.encode('two '))
        controller.enqueue(te.encode('three'))
        controller.close()
      },
    })

    const out = await readStream(
      CombineStream([{ stream: innerStream, length: 13 }])
    )
    expect(td.decode(out)).toBe('one two three')
  })
})
