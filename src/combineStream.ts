type StreamInput =
  | string
  | Blob
  | Uint8Array
  | { stream: ReadableStream<Uint8Array>; length: number }

const textEncoder = new TextEncoder()

export class CombineStream extends ReadableStream<Uint8Array> {
  public readonly length: number

  constructor(inputs: StreamInput[]) {
    let totalLength = 0
    const processedInputs: (Uint8Array | ReadableStream<Uint8Array>)[] = []

    for (const input of inputs) {
      if (typeof input === 'string') {
        const encodedInput = textEncoder.encode(input)
        processedInputs.push(encodedInput)
        totalLength += encodedInput.length
      } else if (input instanceof Uint8Array) {
        processedInputs.push(input)
        totalLength += input.length
      } else if (input instanceof Blob) {
        processedInputs.push(input.stream())
        totalLength += input.size
      } else {
        processedInputs.push(input.stream)
        totalLength += input.length
      }
    }

    super({
      async start(controller) {
        try {
          for (const processedInput of processedInputs) {
            if (processedInput instanceof Uint8Array) {
              controller.enqueue(processedInput)
            } else if (processedInput instanceof ReadableStream) {
              const reader = processedInput.getReader()
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                controller.enqueue(value)
              }
            }
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      },
    })

    this.length = totalLength
  }
}
